//! NEP-297 events: `EVENT_JSON:{"standard":"ebbflow","version":"1.0.0","event":...,"data":[...]}`.

use near_sdk::serde_json::{json, Value};
use near_sdk::{env, AccountId};

pub const STANDARD: &str = "ebbflow";
pub const VERSION: &str = "1.0.0";

fn emit(event: &str, data: Value) {
    let log = json!({
        "standard": STANDARD,
        "version": VERSION,
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{log}"));
}

pub fn market_added(market_id: u32, base: &AccountId, quote: &AccountId) {
    emit("market_added", json!({ "market_id": market_id, "base": base, "quote": quote }));
}

pub fn deposit(account_id: &AccountId, token_id: &AccountId, amount: u128) {
    emit(
        "deposit",
        json!({ "account_id": account_id, "token_id": token_id, "amount": amount.to_string() }),
    );
}

pub fn withdraw(account_id: &AccountId, token_id: &AccountId, amount: u128) {
    emit(
        "withdraw",
        json!({ "account_id": account_id, "token_id": token_id, "amount": amount.to_string() }),
    );
}

pub fn position_created(position: Value) {
    emit("position_created", position);
}

pub fn position_closed(position_id: u64, owner_id: &AccountId, returned_base: u128, returned_quote: u128) {
    emit(
        "position_closed",
        json!({
            "position_id": position_id.to_string(),
            "owner_id": owner_id,
            "returned_base": returned_base.to_string(),
            "returned_quote": returned_quote.to_string(),
        }),
    );
}

pub fn fill(data: Value) {
    emit("fill", data);
}

pub fn swap(data: Value) {
    emit("swap", data);
}

pub fn swap_rejected(taker_id: &AccountId, market_id: u32, reason: &str, amount_refunded: u128) {
    emit(
        "swap_rejected",
        json!({
            "taker_id": taker_id,
            "market_id": market_id,
            "reason": reason,
            "amount_refunded": amount_refunded.to_string(),
        }),
    );
}

pub fn payout_credited(account_id: &AccountId, token_id: &AccountId, amount: u128) {
    emit(
        "payout_credited",
        json!({ "account_id": account_id, "token_id": token_id, "amount": amount.to_string() }),
    );
}
