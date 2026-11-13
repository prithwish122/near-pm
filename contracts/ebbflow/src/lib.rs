//! Ebbflow: an order book where each maker order is an executable price curve.
//!
//! * Makers deposit NEP-141 tokens and publish immutable curve positions.
//! * Takers send tokens with `ft_transfer_call` carrying a route of up to `MAX_LEGS`
//!   positions. Every leg is simulated first; the route then either commits in full
//!   inside this single receipt or nothing changes and the input is refunded.
//! * Proceeds from one side of a position recycle into its opposite side at that
//!   side's current price, so positions keep quoting both ways without maker action.
//!
//! Custody: balances are segregated per account. Only the account itself can withdraw
//! or close its positions. The owner can add markets and pause new activity, never
//! move funds, and pausing never blocks closing or withdrawing.

pub mod curve;
mod events;

use curve::{CurveError, Side};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::{self, json};
use near_sdk::store::{IterableMap, LookupMap, Vector};
use near_sdk::{
    assert_one_yocto, env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, NearToken,
    PanicOnDefault, Promise, PromiseOrValue,
};

pub const MAX_LEGS: usize = 8;
pub const FILL_HISTORY: u32 = 100;
/// One-off NEP-145 registration covering an account's balance entries.
pub const STORAGE_MIN: NearToken = NearToken::from_millinear(10);
/// Flat deposit per position, refunded on close.
pub const POSITION_STORAGE: NearToken = NearToken::from_millinear(10);

const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_CALLBACK: Gas = Gas::from_tgas(10);

pub mod errors {
    pub const E01_INVALID_MSG: &str = "E01_INVALID_MSG";
    pub const E02_WRONG_TOKEN: &str = "E02_WRONG_TOKEN";
    pub const E03_TOO_MANY_LEGS: &str = "E03_TOO_MANY_LEGS";
    pub const E04_DUPLICATE_LEG: &str = "E04_DUPLICATE_LEG";
    pub const E05_POSITION_NOT_FOUND: &str = "E05_POSITION_NOT_FOUND";
    pub const E06_MARKET_MISMATCH: &str = "E06_MARKET_MISMATCH";
    pub const E07_INSUFFICIENT_LIQUIDITY: &str = "E07_INSUFFICIENT_LIQUIDITY";
    pub const E08_INPUT_EXCEEDED: &str = "E08_INPUT_EXCEEDED";
    pub const E09_MIN_OUT_NOT_MET: &str = "E09_MIN_OUT_NOT_MET";
    pub const E10_INSUFFICIENT_BALANCE: &str = "E10_INSUFFICIENT_BALANCE";
    pub const E11_NOT_OWNER: &str = "E11_NOT_OWNER";
    pub const E12_INVALID_CURVE: &str = "E12_INVALID_CURVE";
    pub const E13_PAUSED: &str = "E13_PAUSED";
    pub const E14_STORAGE: &str = "E14_STORAGE";
    pub const E15_CROSSED_POSITION: &str = "E15_CROSSED_POSITION";
    pub const E16_MATH_OVERFLOW: &str = "E16_MATH_OVERFLOW";
}
use errors::*;

fn curve_err(e: CurveError) -> &'static str {
    match e {
        CurveError::InvalidCurve => E12_INVALID_CURVE,
        CurveError::InsufficientLiquidity | CurveError::ZeroAmount => E07_INSUFFICIENT_LIQUIDITY,
        CurveError::Overflow => E16_MATH_OVERFLOW,
    }
}

// ---------- types ----------

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Market {
    pub base: AccountId,
    pub quote: AccountId,
    pub base_decimals: u8,
    pub quote_decimals: u8,
}

impl Market {
    fn base_unit(&self) -> u128 {
        10u128.pow(self.base_decimals as u32)
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default)]
pub struct PositionStats {
    pub base_sold: U128,
    pub quote_received: U128,
    pub base_bought: U128,
    pub quote_spent: U128,
    pub fills: u32,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Position {
    pub owner_id: AccountId,
    pub market_id: u32,
    pub ask: Option<Side>,
    pub bid: Option<Side>,
    pub stats: PositionStats,
    pub storage_paid: u128,
    pub created_at_ms: u64,
}

#[near(serializers = [json])]
pub struct SideInput {
    /// Base for the ask side, quote for the bid side.
    pub amount: U128,
    pub start_price: U128,
    pub end_price: U128,
    pub alpha: u8,
}

#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SwapSide {
    /// Taker sends quote, receives base (fills ask sides).
    BuyBase,
    /// Taker sends base, receives quote (fills bid sides).
    SellBase,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Leg {
    pub position_id: U64,
    pub base_amount: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct SwapMsg {
    pub market_id: u32,
    pub side: SwapSide,
    pub legs: Vec<Leg>,
    /// Buy: base received (= Σ base_amount). Sell: minimum quote received.
    pub min_amount_out: U128,
    pub recipient: Option<AccountId>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "near_sdk::serde", tag = "action", rename_all = "snake_case")]
pub enum TransferMsg {
    Deposit,
    Swap(SwapMsg),
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct FillRecord {
    pub position_id: U64,
    pub maker_id: AccountId,
    pub taker_id: AccountId,
    pub market_id: u32,
    pub side: SwapSide,
    pub base_amount: U128,
    pub quote_amount: U128,
    pub new_price: U128,
    pub recycled_amount: U128,
    pub recycled_to: String,
    pub timestamp_ms: u64,
}

#[near(serializers = [json])]
pub struct PositionView {
    pub position_id: U64,
    pub owner_id: AccountId,
    pub market_id: u32,
    pub ask: Option<Side>,
    pub bid: Option<Side>,
    /// Base the bid side can still buy.
    pub bid_base_capacity: U128,
    pub stats: PositionStats,
    pub created_at_ms: u64,
}

#[near(serializers = [json])]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}

#[near(serializers = [json])]
pub struct StorageBalanceBounds {
    pub min: U128,
    pub max: Option<U128>,
}

#[near(serializers = [json])]
pub struct QuoteLegView {
    pub ok: bool,
    pub error: Option<String>,
    pub quote_amount: U128,
    pub new_price: U128,
}

#[near(serializers = [json])]
pub struct SimLegView {
    pub position_id: U64,
    pub base_amount: U128,
    pub quote_amount: U128,
    pub new_price: U128,
}

#[near(serializers = [json])]
pub struct SimulateView {
    pub ok: bool,
    pub error: Option<String>,
    pub legs: Vec<SimLegView>,
    pub amount_in_used: U128,
    pub amount_out: U128,
    pub refund: U128,
}

#[near(serializers = [json])]
pub struct ConfigView {
    pub owner_id: AccountId,
    pub max_legs: u32,
    pub price_scale: U128,
    pub paused: bool,
    pub version: String,
}

/// A leg after simulation, with the position state it would leave behind.
struct PlannedLeg {
    position_id: u64,
    updated: Position,
    base: u128,
    quote: u128,
    new_price: u128,
    recycled_amount: u128,
    recycled_to: &'static str,
    /// Proceeds credited to the maker's balance when the opposite side is absent.
    balance_credit: Option<(AccountId, AccountId, u128)>,
}

struct SwapPlan {
    market: Market,
    legs: Vec<PlannedLeg>,
    in_used: u128,
    out: u128,
}

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Markets,
    Positions,
    Balances,
    Storage,
    RecentFills,
}

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

// ---------- contract ----------

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Ebbflow {
    owner_id: AccountId,
    markets: Vector<Market>,
    positions: IterableMap<u64, Position>,
    balances: LookupMap<(AccountId, AccountId), u128>,
    storage: LookupMap<AccountId, u128>,
    recent_fills: Vector<FillRecord>,
    recent_head: u32,
    next_position_id: u64,
    paused: bool,
}

#[near]
impl Ebbflow {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            markets: Vector::new(StorageKey::Markets),
            positions: IterableMap::new(StorageKey::Positions),
            balances: LookupMap::new(StorageKey::Balances),
            storage: LookupMap::new(StorageKey::Storage),
            recent_fills: Vector::new(StorageKey::RecentFills),
            recent_head: 0,
            next_position_id: 0,
            paused: false,
        }
    }

    // ----- owner -----

    pub fn add_market(
        &mut self,
        base: AccountId,
        quote: AccountId,
        base_decimals: u8,
        quote_decimals: u8,
    ) -> u32 {
        self.assert_owner();
        require!(base != quote && base_decimals <= 30 && quote_decimals <= 30, "E06_MARKET_MISMATCH");
        let id = self.markets.len();
        events::market_added(id, &base, &quote);
        self.markets.push(Market { base, quote, base_decimals, quote_decimals });
        id
    }

    /// Blocks new positions and swaps. Never blocks close or withdraw.
    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
    }

    // ----- NEP-145 storage -----

    #[payable]
    pub fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        let _ = registration_only;
        let account_id = account_id.unwrap_or_else(env::predecessor_account_id);
        let attached = env::attached_deposit();
        if self.storage.contains_key(&account_id) {
            if !attached.is_zero() {
                Promise::new(env::predecessor_account_id()).transfer(attached).detach();
            }
        } else {
            require!(attached >= STORAGE_MIN, E14_STORAGE);
            self.storage.insert(account_id, STORAGE_MIN.as_yoctonear());
            let refund = attached.saturating_sub(STORAGE_MIN);
            if !refund.is_zero() {
                Promise::new(env::predecessor_account_id()).transfer(refund).detach();
            }
        }
        self.storage_balance()
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.storage.get(&account_id).map(|_| self.storage_balance())
    }

    pub fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        StorageBalanceBounds { min: U128(STORAGE_MIN.as_yoctonear()), max: Some(U128(STORAGE_MIN.as_yoctonear())) }
    }

    // ----- token inflows -----

    /// NEP-141 receiver. `msg` is `{"action":"deposit"}` or `{"action":"swap", ...}`.
    /// Returns the amount to refund to `sender_id`.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token_id = env::predecessor_account_id();
        if !self.is_market_token(&token_id) {
            env::log_str(&format!("{E02_WRONG_TOKEN}: {token_id} is not a market token"));
            return PromiseOrValue::Value(amount);
        }
        let parsed: TransferMsg = match serde_json::from_str(&msg) {
            Ok(m) => m,
            Err(_) => {
                env::log_str(E01_INVALID_MSG);
                return PromiseOrValue::Value(amount);
            }
        };
        match parsed {
            TransferMsg::Deposit => {
                if !self.storage.contains_key(&sender_id) {
                    env::log_str(&format!("{E14_STORAGE}: {sender_id} is not registered"));
                    return PromiseOrValue::Value(amount);
                }
                self.credit(&sender_id, &token_id, amount.0);
                events::deposit(&sender_id, &token_id, amount.0);
                PromiseOrValue::Value(U128(0))
            }
            TransferMsg::Swap(msg) => self.execute_swap(sender_id, token_id, amount.0, msg),
        }
    }

    // ----- positions -----

    /// Publishes a curve position funded from the caller's internal balances.
    /// Attach `POSITION_STORAGE` (0.01 NEAR); the excess is refunded.
    #[payable]
    pub fn create_position(
        &mut self,
        market_id: u32,
        ask: Option<SideInput>,
        bid: Option<SideInput>,
    ) -> U64 {
        require!(!self.paused, E13_PAUSED);
        let attached = env::attached_deposit();
        require!(attached >= POSITION_STORAGE, E14_STORAGE);
        let market = self.market(market_id).unwrap_or_else(|e| env::panic_str(e));
        let owner_id = env::predecessor_account_id();

        let to_side = |s: SideInput| Side::new(s.amount.0, s.start_price.0, s.end_price.0, s.alpha);
        let ask = ask.map(to_side);
        let bid = bid.map(to_side);
        require!(ask.is_some() || bid.is_some(), E12_INVALID_CURVE);
        if let Some(a) = &ask {
            curve::validate_ask(a).unwrap_or_else(|e| env::panic_str(curve_err(e)));
        }
        if let Some(b) = &bid {
            curve::validate_bid(b).unwrap_or_else(|e| env::panic_str(curve_err(e)));
            // Reject bids whose capacity maths would overflow.
            curve::bid_capacity(b, market.base_unit()).unwrap_or_else(|e| env::panic_str(curve_err(e)));
        }
        if let (Some(a), Some(b)) = (&ask, &bid) {
            require!(b.start_price < a.start_price, E15_CROSSED_POSITION);
        }

        if let Some(a) = &ask {
            self.debit(&owner_id, &market.base, a.remaining).unwrap_or_else(|e| env::panic_str(e));
        }
        if let Some(b) = &bid {
            self.debit(&owner_id, &market.quote, b.remaining).unwrap_or_else(|e| env::panic_str(e));
        }

        let id = self.next_position_id;
        self.next_position_id += 1;
        let position = Position {
            owner_id: owner_id.clone(),
            market_id,
            ask,
            bid,
            stats: PositionStats::default(),
            storage_paid: POSITION_STORAGE.as_yoctonear(),
            created_at_ms: env::block_timestamp_ms(),
        };
        events::position_created(serde_json::to_value(self.view(id, &position, &market)).unwrap());
        self.positions.insert(id, position);

        let refund = attached.saturating_sub(POSITION_STORAGE);
        if !refund.is_zero() {
            Promise::new(owner_id).transfer(refund).detach();
        }
        U64(id)
    }

    /// Closes a position: remaining inventory returns to the owner's balance and the
    /// storage deposit is refunded.
    #[payable]
    pub fn close_position(&mut self, position_id: U64) {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        let position = self
            .positions
            .get(&position_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str(E05_POSITION_NOT_FOUND));
        require!(position.owner_id == caller, E11_NOT_OWNER);
        let market = self.markets.get(position.market_id).cloned().unwrap();
        self.positions.remove(&position_id.0);

        let base = position.ask.as_ref().map_or(0, |s| s.remaining);
        let quote = position.bid.as_ref().map_or(0, |s| s.remaining);
        if base > 0 {
            self.credit(&caller, &market.base, base);
        }
        if quote > 0 {
            self.credit(&caller, &market.quote, quote);
        }
        events::position_closed(position_id.0, &caller, base, quote);
        Promise::new(caller).transfer(NearToken::from_yoctonear(position.storage_paid)).detach();
    }

    // ----- withdrawals -----

    /// Sends `amount` (or the whole balance) of `token_id` to the caller.
    #[payable]
    pub fn withdraw(&mut self, token_id: AccountId, amount: Option<U128>) -> Promise {
        assert_one_yocto();
        let account_id = env::predecessor_account_id();
        let amount = amount.map_or_else(|| self.balance_of(&account_id, &token_id), |a| a.0);
        require!(amount > 0, E10_INSUFFICIENT_BALANCE);
        self.debit(&account_id, &token_id, amount).unwrap_or_else(|e| env::panic_str(e));
        events::withdraw(&account_id, &token_id, amount);
        self.send(&account_id, &token_id, amount, false)
    }

    #[private]
    pub fn on_withdraw(&mut self, account_id: AccountId, token_id: AccountId, amount: U128) {
        if !promise_succeeded() {
            self.credit(&account_id, &token_id, amount.0);
            env::log_str(&format!("withdraw failed; {} restored to {account_id}", amount.0));
        }
    }

    #[private]
    pub fn on_payout(&mut self, account_id: AccountId, token_id: AccountId, amount: U128) {
        if !promise_succeeded() {
            self.credit(&account_id, &token_id, amount.0);
            events::payout_credited(&account_id, &token_id, amount.0);
        }
    }

    // ----- views -----

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            owner_id: self.owner_id.clone(),
            max_legs: MAX_LEGS as u32,
            price_scale: U128(curve::PRICE_SCALE),
            paused: self.paused,
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }

    pub fn get_markets(&self) -> Vec<Market> {
        self.markets.iter().cloned().collect()
    }

    pub fn get_positions(&self, market_id: u32, from_index: Option<u32>, limit: Option<u32>) -> Vec<PositionView> {
        let market = match self.markets.get(market_id) {
            Some(m) => m.clone(),
            None => return vec![],
        };
        self.positions
            .iter()
            .filter(|(_, p)| p.market_id == market_id)
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(100) as usize)
            .map(|(id, p)| self.view(*id, p, &market))
            .collect()
    }

    pub fn get_position(&self, position_id: U64) -> Option<PositionView> {
        let p = self.positions.get(&position_id.0)?;
        let market = self.markets.get(p.market_id)?;
        Some(self.view(position_id.0, p, market))
    }

    pub fn get_positions_by_owner(&self, account_id: AccountId) -> Vec<PositionView> {
        self.positions
            .iter()
            .filter(|(_, p)| p.owner_id == account_id)
            .map(|(id, p)| self.view(*id, p, self.markets.get(p.market_id).unwrap()))
            .collect()
    }

    pub fn get_balance(&self, account_id: AccountId, token_id: AccountId) -> U128 {
        U128(self.balance_of(&account_id, &token_id))
    }

    /// Prices taking `base_amount` from one position without changing state.
    pub fn quote_leg(&self, position_id: U64, side: SwapSide, base_amount: U128) -> QuoteLegView {
        let result = self.positions.get(&position_id.0).ok_or(E05_POSITION_NOT_FOUND).and_then(|p| {
            let market = self.markets.get(p.market_id).unwrap();
            fill_leg(p, market, side, base_amount.0).map(|l| (l.quote, l.new_price))
        });
        match result {
            Ok((q, price)) => QuoteLegView { ok: true, error: None, quote_amount: U128(q), new_price: U128(price) },
            Err(e) => QuoteLegView { ok: false, error: Some(e.to_string()), quote_amount: U128(0), new_price: U128(0) },
        }
    }

    /// Returns exactly what `ft_transfer_call(amount, swap msg)` would do.
    pub fn simulate_swap(&self, msg: SwapMsg, amount: U128) -> SimulateView {
        match self.plan_swap(&msg, amount.0) {
            Ok(plan) => SimulateView {
                ok: true,
                error: None,
                legs: plan
                    .legs
                    .iter()
                    .map(|l| SimLegView {
                        position_id: U64(l.position_id),
                        base_amount: U128(l.base),
                        quote_amount: U128(l.quote),
                        new_price: U128(l.new_price),
                    })
                    .collect(),
                amount_in_used: U128(plan.in_used),
                amount_out: U128(plan.out),
                refund: U128(amount.0 - plan.in_used),
            },
            Err(e) => SimulateView {
                ok: false,
                error: Some(e.to_string()),
                legs: vec![],
                amount_in_used: U128(0),
                amount_out: U128(0),
                refund: amount,
            },
        }
    }

    /// Most recent fills, newest first.
    pub fn get_recent_fills(&self, limit: Option<u32>) -> Vec<FillRecord> {
        let len = self.recent_fills.len();
        let limit = limit.unwrap_or(FILL_HISTORY).min(len);
        (0..limit)
            .map(|i| {
                // recent_head points at the slot the next fill will use.
                let idx = (self.recent_head + len - 1 - i) % len;
                self.recent_fills.get(idx).unwrap().clone()
            })
            .collect()
    }
}

// ---------- internals ----------

/// Prices one leg against a copy of the position and applies recycling to the copy.
fn fill_leg(p: &Position, market: &Market, side: SwapSide, base: u128) -> Result<PlannedLeg, &'static str> {
    let unit = market.base_unit();
    let mut updated = p.clone();
    let (fill, recycled_to, balance_credit);
    match side {
        SwapSide::BuyBase => {
            let ask = updated.ask.as_mut().ok_or(E07_INSUFFICIENT_LIQUIDITY)?;
            fill = curve::ask_fill(ask, unit, base).map_err(curve_err)?;
            ask.remaining -= fill.base;
            ask.current_price = fill.new_price;
            let s = &mut updated.stats;
            s.base_sold = U128(s.base_sold.0 + fill.base);
            s.quote_received = U128(s.quote_received.0 + fill.quote);
            // Quote proceeds refill the bid side at its unchanged current price.
            match updated.bid.as_mut() {
                Some(bid) => {
                    bid.remaining = bid.remaining.checked_add(fill.quote).ok_or(E16_MATH_OVERFLOW)?;
                    recycled_to = "bid";
                    balance_credit = None;
                }
                None => {
                    recycled_to = "balance";
                    balance_credit = Some((p.owner_id.clone(), market.quote.clone(), fill.quote));
                }
            }
        }
        SwapSide::SellBase => {
            let bid = updated.bid.as_mut().ok_or(E07_INSUFFICIENT_LIQUIDITY)?;
            fill = curve::bid_fill(bid, unit, base).map_err(curve_err)?;
            bid.remaining -= fill.quote;
            bid.current_price = fill.new_price;
            let s = &mut updated.stats;
            s.base_bought = U128(s.base_bought.0 + fill.base);
            s.quote_spent = U128(s.quote_spent.0 + fill.quote);
            // Base proceeds refill the ask side at its unchanged current price.
            match updated.ask.as_mut() {
                Some(ask) => {
                    ask.remaining = ask.remaining.checked_add(fill.base).ok_or(E16_MATH_OVERFLOW)?;
                    recycled_to = "ask";
                    balance_credit = None;
                }
                None => {
                    recycled_to = "balance";
                    balance_credit = Some((p.owner_id.clone(), market.base.clone(), fill.base));
                }
            }
        }
    }
    updated.stats.fills += 1;
    let recycled_amount = if side == SwapSide::BuyBase { fill.quote } else { fill.base };
    Ok(PlannedLeg {
        position_id: 0,
        updated,
        base: fill.base,
        quote: fill.quote,
        new_price: fill.new_price,
        recycled_amount,
        recycled_to,
        balance_credit,
    })
}

fn promise_succeeded() -> bool {
    env::promise_results_count() == 1 && env::promise_result_checked(0, 64).is_ok()
}

impl Ebbflow {
    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner_id, E11_NOT_OWNER);
    }

    fn storage_balance(&self) -> StorageBalance {
        StorageBalance { total: U128(STORAGE_MIN.as_yoctonear()), available: U128(0) }
    }

    fn is_market_token(&self, token: &AccountId) -> bool {
        self.markets.iter().any(|m| &m.base == token || &m.quote == token)
    }

    fn market(&self, market_id: u32) -> Result<Market, &'static str> {
        self.markets.get(market_id).cloned().ok_or(E06_MARKET_MISMATCH)
    }

    fn balance_of(&self, account: &AccountId, token: &AccountId) -> u128 {
        self.balances.get(&(account.clone(), token.clone())).copied().unwrap_or(0)
    }

    fn credit(&mut self, account: &AccountId, token: &AccountId, amount: u128) {
        let key = (account.clone(), token.clone());
        let new = self.balances.get(&key).copied().unwrap_or(0).checked_add(amount);
        self.balances.insert(key, new.unwrap_or_else(|| env::panic_str(E16_MATH_OVERFLOW)));
    }

    fn debit(&mut self, account: &AccountId, token: &AccountId, amount: u128) -> Result<(), &'static str> {
        let key = (account.clone(), token.clone());
        let bal = self.balances.get(&key).copied().unwrap_or(0);
        let new = bal.checked_sub(amount).ok_or(E10_INSUFFICIENT_BALANCE)?;
        if new == 0 {
            self.balances.remove(&key);
        } else {
            self.balances.insert(key, new);
        }
        Ok(())
    }

    fn view(&self, id: u64, p: &Position, market: &Market) -> PositionView {
        PositionView {
            position_id: U64(id),
            owner_id: p.owner_id.clone(),
            market_id: p.market_id,
            ask: p.ask.clone(),
            bid: p.bid.clone(),
            bid_base_capacity: U128(
                p.bid.as_ref().map_or(0, |b| curve::bid_capacity(b, market.base_unit()).unwrap_or(0)),
            ),
            stats: p.stats.clone(),
            created_at_ms: p.created_at_ms,
        }
    }

    /// `ft_transfer` to `account`, with a callback that restores funds on failure.
    fn send(&self, account: &AccountId, token: &AccountId, amount: u128, payout: bool) -> Promise {
        let transfer = ext_ft::ext(token.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(account.clone(), U128(amount), None);
        let cb = Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK);
        if payout {
            transfer.then(cb.on_payout(account.clone(), token.clone(), U128(amount)))
        } else {
            transfer.then(cb.on_withdraw(account.clone(), token.clone(), U128(amount)))
        }
    }

    /// Simulates every leg against current state. No writes.
    fn plan_swap(&self, msg: &SwapMsg, amount: u128) -> Result<SwapPlan, &'static str> {
        if self.paused {
            return Err(E13_PAUSED);
        }
        let market = self.market(msg.market_id)?;
        if msg.legs.is_empty() || msg.legs.len() > MAX_LEGS {
            return Err(E03_TOO_MANY_LEGS);
        }
        let mut legs: Vec<PlannedLeg> = Vec::with_capacity(msg.legs.len());
        for leg in &msg.legs {
            let id = leg.position_id.0;
            if legs.iter().any(|l| l.position_id == id) {
                return Err(E04_DUPLICATE_LEG);
            }
            let p = self.positions.get(&id).ok_or(E05_POSITION_NOT_FOUND)?;
            if p.market_id != msg.market_id {
                return Err(E06_MARKET_MISMATCH);
            }
            let mut planned = fill_leg(p, &market, msg.side, leg.base_amount.0)?;
            planned.position_id = id;
            legs.push(planned);
        }
        let sum = |f: fn(&PlannedLeg) -> u128| {
            legs.iter().try_fold(0u128, |acc, l| acc.checked_add(f(l))).ok_or(E16_MATH_OVERFLOW)
        };
        let (in_used, out) = match msg.side {
            SwapSide::BuyBase => (sum(|l| l.quote)?, sum(|l| l.base)?),
            SwapSide::SellBase => (sum(|l| l.base)?, sum(|l| l.quote)?),
        };
        if in_used > amount {
            return Err(E08_INPUT_EXCEEDED);
        }
        if out < msg.min_amount_out.0 || out == 0 {
            return Err(E09_MIN_OUT_NOT_MET);
        }
        Ok(SwapPlan { market, legs, in_used, out })
    }

    fn execute_swap(
        &mut self,
        taker_id: AccountId,
        token_id: AccountId,
        amount: u128,
        msg: SwapMsg,
    ) -> PromiseOrValue<U128> {
        let plan = self.market(msg.market_id).and_then(|m| {
            let input = if msg.side == SwapSide::BuyBase { &m.quote } else { &m.base };
            if input != &token_id {
                return Err(E02_WRONG_TOKEN);
            }
            self.plan_swap(&msg, amount)
        });
        let plan = match plan {
            Ok(p) => p,
            Err(reason) => {
                events::swap_rejected(&taker_id, msg.market_id, reason, amount);
                return PromiseOrValue::Value(U128(amount));
            }
        };

        // Commit: every leg was validated above, so nothing below can fail.
        let now = env::block_timestamp_ms();
        let mut legs_json = Vec::with_capacity(plan.legs.len());
        for leg in plan.legs {
            let maker_id = leg.updated.owner_id.clone();
            if let Some((acc, tok, amt)) = &leg.balance_credit {
                self.credit(acc, tok, *amt);
            }
            let record = FillRecord {
                position_id: U64(leg.position_id),
                maker_id,
                taker_id: taker_id.clone(),
                market_id: msg.market_id,
                side: msg.side,
                base_amount: U128(leg.base),
                quote_amount: U128(leg.quote),
                new_price: U128(leg.new_price),
                recycled_amount: U128(leg.recycled_amount),
                recycled_to: leg.recycled_to.to_string(),
                timestamp_ms: now,
            };
            let record_json = serde_json::to_value(&record).unwrap();
            events::fill(record_json.clone());
            legs_json.push(record_json);
            self.positions.insert(leg.position_id, leg.updated);
            self.push_fill(record);
        }

        let recipient = msg.recipient.clone().unwrap_or_else(|| taker_id.clone());
        let output_token = if msg.side == SwapSide::BuyBase { &plan.market.base } else { &plan.market.quote };
        let refund = amount - plan.in_used;
        events::swap(json!({
            "taker_id": taker_id,
            "recipient": recipient,
            "market_id": msg.market_id,
            "side": msg.side,
            "legs": legs_json,
            "amount_in": plan.in_used.to_string(),
            "amount_out": plan.out.to_string(),
            "refund": refund.to_string(),
        }));
        self.send(&recipient, output_token, plan.out, true).detach();
        PromiseOrValue::Value(U128(refund))
    }

    fn push_fill(&mut self, record: FillRecord) {
        if self.recent_fills.len() < FILL_HISTORY {
            self.recent_fills.push(record);
        } else {
            self.recent_fills.set(self.recent_head, record);
        }
        self.recent_head = (self.recent_head + 1) % FILL_HISTORY;
    }
}

#[cfg(test)]
mod tests;
