#!/usr/bin/env bash
# Seeds the testnet book with the PRD demo: Priya's two-sided curve, Arjun's limit
# order and a funded taker (Rahul). Each demo account is created through the testnet
# faucet (10 NEAR each), so the master account is not drained.
#
#   ./scripts/seed.sh                 # uses deployments/testnet.json
#   PREFIX=ebbflow ./scripts/seed.sh  # accounts: ebbflow-priya.testnet, ...
set -euo pipefail
cd "$(dirname "$0")/.."

NET=testnet
DEPLOY=deployments/testnet.json
BOOK=$(python3 -c "import json;print(json.load(open('$DEPLOY'))['book'])")
USDC=$(python3 -c "import json;print(json.load(open('$DEPLOY'))['markets'][0]['quote'])")
WNEAR=$(python3 -c "import json;print(json.load(open('$DEPLOY'))['markets'][0]['base'])")
PREFIX="${PREFIX:-$(python3 -c "import json;print(json.load(open('$DEPLOY'))['owner'].split('.')[0])")}"
RPC="${NEAR_RPC_URL:-https://rpc.testnet.near.org}"

ONE_NEAR=1000000000000000000000000   # 1e24
USDC_UNIT=1000000                     # 1e6
PRICE=1000000000000                   # contract price scale (1e12) × 1e6 USDC unit per $1 → see price()

# $X.YY → scaled contract price (quote atomic per whole base × 1e12).
price() { python3 -c "from decimal import Decimal as D;print(int(D('$1')*$USDC_UNIT*$PRICE))"; }
near_amt() { python3 -c "from decimal import Decimal as D;print(int(D('$1')*$ONE_NEAR))"; }
usdc_amt() { python3 -c "from decimal import Decimal as D;print(int(D('$1')*$USDC_UNIT))"; }

exists() {
  curl -s "$RPC" -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" |
    grep -q '"amount"'
}

account() { # account <name> → creates <prefix>-<name>.testnet via faucet if missing
  local id="${PREFIX}-$1.testnet"
  if exists "$id"; then
    echo "• $id exists" >&2
  else
    echo "• creating $id via faucet" >&2
    near account create-account sponsor-by-faucet-service "$id" \
      autogenerate-new-keypair save-to-keychain network-config "$NET" create >&2
    sleep 2
  fi
  echo "$id"
}

call() { # call <signer> <contract> <method> <json> <deposit>
  near contract call-function as-transaction "$2" "$3" json-args "$4" prepaid-gas '150.0 Tgas' \
    attached-deposit "$5" sign-as "$1" network-config "$NET" sign-with-keychain send
}

deposit_msg='{\"action\":\"deposit\"}'

# register <who>: storage on wNEAR, tUSDC and the book
register() {
  call "$1" "$WNEAR" storage_deposit '{}' '0.00125 NEAR'
  call "$1" "$USDC" storage_deposit '{}' '0.00125 NEAR'
  call "$1" "$BOOK" storage_deposit '{}' '0.01 NEAR'
}

# fund_book <who> <wnear> <usdc>: wrap/mint and deposit into the book
fund_book() {
  local who=$1 wn; wn=$(near_amt "$2")
  local us; us=$(usdc_amt "$3")
  if [ "$wn" != 0 ]; then
    call "$who" "$WNEAR" near_deposit '{}' "$2 NEAR"
    call "$who" "$WNEAR" ft_transfer_call "{\"receiver_id\":\"$BOOK\",\"amount\":\"$wn\",\"msg\":\"$deposit_msg\"}" '1 yoctoNEAR'
  fi
  if [ "$us" != 0 ]; then
    call "$who" "$USDC" mint "{\"amount\":\"$us\"}" '0 NEAR'
    call "$who" "$USDC" ft_transfer_call "{\"receiver_id\":\"$BOOK\",\"amount\":\"$us\",\"msg\":\"$deposit_msg\"}" '1 yoctoNEAR'
  fi
}

side() { # side <amount_raw> <start $> <end $> <alpha>
  echo "{\"amount\":\"$1\",\"start_price\":\"$(price "$2")\",\"end_price\":\"$(price "$3")\",\"alpha\":$4}"
}

PRIYA=$(account priya)
ARJUN=$(account arjun)
RAHUL=$(account rahul)

echo "== Priya: curve maker (sell 4 wNEAR \$5.04→\$5.20, buy with 2,000 tUSDC \$4.96→\$4.80, alpha 1)"
register "$PRIYA"
fund_book "$PRIYA" 4 2000
call "$PRIYA" "$BOOK" create_position \
  "{\"market_id\":0,\"ask\":$(side "$(near_amt 4)" 5.04 5.20 1),\"bid\":$(side "$(usdc_amt 2000)" 4.96 4.80 1)}" '0.01 NEAR'

echo "== Arjun: limit order (sell 1 wNEAR at \$5.06)"
register "$ARJUN"
fund_book "$ARJUN" 1 0
call "$ARJUN" "$BOOK" create_position \
  "{\"market_id\":0,\"ask\":$(side "$(near_amt 1)" 5.06 5.06 0),\"bid\":null}" '0.01 NEAR'

echo "== Rahul: taker with 1,000 tUSDC in his wallet"
call "$RAHUL" "$WNEAR" storage_deposit '{}' '0.00125 NEAR'
call "$RAHUL" "$USDC" mint "{\"amount\":\"$(usdc_amt 1000)\"}" '0 NEAR'

echo
echo "Seeded. Accounts: $PRIYA $ARJUN $RAHUL"
near contract call-function as-read-only "$BOOK" get_positions json-args '{"market_id":0}' network-config "$NET" now
