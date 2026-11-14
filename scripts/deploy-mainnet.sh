#!/usr/bin/env bash
# Deploys the Ebbflow book to NEAR MAINNET with a wNEAR / native USDC market. Spends real NEAR.
# Requires near-cli-rs (`near`) with MASTER_ACCOUNT's full-access key in the keychain.
#
#   MASTER_ACCOUNT=myteam.near CONFIRM=yes ./scripts/deploy-mainnet.sh
#
# Unaudited contract: keep deposits tiny. The book needs only the account creation (~5 NEAR) and
# two storage registrations.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${MASTER_ACCOUNT:?set MASTER_ACCOUNT, e.g. myteam.near}"
[ "${CONFIRM:-}" = "yes" ] || { echo "This spends real NEAR on mainnet. Re-run with CONFIRM=yes."; exit 1; }
BOOK="${BOOK:-book.${MASTER_ACCOUNT}}"
WNEAR=wrap.near
USDC=17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1 # native USDC, matches Intents' nep141:<id>
NET=mainnet

[ -f res/ebbflow.wasm ] || ./scripts/build.sh

call() { # call <contract> <method> <json> <deposit>
  near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas '100.0 Tgas' \
    attached-deposit "$4" sign-as "$MASTER_ACCOUNT" network-config "$NET" sign-with-keychain send
}

near account create-account fund-myself "$BOOK" '5 NEAR' autogenerate-new-keypair save-to-keychain \
  sign-as "$MASTER_ACCOUNT" network-config "$NET" sign-with-keychain send
near contract deploy "$BOOK" use-file res/ebbflow.wasm with-init-call new \
  json-args "{\"owner_id\":\"$MASTER_ACCOUNT\"}" prepaid-gas '100.0 Tgas' \
  attached-deposit '0 NEAR' network-config "$NET" sign-with-keychain send

call "$WNEAR" storage_deposit "{\"account_id\":\"$BOOK\"}" '0.125 NEAR'
call "$USDC" storage_deposit "{\"account_id\":\"$BOOK\"}" '0.125 NEAR'
call "$BOOK" add_market "{\"base\":\"$WNEAR\",\"quote\":\"$USDC\",\"base_decimals\":24,\"quote_decimals\":6}" '0 NEAR'

mkdir -p deployments
cat > deployments/mainnet.json <<JSON
{
  "network": "mainnet",
  "book": "$BOOK",
  "markets": [{ "market_id": 0, "base": "$WNEAR", "quote": "$USDC", "base_decimals": 24, "quote_decimals": 6 }],
  "owner": "$MASTER_ACCOUNT"
}
JSON
echo "Deployed. See deployments/mainnet.json"
