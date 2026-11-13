//! Contract-level unit tests using the mocked NEAR runtime.
//! Cross-contract promises are not executed here; see `tests/` for workspace tests.

use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, AccountId, NearToken, PromiseResult};

const WNEAR: u128 = 1_000_000_000_000_000_000_000_000;
const USDC: u128 = 1_000_000;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn owner() -> AccountId {
    acc("owner.testnet")
}
fn wnear() -> AccountId {
    acc("wrap.testnet")
}
fn usdc() -> AccountId {
    acc("usdc.testnet")
}
fn priya() -> AccountId {
    acc("priya.testnet")
}
fn arjun() -> AccountId {
    acc("arjun.testnet")
}
fn rahul() -> AccountId {
    acc("rahul.testnet")
}
fn cents(c: u128) -> u128 {
    c * USDC / 100 * curve::PRICE_SCALE
}

fn call(predecessor: AccountId, deposit: NearToken) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(acc("book.testnet"))
        .predecessor_account_id(predecessor)
        .attached_deposit(deposit)
        .prepaid_gas(Gas::from_tgas(300))
        .build());
}

fn setup() -> Ebbflow {
    call(owner(), NearToken::from_yoctonear(0));
    let mut c = Ebbflow::new(owner());
    c.add_market(wnear(), usdc(), 24, 6);
    for a in [priya(), arjun(), rahul()] {
        call(a.clone(), STORAGE_MIN);
        c.storage_deposit(None, None);
    }
    c
}

fn deposit(c: &mut Ebbflow, who: AccountId, token: AccountId, amount: u128) {
    call(token, NearToken::from_yoctonear(0));
    let r = c.ft_on_transfer(who, U128(amount), r#"{"action":"deposit"}"#.into());
    assert!(matches!(r, PromiseOrValue::Value(U128(0))));
}

fn side(amount: u128, start: u128, end: u128, alpha: u8) -> SideInput {
    SideInput { amount: U128(amount), start_price: U128(start), end_price: U128(end), alpha }
}

/// Priya: ask 400 wNEAR $5.04→$5.20, bid 2,000 USDC $4.96→$4.80, alpha 1. Arjun: limit 100 @ $5.06.
fn seeded() -> (Ebbflow, u64, u64) {
    let mut c = setup();
    deposit(&mut c, priya(), wnear(), 400 * WNEAR);
    deposit(&mut c, priya(), usdc(), 2_000 * USDC);
    deposit(&mut c, arjun(), wnear(), 100 * WNEAR);
    call(priya(), POSITION_STORAGE);
    let p = c
        .create_position(
            0,
            Some(side(400 * WNEAR, cents(504), cents(520), 1)),
            Some(side(2_000 * USDC, cents(496), cents(480), 1)),
        )
        .0;
    call(arjun(), POSITION_STORAGE);
    let a = c.create_position(0, Some(side(100 * WNEAR, cents(506), cents(506), 0)), None).0;
    (c, p, a)
}

fn swap_msg(side: SwapSide, legs: &[(u64, u128)], min_out: u128) -> String {
    serde_json::to_string(&json!({
        "action": "swap",
        "market_id": 0,
        "side": side,
        "legs": legs.iter().map(|(id, b)| json!({"position_id": id.to_string(), "base_amount": b.to_string()})).collect::<Vec<_>>(),
        "min_amount_out": min_out.to_string(),
    }))
    .unwrap()
}

fn swap(c: &mut Ebbflow, token: AccountId, taker: AccountId, amount: u128, msg: String) -> u128 {
    call(token, NearToken::from_yoctonear(0));
    match c.ft_on_transfer(taker, U128(amount), msg) {
        PromiseOrValue::Value(v) => v.0,
        _ => panic!("expected value"),
    }
}

fn rejected_reason() -> Option<String> {
    get_logs().iter().find(|l| l.contains("swap_rejected")).map(|l| l.to_string())
}

const PRIYA_BASE: u128 = 141_421_356_237_309_504_880_168_872;

#[test]
fn deposit_create_close_round_trip() {
    let (mut c, p, _) = seeded();
    assert_eq!(c.get_balance(priya(), wnear()).0, 0);
    call(priya(), NearToken::from_yoctonear(1));
    c.close_position(U64(p));
    assert_eq!(c.get_balance(priya(), wnear()).0, 400 * WNEAR);
    assert_eq!(c.get_balance(priya(), usdc()).0, 2_000 * USDC);
    assert!(c.get_position(U64(p)).is_none());
}

#[test]
fn deposit_from_unregistered_is_refunded() {
    let mut c = setup();
    call(usdc(), NearToken::from_yoctonear(0));
    let r = c.ft_on_transfer(acc("stranger.testnet"), U128(5), r#"{"action":"deposit"}"#.into());
    assert!(matches!(r, PromiseOrValue::Value(U128(5))));
}

// TST-I12
#[test]
fn unknown_token_is_refunded() {
    let mut c = setup();
    call(acc("fake.testnet"), NearToken::from_yoctonear(0));
    let r = c.ft_on_transfer(priya(), U128(7), r#"{"action":"deposit"}"#.into());
    assert!(matches!(r, PromiseOrValue::Value(U128(7))));
    assert_eq!(c.get_balance(priya(), acc("fake.testnet")).0, 0);
}

#[test]
fn invalid_msg_is_refunded() {
    let mut c = setup();
    call(usdc(), NearToken::from_yoctonear(0));
    let r = c.ft_on_transfer(priya(), U128(9), "not json".into());
    assert!(matches!(r, PromiseOrValue::Value(U128(9))));
}

// TST-I4 + TST-U10 + TST-U7: Rahul buys 200 wNEAR across Priya and Arjun.
#[test]
fn two_maker_route_settles_with_recycling_and_refund() {
    let (mut c, p, a) = seeded();
    let msg = swap_msg(SwapSide::BuyBase, &[(p, PRIYA_BASE), (a, 200 * WNEAR - PRIYA_BASE)], 200 * WNEAR);
    let attached = 1_015_170_000;
    let unused = swap(&mut c, usdc(), rahul(), attached, msg);
    assert!(rejected_reason().is_none(), "{:?}", get_logs());

    let spent = attached - unused;
    assert!(spent.abs_diff(1_010_111_000) < 20_000, "spent {spent}");

    let pv = c.get_position(U64(p)).unwrap();
    let ask = pv.ask.unwrap();
    let bid = pv.bid.unwrap();
    assert_eq!(ask.remaining, 400 * WNEAR - PRIYA_BASE);
    assert!(ask.current_price.abs_diff(cents(506)) < curve::PRICE_SCALE);
    // Recycling: bid grew by Priya's proceeds; bid price untouched.
    assert_eq!(bid.current_price, cents(496));
    assert_eq!(bid.remaining, 2_000 * USDC + pv.stats.quote_received.0);
    assert!(bid.remaining.abs_diff(2_713_703_000) < 20_000);

    // Arjun has no bid side: proceeds go to his internal balance.
    let arjun_quote = c.get_balance(arjun(), usdc()).0;
    assert!(arjun_quote.abs_diff(296_408_000) < 20_000);
    assert_eq!(arjun_quote + pv.stats.quote_received.0, spent);

    let fills = c.get_recent_fills(None);
    assert_eq!(fills.len(), 2);
    assert_eq!(fills[0].position_id.0, a);
    assert_eq!(fills[0].recycled_to, "balance");
    assert_eq!(fills[1].recycled_to, "bid");
    assert!(get_logs().iter().any(|l| l.contains("\"event\":\"swap\"")));
}

// TST-I5: Arjun closes before Rahul swaps; whole route refunds and nothing changes.
#[test]
fn stale_route_fully_refunds_without_state_change() {
    let (mut c, p, a) = seeded();
    call(arjun(), NearToken::from_yoctonear(1));
    c.close_position(U64(a));
    let before = c.get_position(U64(p)).unwrap();
    let msg = swap_msg(SwapSide::BuyBase, &[(p, PRIYA_BASE), (a, 200 * WNEAR - PRIYA_BASE)], 200 * WNEAR);
    let unused = swap(&mut c, usdc(), rahul(), 1_015_170_000, msg);
    assert_eq!(unused, 1_015_170_000);
    assert!(rejected_reason().unwrap().contains(E05_POSITION_NOT_FOUND));
    let after = c.get_position(U64(p)).unwrap();
    assert_eq!(after.ask, before.ask);
    assert_eq!(after.bid, before.bid);
    assert!(c.get_recent_fills(None).is_empty());
}

// TST-I6
#[test]
fn insufficient_input_refunds() {
    let (mut c, p, _) = seeded();
    let msg = swap_msg(SwapSide::BuyBase, &[(p, 100 * WNEAR)], 100 * WNEAR);
    let unused = swap(&mut c, usdc(), rahul(), 500 * USDC, msg);
    assert_eq!(unused, 500 * USDC);
    assert!(rejected_reason().unwrap().contains(E08_INPUT_EXCEEDED));
}

// TST-I7 + TST-T5: sell into Priya's bid; min out too high refunds, sane min fills.
#[test]
fn sell_route_respects_min_out_and_recycles_into_ask() {
    let (mut c, p, _) = seeded();
    let msg = swap_msg(SwapSide::SellBase, &[(p, 100 * WNEAR)], 497 * USDC);
    assert_eq!(swap(&mut c, wnear(), acc("neha.testnet"), 100 * WNEAR, msg), 100 * WNEAR);
    assert!(rejected_reason().unwrap().contains(E09_MIN_OUT_NOT_MET));

    let msg = swap_msg(SwapSide::SellBase, &[(p, 100 * WNEAR)], 490 * USDC);
    assert_eq!(swap(&mut c, wnear(), acc("neha.testnet"), 100 * WNEAR, msg), 0);
    let pv = c.get_position(U64(p)).unwrap();
    let out = pv.stats.quote_spent.0;
    assert!(out > 490 * USDC && out < 496 * USDC, "out {out}");
    // Base proceeds recycled into the ask side; ask price unchanged.
    let ask = pv.ask.unwrap();
    assert_eq!(ask.remaining, 500 * WNEAR);
    assert_eq!(ask.current_price, cents(504));
}

#[test]
fn wrong_token_rejected() {
    let (mut c, p, _) = seeded();
    let msg = swap_msg(SwapSide::BuyBase, &[(p, WNEAR)], WNEAR);
    assert_eq!(swap(&mut c, wnear(), rahul(), 10 * WNEAR, msg), 10 * WNEAR);
    assert!(rejected_reason().unwrap().contains(E02_WRONG_TOKEN));
}

// TST-I10
#[test]
fn duplicate_and_too_many_legs_rejected() {
    let (mut c, p, _) = seeded();
    let msg = swap_msg(SwapSide::BuyBase, &[(p, WNEAR), (p, WNEAR)], 2 * WNEAR);
    assert_eq!(swap(&mut c, usdc(), rahul(), 100 * USDC, msg), 100 * USDC);
    assert!(rejected_reason().unwrap().contains(E04_DUPLICATE_LEG));

    let legs: Vec<(u64, u128)> = (0..9).map(|i| (i, WNEAR)).collect();
    let msg = swap_msg(SwapSide::BuyBase, &legs, WNEAR);
    assert_eq!(swap(&mut c, usdc(), rahul(), 100 * USDC, msg), 100 * USDC);
    assert!(rejected_reason().unwrap().contains(E03_TOO_MANY_LEGS));
}

#[test]
fn over_capacity_leg_rejected() {
    let (mut c, _, a) = seeded();
    let msg = swap_msg(SwapSide::BuyBase, &[(a, 101 * WNEAR)], 101 * WNEAR);
    assert_eq!(swap(&mut c, usdc(), rahul(), 1_000 * USDC, msg), 1_000 * USDC);
    assert!(rejected_reason().unwrap().contains(E07_INSUFFICIENT_LIQUIDITY));
}

// TST-I9
#[test]
#[should_panic(expected = "E11_NOT_OWNER")]
fn non_owner_cannot_close() {
    let (mut c, p, _) = seeded();
    call(rahul(), NearToken::from_yoctonear(1));
    c.close_position(U64(p));
}

#[test]
#[should_panic(expected = "E10_INSUFFICIENT_BALANCE")]
fn cannot_withdraw_more_than_balance() {
    let (mut c, _, _) = seeded();
    call(rahul(), NearToken::from_yoctonear(1));
    c.withdraw(usdc(), Some(U128(1))).detach();
}

#[test]
fn withdraw_debits_and_failed_callback_restores() {
    let mut c = setup();
    deposit(&mut c, priya(), usdc(), 50 * USDC);
    call(priya(), NearToken::from_yoctonear(1));
    c.withdraw(usdc(), Some(U128(20 * USDC))).detach();
    assert_eq!(c.get_balance(priya(), usdc()).0, 30 * USDC);

    testing_env!(
        VMContextBuilder::new()
            .current_account_id(acc("book.testnet"))
            .predecessor_account_id(acc("book.testnet"))
            .build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed],
    );
    c.on_withdraw(priya(), usdc(), U128(20 * USDC));
    assert_eq!(c.get_balance(priya(), usdc()).0, 50 * USDC);
}

// TST-I8
#[test]
fn failed_payout_is_credited_internally() {
    let mut c = setup();
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(acc("book.testnet"))
            .predecessor_account_id(acc("book.testnet"))
            .build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed],
    );
    c.on_payout(acc("unregistered.testnet"), wnear(), U128(3 * WNEAR));
    assert_eq!(c.get_balance(acc("unregistered.testnet"), wnear()).0, 3 * WNEAR);
    assert!(get_logs().iter().any(|l| l.contains("payout_credited")));
}

#[test]
#[should_panic(expected = "E15_CROSSED_POSITION")]
fn crossed_position_rejected() {
    let mut c = setup();
    deposit(&mut c, priya(), wnear(), WNEAR);
    deposit(&mut c, priya(), usdc(), USDC);
    call(priya(), POSITION_STORAGE);
    c.create_position(0, Some(side(WNEAR, cents(500), cents(510), 0)), Some(side(USDC, cents(500), cents(490), 0)));
}

#[test]
#[should_panic(expected = "E10_INSUFFICIENT_BALANCE")]
fn create_requires_balance() {
    let mut c = setup();
    call(priya(), POSITION_STORAGE);
    c.create_position(0, Some(side(WNEAR, cents(500), cents(510), 0)), None);
}

#[test]
#[should_panic(expected = "E12_INVALID_CURVE")]
fn invalid_curve_rejected() {
    let mut c = setup();
    deposit(&mut c, priya(), wnear(), WNEAR);
    call(priya(), POSITION_STORAGE);
    c.create_position(0, Some(side(WNEAR, cents(510), cents(500), 0)), None);
}

// TST-I13
#[test]
fn pause_blocks_swaps_not_close() {
    let (mut c, p, _) = seeded();
    call(owner(), NearToken::from_yoctonear(0));
    c.set_paused(true);
    let msg = swap_msg(SwapSide::BuyBase, &[(p, WNEAR)], WNEAR);
    assert_eq!(swap(&mut c, usdc(), rahul(), 100 * USDC, msg), 100 * USDC);
    assert!(rejected_reason().unwrap().contains(E13_PAUSED));
    call(priya(), NearToken::from_yoctonear(1));
    c.close_position(U64(p));
    assert_eq!(c.get_balance(priya(), wnear()).0, 400 * WNEAR);
}

#[test]
#[should_panic(expected = "E11_NOT_OWNER")]
fn only_owner_adds_markets() {
    let mut c = setup();
    call(rahul(), NearToken::from_yoctonear(0));
    c.add_market(acc("a.testnet"), acc("b.testnet"), 24, 6);
}

#[test]
fn simulate_matches_execution() {
    let (mut c, p, a) = seeded();
    let legs = [(p, PRIYA_BASE), (a, 200 * WNEAR - PRIYA_BASE)];
    let sim_msg: SwapMsg = serde_json::from_value(json!({
        "market_id": 0, "side": "buy_base",
        "legs": legs.iter().map(|(id, b)| json!({"position_id": id.to_string(), "base_amount": b.to_string()})).collect::<Vec<_>>(),
        "min_amount_out": (200 * WNEAR).to_string(),
    }))
    .unwrap();
    let sim = c.simulate_swap(sim_msg, U128(1_015_170_000));
    assert!(sim.ok);
    let unused = swap(&mut c, usdc(), rahul(), 1_015_170_000, swap_msg(SwapSide::BuyBase, &legs, 200 * WNEAR));
    assert_eq!(sim.refund.0, unused);
    assert_eq!(sim.amount_out.0, 200 * WNEAR);
}

#[test]
fn quote_leg_view() {
    let (c, _, a) = seeded();
    let q = c.quote_leg(U64(a), SwapSide::BuyBase, U128(10 * WNEAR));
    assert!(q.ok);
    assert_eq!(q.quote_amount.0, 5_060 * USDC / 100);
    let q = c.quote_leg(U64(a), SwapSide::SellBase, U128(WNEAR));
    assert!(!q.ok);
}

// TST-P2: value conservation across a sequence of swaps and closes.
#[test]
fn conservation_across_operations() {
    let (mut c, p, a) = seeded();
    let mut taker_paid_quote = 0u128;
    let mut taker_got_base = 0u128;
    let mut taker_paid_base = 0u128;
    let mut taker_got_quote = 0u128;
    for i in 0..10u128 {
        if i % 2 == 0 {
            let b = (5 + i) * WNEAR;
            let unused = swap(&mut c, usdc(), rahul(), 1_000 * USDC, swap_msg(SwapSide::BuyBase, &[(p, b)], b));
            taker_paid_quote += 1_000 * USDC - unused;
            taker_got_base += b;
        } else {
            let b = (3 + i) * WNEAR;
            let before = c.get_position(U64(p)).unwrap().stats.quote_spent.0;
            let unused = swap(&mut c, wnear(), rahul(), b, swap_msg(SwapSide::SellBase, &[(p, b)], 1));
            assert_eq!(unused, 0);
            taker_paid_base += b;
            taker_got_quote += c.get_position(U64(p)).unwrap().stats.quote_spent.0 - before;
        }
    }
    call(priya(), NearToken::from_yoctonear(1));
    c.close_position(U64(p));
    call(arjun(), NearToken::from_yoctonear(1));
    c.close_position(U64(a));
    let base_total = c.get_balance(priya(), wnear()).0 + c.get_balance(arjun(), wnear()).0;
    let quote_total = c.get_balance(priya(), usdc()).0 + c.get_balance(arjun(), usdc()).0;
    assert_eq!(base_total + taker_got_base, 500 * WNEAR + taker_paid_base);
    assert_eq!(quote_total + taker_got_quote, 2_000 * USDC + taker_paid_quote);
}
