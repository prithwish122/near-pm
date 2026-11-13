//! End-to-end tests against a local NEAR sandbox with the real wasm.
//! Build first: `./scripts/build.sh`. Run: `cargo test -p integration-tests`.

use near_sdk::json_types::U128;
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

const WNEAR: u128 = 1_000_000_000_000_000_000_000_000;
const USDC: u128 = 1_000_000;
const PRICE_SCALE: u128 = 1_000_000_000_000;

fn cents(c: u128) -> u128 {
    c * USDC / 100 * PRICE_SCALE
}

fn wasm(name: &str) -> Vec<u8> {
    let path = format!("{}/../../res/{name}.wasm", env!("CARGO_MANIFEST_DIR"));
    std::fs::read(&path).unwrap_or_else(|_| panic!("{path} missing: run ./scripts/build.sh"))
}

struct Env {
    worker: Worker<Sandbox>,
    root: Account,
    book: Contract,
    wnear: Contract,
    usdc: Contract,
}

async fn token(root: &Account, name: &str, symbol: &str, decimals: u8) -> anyhow::Result<Contract> {
    let acc = root
        .create_subaccount(name)
        .initial_balance(NearToken::from_near(10))
        .transact()
        .await?
        .into_result()?;
    let c = acc.deploy(&wasm("test_token")).await?.into_result()?;
    c.call("new")
        .args_json(json!({ "name": symbol, "symbol": symbol, "decimals": decimals }))
        .transact()
        .await?
        .into_result()?;
    Ok(c)
}

async fn setup() -> anyhow::Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let wnear = token(&root, "wnear", "wNEAR", 24).await?;
    let usdc = token(&root, "usdc", "tUSDC", 6).await?;
    let book_acc = root
        .create_subaccount("book")
        .initial_balance(NearToken::from_near(20))
        .transact()
        .await?
        .into_result()?;
    let book = book_acc.deploy(&wasm("ebbflow")).await?.into_result()?;
    book.call("new").args_json(json!({ "owner_id": root.id() })).transact().await?.into_result()?;
    root.call(book.id(), "add_market")
        .args_json(json!({ "base": wnear.id(), "quote": usdc.id(), "base_decimals": 24, "quote_decimals": 6 }))
        .transact()
        .await?
        .into_result()?;
    for t in [&wnear, &usdc] {
        register_token(&book_acc, t).await?;
    }
    Ok(Env { worker, root, book, wnear, usdc })
}

async fn register_token(who: &Account, token: &Contract) -> anyhow::Result<()> {
    who.call(token.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(125))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

impl Env {
    /// A user registered with the book and both tokens, holding minted tokens.
    async fn user(&self, name: &str, wnear: u128, usdc: u128) -> anyhow::Result<Account> {
        let a = self
            .root
            .create_subaccount(name)
            .initial_balance(NearToken::from_near(10))
            .transact()
            .await?
            .into_result()?;
        for (t, amt) in [(&self.wnear, wnear), (&self.usdc, usdc)] {
            register_token(&a, t).await?;
            if amt > 0 {
                a.call(t.id(), "mint").args_json(json!({ "amount": amt.to_string() })).transact().await?.into_result()?;
            }
        }
        a.call(self.book.id(), "storage_deposit")
            .args_json(json!({}))
            .deposit(NearToken::from_millinear(10))
            .transact()
            .await?
            .into_result()?;
        Ok(a)
    }

    async fn ft_call(&self, who: &Account, token: &Contract, amount: u128, msg: Value) -> anyhow::Result<ExecutionFinalResult> {
        Ok(who
            .call(token.id(), "ft_transfer_call")
            .args_json(json!({
                "receiver_id": self.book.id(),
                "amount": amount.to_string(),
                "msg": msg.to_string(),
            }))
            .deposit(NearToken::from_yoctonear(1))
            .gas(Gas::from_tgas(300))
            .transact()
            .await?)
    }

    async fn deposit(&self, who: &Account, token: &Contract, amount: u128) -> anyhow::Result<()> {
        let r = self.ft_call(who, token, amount, json!({ "action": "deposit" })).await?.into_result()?;
        assert_eq!(r.json::<U128>()?.0, amount, "deposit should be fully used");
        Ok(())
    }

    async fn create(&self, who: &Account, ask: Option<Value>, bid: Option<Value>) -> anyhow::Result<u64> {
        let r = who
            .call(self.book.id(), "create_position")
            .args_json(json!({ "market_id": 0, "ask": ask, "bid": bid }))
            .deposit(NearToken::from_millinear(10))
            .transact()
            .await?
            .into_result()?;
        Ok(r.json::<String>()?.parse()?)
    }

    async fn ft_balance(&self, token: &Contract, who: &Account) -> anyhow::Result<u128> {
        Ok(token.view("ft_balance_of").args_json(json!({ "account_id": who.id() })).await?.json::<U128>()?.0)
    }

    async fn book_balance(&self, who: &Account, token: &Contract) -> anyhow::Result<u128> {
        Ok(self
            .book
            .view("get_balance")
            .args_json(json!({ "account_id": who.id(), "token_id": token.id() }))
            .await?
            .json::<U128>()?
            .0)
    }

    async fn position(&self, id: u64) -> anyhow::Result<Value> {
        Ok(self.book.view("get_position").args_json(json!({ "position_id": id.to_string() })).await?.json()?)
    }
}

fn side(amount: u128, start: u128, end: u128, alpha: u8) -> Value {
    json!({ "amount": amount.to_string(), "start_price": start.to_string(), "end_price": end.to_string(), "alpha": alpha })
}

fn swap(side: &str, legs: &[(u64, u128)], min_out: u128) -> Value {
    json!({
        "action": "swap",
        "market_id": 0,
        "side": side,
        "legs": legs.iter().map(|(id, b)| json!({ "position_id": id.to_string(), "base_amount": b.to_string() })).collect::<Vec<_>>(),
        "min_amount_out": min_out.to_string(),
    })
}

fn logs_contain(r: &ExecutionFinalResult, needle: &str) -> bool {
    r.logs().iter().any(|l| l.contains(needle))
}

const PRIYA_BASE: u128 = 141_421_356_237_309_504_880_168_872;

/// Priya's two-sided curve and Arjun's limit order, as in the PRD worked example.
async fn seed(e: &Env) -> anyhow::Result<(Account, Account, u64, u64)> {
    let priya = e.user("priya", 400 * WNEAR, 2_000 * USDC).await?;
    let arjun = e.user("arjun", 100 * WNEAR, 0).await?;
    e.deposit(&priya, &e.wnear, 400 * WNEAR).await?;
    e.deposit(&priya, &e.usdc, 2_000 * USDC).await?;
    e.deposit(&arjun, &e.wnear, 100 * WNEAR).await?;
    let p = e
        .create(&priya, Some(side(400 * WNEAR, cents(504), cents(520), 1)), Some(side(2_000 * USDC, cents(496), cents(480), 1)))
        .await?;
    let a = e.create(&arjun, Some(side(100 * WNEAR, cents(506), cents(506), 0)), None).await?;
    Ok((priya, arjun, p, a))
}

// TST-I2, TST-I4: two-maker route settles atomically, unused input refunded, recycling visible.
#[tokio::test]
async fn two_maker_route_settles_and_refunds_unused() -> anyhow::Result<()> {
    let e = setup().await?;
    let (_priya, arjun, p, a) = seed(&e).await?;
    let rahul = e.user("rahul", 0, 1_100 * USDC).await?;

    let attached = 1_015_170_000;
    let r = e
        .ft_call(&rahul, &e.usdc, attached, swap("buy_base", &[(p, PRIYA_BASE), (a, 200 * WNEAR - PRIYA_BASE)], 200 * WNEAR))
        .await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert!(logs_contain(&r, "\"event\":\"swap\""));

    assert_eq!(e.ft_balance(&e.wnear, &rahul).await?, 200 * WNEAR);
    let spent = 1_100 * USDC - e.ft_balance(&e.usdc, &rahul).await?;
    assert!(spent.abs_diff(1_010_111_000) < 20_000, "spent {spent}");

    let pv = e.position(p).await?;
    assert_eq!(pv["bid"]["current_price"], cents(496).to_string());
    let bid_remaining: u128 = pv["bid"]["remaining"].as_str().unwrap().parse()?;
    assert!(bid_remaining.abs_diff(2_713_703_000) < 20_000);
    assert!(e.book_balance(&arjun, &e.usdc).await?.abs_diff(296_408_000) < 20_000);
    Ok(())
}

// TST-I5: maker closes first, the stale route refunds in full and state is untouched.
#[tokio::test]
async fn stale_route_refunds_in_full() -> anyhow::Result<()> {
    let e = setup().await?;
    let (_priya, arjun, p, a) = seed(&e).await?;
    let rahul = e.user("rahul", 0, 1_100 * USDC).await?;
    arjun
        .call(e.book.id(), "close_position")
        .args_json(json!({ "position_id": a.to_string() }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;
    let before = e.position(p).await?;

    let r = e
        .ft_call(&rahul, &e.usdc, 1_015_170_000, swap("buy_base", &[(p, PRIYA_BASE), (a, 200 * WNEAR - PRIYA_BASE)], 200 * WNEAR))
        .await?;
    assert!(r.is_success());
    assert!(logs_contain(&r, "E05_POSITION_NOT_FOUND"));
    assert_eq!(e.ft_balance(&e.usdc, &rahul).await?, 1_100 * USDC);
    assert_eq!(e.ft_balance(&e.wnear, &rahul).await?, 0);
    assert_eq!(e.position(p).await?, before);
    Ok(())
}

// TST-I8: recipient not registered with the output token -> credited inside the book.
#[tokio::test]
async fn unregistered_recipient_is_credited_internally() -> anyhow::Result<()> {
    let e = setup().await?;
    let (_priya, _arjun, _p, a) = seed(&e).await?;
    let rahul = e.user("rahul", 0, 100 * USDC).await?;
    let stranger = e.root.create_subaccount("stranger").initial_balance(NearToken::from_near(2)).transact().await?.into_result()?;

    let mut msg = swap("buy_base", &[(a, 10 * WNEAR)], 10 * WNEAR);
    msg["recipient"] = json!(stranger.id());
    let r = e.ft_call(&rahul, &e.usdc, 51 * USDC, msg).await?;
    assert!(logs_contain(&r, "payout_credited"), "{:?}", r.logs());
    assert_eq!(e.book_balance(&stranger, &e.wnear).await?, 10 * WNEAR);
    assert_eq!(e.ft_balance(&e.usdc, &rahul).await?, 100 * USDC - 506 * USDC / 10);
    Ok(())
}

// TST-I2: close and withdraw back to the wallet.
#[tokio::test]
async fn close_and_withdraw_round_trip() -> anyhow::Result<()> {
    let e = setup().await?;
    let (priya, _arjun, p, _a) = seed(&e).await?;
    priya
        .call(e.book.id(), "close_position")
        .args_json(json!({ "position_id": p.to_string() }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;
    for (t, amt) in [(&e.wnear, 400 * WNEAR), (&e.usdc, 2_000 * USDC)] {
        priya
            .call(e.book.id(), "withdraw")
            .args_json(json!({ "token_id": t.id() }))
            .deposit(NearToken::from_yoctonear(1))
            .gas(Gas::from_tgas(100))
            .transact()
            .await?
            .into_result()?;
        assert_eq!(e.ft_balance(t, &priya).await?, amt);
        assert_eq!(e.book_balance(&priya, t).await?, 0);
    }
    Ok(())
}

// TST-I11: an 8-leg route over alpha-3 curves stays well inside the gas limit.
#[tokio::test]
async fn eight_leg_route_gas_benchmark() -> anyhow::Result<()> {
    let e = setup().await?;
    let mut legs = vec![];
    for i in 0..8u128 {
        let m = e.user(&format!("maker{i}"), 100 * WNEAR, 600 * USDC).await?;
        e.deposit(&m, &e.wnear, 100 * WNEAR).await?;
        e.deposit(&m, &e.usdc, 400 * USDC).await?;
        let id = e
            .create(&m, Some(side(100 * WNEAR, cents(504 + i), cents(530 + i), 3)), Some(side(400 * USDC, cents(496 - i), cents(470), 3)))
            .await?;
        legs.push((id, 10 * WNEAR));
    }
    let taker = e.user("taker", 0, 1_000 * USDC).await?;
    let r = e.ft_call(&taker, &e.usdc, 1_000 * USDC, swap("buy_base", &legs, 80 * WNEAR)).await?;
    assert!(r.is_success() && logs_contain(&r, "\"event\":\"swap\""), "{:?}", r.logs());
    assert_eq!(e.ft_balance(&e.wnear, &taker).await?, 80 * WNEAR);

    let swap_receipt = r
        .receipt_outcomes()
        .iter()
        .find(|o| o.executor_id == *e.book.id() && o.logs.iter().any(|l| l.contains("\"event\":\"swap\"")))
        .expect("ft_on_transfer receipt");
    let tgas = swap_receipt.gas_burnt.as_tgas();
    println!("8-leg ft_on_transfer gas burnt: {tgas} Tgas; whole tx: {} Tgas", r.total_gas_burnt.as_tgas());
    assert!(tgas < 100, "8-leg swap used {tgas} Tgas");
    let _ = &e.worker;
    Ok(())
}
