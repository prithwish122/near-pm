//! tUSDC: a 6-decimal NEP-141 test token with a public faucet for the Ebbflow demo.

use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, PromiseOrValue};

/// Max whole tokens per `mint` call.
pub const MINT_LIMIT_TOKENS: u128 = 10_000;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TestToken {
    token: FungibleToken,
    metadata: FungibleTokenMetadata,
}

#[near]
impl TestToken {
    #[init]
    pub fn new(name: String, symbol: String, decimals: u8) -> Self {
        Self {
            token: FungibleToken::new(b"t".to_vec()),
            metadata: FungibleTokenMetadata {
                spec: FT_METADATA_SPEC.to_string(),
                name,
                symbol,
                icon: None,
                reference: None,
                reference_hash: None,
                decimals,
            },
        }
    }

    /// Faucet: mints up to `MINT_LIMIT_TOKENS` whole tokens to the caller, registering them if needed.
    pub fn mint(&mut self, amount: U128) {
        let limit = MINT_LIMIT_TOKENS * 10u128.pow(self.metadata.decimals as u32);
        require!(amount.0 > 0 && amount.0 <= limit, "amount must be between 1 and 10,000 whole tokens");
        let account_id = env::predecessor_account_id();
        if !self.token.accounts.contains_key(&account_id) {
            self.token.internal_register_account(&account_id);
        }
        self.token.internal_deposit(&account_id, amount.0);
        near_contract_standards::fungible_token::events::FtMint {
            owner_id: &account_id,
            amount,
            memo: Some("faucet"),
        }
        .emit();
    }
}

#[near]
impl FungibleTokenCore for TestToken {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for TestToken {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, _burned) = self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for TestToken {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for TestToken {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    #[test]
    fn faucet_mints_and_registers() {
        testing_env!(VMContextBuilder::new().predecessor_account_id(accounts(1)).build());
        let mut t = TestToken::new("Test USDC".into(), "tUSDC".into(), 6);
        t.mint(U128(5_000_000));
        assert_eq!(t.ft_balance_of(accounts(1)).0, 5_000_000);
        assert_eq!(t.ft_total_supply().0, 5_000_000);
    }

    #[test]
    #[should_panic(expected = "amount must be")]
    fn faucet_limit() {
        testing_env!(VMContextBuilder::new().predecessor_account_id(accounts(1)).build());
        let mut t = TestToken::new("Test USDC".into(), "tUSDC".into(), 6);
        t.mint(U128(MINT_LIMIT_TOKENS * 1_000_000 + 1));
    }
}
