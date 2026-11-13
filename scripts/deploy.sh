#!/usr/bin/env bash
# Deploys Ebbflow + tUSDC to testnet and registers the wNEAR/tUSDC market.
# Requires near-cli-rs (`near`) with MASTER_ACCOUNT's full-access key in the keychain.
#
#   MASTER_ACCOUNT=myteam.testnet ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${MASTER_ACCOUNT:?set MASTER_ACCOUNT, e.g. myteam.testnet}"
BOOK="book.${MASTER_ACCOUNT}"
USDC="usdc.${MASTER_ACCOUNT}"
WNEAR="${WNEAR:-wrap.testnet}"
NET=testnet

[ -f res/ebbflow.wasm ] || ./scripts/build.sh

create() {
  near account create-account fund-myself "$1" "$2" autogenerate-new-keypair save-to-keychain \
    sign-as "$MASTER_ACCOUNT" network-config "$NET" sign-with-keychain send
}
call() { # call <contract> <method> <json> <deposit> [signer]
  near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas '100.0 Tgas' \
    attached-deposit "$4" sign-as "${5:-$MASTER_ACCOUNT}" network-config "$NET" sign-with-keychain send
}

create "$USDC" '3 NEAR'
near contract deploy "$USDC" use-file res/test_token.wasm with-init-call new \
  json-args '{"name":"Test USDC","symbol":"tUSDC","decimals":6}' prepaid-gas '100.0 Tgas' \
  attached-deposit '0 NEAR' network-config "$NET" sign-with-keychain send

create "$BOOK" '5 NEAR'
near contract deploy "$BOOK" use-file res/ebbflow.wasm with-init-call new \
  json-args "{\"owner_id\":\"$MASTER_ACCOUNT\"}" prepaid-gas '100.0 Tgas' \
  attached-deposit '0 NEAR' network-config "$NET" sign-with-keychain send

# The book must hold a storage registration on every market token.
call "$WNEAR" storage_deposit "{\"account_id\":\"$BOOK\"}" '0.125 NEAR'
call "$USDC" storage_deposit "{\"account_id\":\"$BOOK\"}" '0.125 NEAR'
call "$BOOK" add_market "{\"base\":\"$WNEAR\",\"quote\":\"$USDC\",\"base_decimals\":24,\"quote_decimals\":6}" '0 NEAR'

mkdir -p deployments
cat > deployments/testnet.json <<JSON
{
  "network": "testnet",
  "book": "$BOOK",
  "markets": [{ "market_id": 0, "base": "$WNEAR", "quote": "$USDC", "base_decimals": 24, "quote_decimals": 6 }],
  "owner": "$MASTER_ACCOUNT"
}
JSON
echo "Deployed. See deployments/testnet.json"
