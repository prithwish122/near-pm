import Link from "next/link";
import { BOOK, MARKET } from "@/lib/config";
import { avg, fb, fp, fq, route, sellSlip } from "@/lib/docs/calc";
import { C, Callout, CodeBlock, Flow, Formula, H2, H3, Lead, P, Table, UL } from "../ui";

const swapMsg = {
  action: "swap",
  market_id: 0,
  side: "buy_base",
  legs: [
    { position_id: "0", base_amount: route.priyaBase.toString() },
    { position_id: "1", base_amount: route.arjunBase.toString() },
  ],
  min_amount_out: route.size.toString(),
};

export function SwapLifecycle() {
  return (
    <>
      <Lead>
        A swap is one NEP-141 <C>ft_transfer_call</C>. The taker sends the input token to the book with a JSON message listing the legs; the
        book prices, validates and settles everything inside its <C>ft_on_transfer</C>.
      </Lead>

      <H2>Why one transfer call</H2>
      <P>
        NEP-141 has no approve/transferFrom, and every cross-contract call on NEAR is asynchronous: it lands in a later block and can fail on its
        own. If each maker held their own funds, a five-maker fill would be five independent calls that could half-succeed. Ebbflow keeps all
        maker inventory inside the book, so every leg is a local state change in the same receipt, and the swap is atomic.
      </P>

      <H2>The transaction</H2>
      <CodeBlock
        lang="json"
        title={`signed by the taker → ${MARKET.quote}`}
        code={JSON.stringify(
          {
            receiver_id: MARKET.quote,
            method: "ft_transfer_call",
            args: { receiver_id: BOOK, amount: route.amountInMax.toString(), msg: JSON.stringify(swapMsg) },
            gas: "150000000000000",
            deposit: "1",
          },
          null,
          2,
        )}
      />
      <P>
        This is the 200 wNEAR buy from <Link className="text-mint" href="/docs/routing">Routing</Link>: {fq(route.amountInMax)} tUSDC attached
        (cost plus 0.5% headroom), two legs, and a minimum output of exactly 200 wNEAR. <C>ft_transfer_call</C> requires exactly 1 yoctoNEAR
        attached, which forces a full-access key signature.
      </P>

      <H2>Receipt by receipt</H2>
      <Flow
        steps={[
          { who: `1 · ${MARKET.quote}`, what: <><C>ft_transfer_call</C> moves {fq(route.amountInMax)} tUSDC to the book and calls <C>ft_on_transfer</C>.</> },
          { who: "2 · book · simulate", what: <>Checks the token matches the market side, the market is not paused, 1–8 legs, no duplicates, every position exists and is in this market. Prices every leg on a <em>copy</em> of its position. Sums the cost and checks it against the attached amount and <C>min_amount_out</C>.</> },
          { who: "2 · book · commit", what: <>Writes every updated position, applies recycling, appends each fill to the recent-fills ring buffer, emits one <C>fill</C> event per leg and one <C>swap</C> event.</> },
          { who: "2 · book · pay out", what: <>Starts <C>ft_transfer</C> of 200 wNEAR to the recipient with an <C>on_payout</C> callback, and returns the unused input ({fq(route.amountInMax - route.total)} tUSDC) as the refund value.</> },
          { who: `3 · ${MARKET.quote}`, what: <><C>ft_resolve_transfer</C> refunds the unused {fq(route.amountInMax - route.total)} tUSDC to the taker.</> },
          { who: `3 · ${MARKET.base}`, what: "The wNEAR transfer lands in the recipient's wallet." },
          { who: "4 · book · on_payout", what: <>If that transfer failed (e.g. the recipient isn&apos;t registered with wNEAR), credits the amount to the recipient&apos;s book balance and emits <C>payout_credited</C>.</> },
        ]}
      />
      <Callout type="safe" title="Nothing below the simulation can fail">
        <p>
          Everything that can go wrong is checked in the simulate step, before any state is written. If it fails, the book emits{" "}
          <C>swap_rejected</C> and returns the full amount, which the token contract refunds. The only later step that can fail is the payout
          transfer, and its failure is caught and credited.
        </p>
      </Callout>

      <H2>Swap message fields</H2>
      <Table
        head={["Field", "Type", "Meaning"]}
        rows={[
          [<C key="a">action</C>, `"swap"`, "Selects the swap branch (the other is \"deposit\")."],
          [<C key="m">market_id</C>, "u32", "Market to trade in."],
          [<C key="s">side</C>, `"buy_base" | "sell_base"`, "buy: send quote, receive base. sell: send base, receive quote."],
          [<C key="l">legs</C>, "Leg[] (1–8)", "Each { position_id, base_amount }. At most one leg per position."],
          [<C key="o">min_amount_out</C>, "U128 string", "Reject unless total output ≥ this. Must be > 0."],
          [<C key="r">recipient</C>, "AccountId, optional", "Who receives the output. Defaults to the sender."],
        ]}
      />

      <H2>Dry-run before signing</H2>
      <P>The view <C>simulate_swap</C> runs the same simulate step without writing anything:</P>
      <CodeBlock
        code={`near contract call-function as-read-only ${BOOK} simulate_swap \\
  json-args '{"msg":{"market_id":0,"side":"buy_base","legs":[...],"min_amount_out":"..."},"amount":"..."}' \\
  network-config testnet now
# → { "ok": true, "error": null, "legs": [...], "amount_in_used": "...", "amount_out": "...", "refund": "..." }`}
      />
    </>
  );
}

export function Routing() {
  const r = route;
  return (
    <>
      <Lead>
        Given a size, the solver finds the split across makers that minimises total cost (buys) or maximises total proceeds (sells), then prices
        every leg with the exact contract maths.
      </Lead>

      <H2>The optimality condition</H2>
      <P>
        Cost is convex in each leg, so the cheapest split is the one where every maker you use is filled up to the{" "}
        <strong className="text-white">same marginal price p*</strong>, and no unused maker is cheaper than p*. If two legs ended at different
        marginal prices, moving a little size from the more expensive one to the cheaper one would lower the total, so the split could not be
        optimal.
      </P>

      <H2>Water-filling</H2>
      <P>At a candidate price p, each ask side can supply the fraction of its inventory whose marginal price is ≤ p. Inverting p(x) = p_c + s·xᵏ:</P>
      <Formula label="supply of an ask side at price p">{`supply(p) = 0                          if p < p_c
supply(p) = R · ((p − p_c) / s)^(1/k)  if p_c ≤ p < p_e
supply(p) = R                          if p ≥ p_e`}</Formula>
      <P>A limit order (s = 0) supplies nothing below its price and all of R at it.</P>
      <UL>
        <li>Collect candidate sides for the direction (asks to buy, bids to sell), skipping the taker&apos;s own positions and dust whose whole capacity is worth less than one quote atom.</li>
        <li>Bisect on p (200 steps) until Σ supply(p) brackets the requested size. That gives p*.</li>
        <li>Allocate each side its supply just below p*, then share the remainder pro rata among sides whose supply jumps at p* (limit orders sitting exactly at p*).</li>
        <li>A fully used side gets its exact capacity, so no dust is stranded.</li>
        <li>If more than 8 sides are used, keep the 8 contributing most and re-run.</li>
        <li>Price every leg with <C>askFill</C>/<C>bidFill</C> from <C>@ebbflow/curve-math</C>. Floats are only used to choose sizes, never to price.</li>
      </UL>

      <H2>Worked example: buy 200 wNEAR</H2>
      <Table
        head={["Maker", "Side", "Range", "α"]}
        rows={[
          ["Priya", "Ask 400 wNEAR", "$5.04 → $5.20", "1"],
          ["Arjun", "Ask 100 wNEAR", "$5.06 (limit)", "0"],
        ]}
      />
      <H3>Find p*</H3>
      <P>
        Below $5.06 only Priya supplies. She alone could provide 200 wNEAR only by going to x = 0.5, a marginal price of 5.04 + 0.16 × 0.25 =
        $5.08, which is above Arjun&apos;s $5.06. So p* = <strong className="text-white">$5.06</strong>: Priya fills up to $5.06 and Arjun supplies the rest
        at his flat price.
      </P>
      <Formula label="Priya's share">{`5.04 + 0.16 · x² = 5.06   →   x² = 0.125   →   x = 0.353553…
Priya base = 400 · 0.353553… = ${fb(r.priyaBase)} wNEAR
Arjun base = 200 − ${fb(r.priyaBase)}  = ${fb(r.arjunBase)} wNEAR   (of his 100)`}</Formula>
      <H3>Price each leg exactly</H3>
      <Table
        head={["Leg", "wNEAR", "tUSDC", "Avg price", "Price after"]}
        align={["l", "r", "r", "r", "r"]}
        rows={[
          ["Priya", fb(r.priyaBase), fq(r.priya.quote), `$${fp(avg(r.priyaBase, r.priya.quote))}`, `$${fp(r.priya.new_price)}`],
          ["Arjun", fb(r.arjunBase), fq(r.arjun.quote), "$5.06", "$5.06"],
          [<strong key="t" className="text-white">Total</strong>, "200", <strong key="q" className="text-white">{fq(r.total)}</strong>, `$${fp(r.avgP)}`, ""],
        ]}
      />
      <P>
        Both legs end at a marginal price of $5.06, as the optimality condition requires. Buying the same 200 wNEAR from Priya alone costs{" "}
        {fq(r.solo.quote)} tUSDC and pushes her to $5.08, so the split saves the taker <strong className="text-white">{fq(r.saving)} tUSDC</strong>{" "}
        and leaves the book tighter.
      </P>

      <H2>Spending a budget (exact-in)</H2>
      <P>
        For &quot;spend at most 1,000 tUSDC&quot;, the solver binary-searches the largest base size whose exact routed cost fits the budget, so the
        result is the most base the budget can buy, never over budget.
      </P>

      <H2>How good is it?</H2>
      <P>
        The solver tests compare routes against a brute-force grid search over all splits of random three-maker books (all α, both sides). Routes
        are always within 0.01% of the best grid split, and every leg is checked to cost exactly what the contract charges.
      </P>
      <Callout type="note" title="The solver is not trusted">
        <p>
          A bad route can only cost the taker money they agreed to in their limits, and a stale one is refunded. The contract re-prices every leg
          itself; it never takes the solver&apos;s numbers.
        </p>
      </Callout>
    </>
  );
}

export function Slippage() {
  const r = route;
  return (
    <>
      <Lead>
        Between the quote and the transaction landing, another trade can move a curve. Two limits in the swap protect you, and the contract
        enforces both before writing any state.
      </Lead>

      <H2>The two limits</H2>
      <Table
        head={["Limit", "Where", "Contract check", "Error"]}
        rows={[
          ["Max input", <>the attached <C>amount</C></>, "Σ leg inputs ≤ amount", <C key="e">E08_INPUT_EXCEEDED</C>],
          ["Min output", <C key="m">min_amount_out</C>, "Σ leg outputs ≥ min_amount_out, and > 0", <C key="e">E09_MIN_OUT_NOT_MET</C>],
        ]}
      />

      <H2>Buys</H2>
      <P>
        Legs specify base amounts, so a buy&apos;s output is fixed and only its cost can drift. The solver attaches the cost plus slippage headroom
        and sets the minimum output to the exact size:
      </P>
      <Formula>{`amount_in_max  = ⌈ amount_in × (10 000 + slippage_bps) / 10 000 ⌉
min_amount_out = amount_out`}</Formula>
      <Table
        head={["200 wNEAR buy, 50 bps", "tUSDC"]}
        align={["l", "r"]}
        rows={[
          ["Exact cost of the legs (amount_in)", fq(r.total)],
          ["Attached (amount_in_max)", fq(r.amountInMax)],
          ["Refunded in the same transaction if nothing moved", fq(r.amountInMax - r.total)],
        ]}
      />
      <P>If someone buys from Priya first, the same legs cost more. The swap still settles as long as the new cost is ≤ {fq(r.amountInMax)}.</P>

      <H2>Sells</H2>
      <P>A sell sends an exact base amount, so its input is fixed and its proceeds can drift:</P>
      <Formula>{`amount_in      = base sold (exact)
min_amount_out = ⌊ amount_out × (10 000 − slippage_bps) / 10 000 ⌋`}</Formula>
      <Table
        head={["Sell 100 wNEAR into Priya's bid, 50 bps", "tUSDC"]}
        align={["l", "r"]}
        rows={[["Quoted proceeds", fq(sellSlip.out)], ["Minimum accepted", fq(sellSlip.minOut)]]}
      />

      <H2>Price impact</H2>
      <P>Reported with every quote, relative to the best price in the book before the trade:</P>
      <Formula>{`impact_bps = (avg_price − best_price) / best_price × 10 000      (buys; reversed for sells)

200 wNEAR: (${fp(r.avgP)} − ${fp(r.best)}) / ${fp(r.best)} × 10 000 = ${r.impactBps} bps`}</Formula>

      <H2>Settings</H2>
      <UL>
        <li>Default slippage is 50 bps (0.5%). The solver accepts 0–500 bps.</li>
        <li>Slippage only sets a ceiling. You always pay the exact cost of the legs at execution time; the rest comes back.</li>
        <li>If a leg&apos;s position was closed, or no longer has enough inventory, the swap is rejected (<C>E05</C>/<C>E07</C>) regardless of slippage, and refunded. Re-quote and try again.</li>
      </UL>
    </>
  );
}

export function Refunds() {
  return (
    <>
      <Lead>Every way a swap can fail ends in one of two places: your full input back in your wallet, or your output in your book balance. No case leaves a partial fill.</Lead>

      <H2>Rejected before any state change</H2>
      <P>
        These are detected in the simulate step. The book emits <C>swap_rejected</C> with the reason, returns the full amount from{" "}
        <C>ft_on_transfer</C>, and the token contract refunds it to you in the next receipt. The transaction itself succeeds.
      </P>
      <Table
        head={["Reason", "When"]}
        rows={[
          [<C key="1">E02_WRONG_TOKEN</C>, "Sent quote for a sell or base for a buy. (A token that isn't in any market is refunded with an E02 log line.)"],
          [<C key="2">E03_TOO_MANY_LEGS</C>, "0 legs or more than 8"],
          [<C key="3">E04_DUPLICATE_LEG</C>, "The same position twice"],
          [<C key="4">E05_POSITION_NOT_FOUND</C>, "A maker closed their position after you quoted"],
          [<C key="5">E06_MARKET_MISMATCH</C>, "The market doesn't exist, or a position belongs to a different market"],
          [<C key="6">E07_INSUFFICIENT_LIQUIDITY</C>, "A leg is bigger than what the side has left, the side doesn't exist, or base_amount is 0"],
          [<C key="7">E08_INPUT_EXCEEDED</C>, "The legs now cost more than you attached"],
          [<C key="8">E09_MIN_OUT_NOT_MET</C>, "The output is below min_amount_out, or zero"],
          [<C key="9">E13_PAUSED</C>, "The owner paused trading"],
          [<C key="0">E01_INVALID_MSG</C>, "The msg isn't a valid deposit or swap message. Logged rather than emitted as swap_rejected; the full amount is refunded the same way."],
        ]}
      />

      <H2>Settled, but the payout couldn&apos;t be delivered</H2>
      <P>
        If the output transfer fails, typically because the recipient isn&apos;t registered with the output token, <C>on_payout</C> credits the
        amount to the recipient&apos;s book balance and emits <C>payout_credited</C>. The trade stands; register with the token and{" "}
        <C>withdraw</C> it.
      </P>

      <H2>Unused input</H2>
      <P>
        On every successful buy, the difference between what you attached and what the legs cost comes back in the same transaction through the
        token&apos;s <C>ft_resolve_transfer</C>, and is reported as <C>refund</C> in the <C>swap</C> event.
      </P>

      <H2>Withdrawals</H2>
      <P>
        <C>withdraw</C> debits your book balance and sends the tokens. If the transfer fails, <C>on_withdraw</C> restores the balance and logs{" "}
        <C>withdraw failed; … restored</C>. Nothing is lost.
      </P>

      <H2>Deposits</H2>
      <P>A deposit from an account not registered with the book is not accepted: the book logs <C>E14_STORAGE</C> and returns the full amount, which the token refunds.</P>

      <Callout type="tip" title="In the web app">
        <p>
          The result screen reads these events. A rejected swap shows the reason and a Re-quote button; a book-credited payout says where your
          tokens are; and a failed contract call shows the error code in plain words.
        </p>
      </Callout>
    </>
  );
}
