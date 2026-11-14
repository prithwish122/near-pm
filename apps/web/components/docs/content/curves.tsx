import Link from "next/link";
import { askStep, askTable, bidStep, bidTable, encoding, fb, fp, fq, PRIYA, raw, reanchor, shapes } from "@/lib/docs/calc";
import { C, Callout, CodeBlock, Formula, H2, H3, Lead, P, Table, UL } from "../ui";

export function CurveModel() {
  return (
    <>
      <Lead>
        Every side of a position is a bounded curve: a price range, an amount and a shape. This page gives the exact formulas the contract
        evaluates. Each one is the closed-form integral of the marginal price, so a fill of any size is priced in O(1) with no loops.
      </Lead>

      <H2>Parameters</H2>
      <Table
        head={["Symbol", "Contract field", "Meaning"]}
        rows={[
          ["R", <C key="r">remaining</C>, "Ask: base left to sell. Bid: quote left to spend."],
          ["p_c", <C key="c">current_price</C>, "Marginal price right now (starts at start_price)."],
          ["p_e", <C key="e">end_price</C>, "Price of the very last unit."],
          ["α, k", <C key="a">alpha</C>, "Shape α ∈ {0,1,2,3}; exponent k = α + 1."],
          ["s", "—", "Span: |p_e − p_c|, the distance the price can still travel."],
          ["b", <C key="b">base_amount</C>, "Size of this fill, always in base."],
        ]}
      />

      <H2>Ask side (taker buys base)</H2>
      <P>The fraction of the remaining inventory taken is x = b / R. The marginal price after taking it rises along a power curve:</P>
      <Formula label="marginal price after the fill">{`p(x) = p_c + s · xᵏ          s = p_e − p_c`}</Formula>
      <P>The taker pays the area under that curve, which integrates to a closed form:</P>
      <Formula label="quote cost of buying b">{`cost(b) = ∫₀ᵇ p(t/R) dt
        = b · ( p_c + s · xᵏ / (k + 1) )`}</Formula>
      <P>
        So the average price of the fill is p_c + s·xᵏ/(k+1): it starts at the current price and reaches at most p_c + s/(k+1) when the whole
        side is bought. After the fill, <C>current_price</C> becomes p(x) and <C>remaining</C> becomes R − b.
      </P>
      <H3>Example: Priya&apos;s ask</H3>
      <P>
        {PRIYA.ask.amount} wNEAR from ${PRIYA.ask.start} to ${PRIYA.ask.end}, α = {PRIYA.ask.alpha} (k = 2). Buying from the untouched curve:
      </P>
      <Table
        head={["Buy (wNEAR)", "x = b/R", "Cost (tUSDC)", "Avg price", "Price after"]}
        align={["r", "r", "r", "r", "r"]}
        rows={askTable.map((t) => [t.size, (Number(t.size) / 400).toString(), fq(t.cost), `$${fp(t.avg)}`, `$${fp(t.newPrice)}`])}
      />
      <P>Buying all 400 moves the price to exactly $5.20 at an average of $5.04 + 0.16/3 = $5.093333.</P>

      <H2>Bid side (taker sells base)</H2>
      <P>
        A bid holds quote, but takers specify fills in base. The contract first converts the bid into a base <strong className="text-white">capacity</strong>{" "}
        C: the base it would buy if its whole curve were consumed. That&apos;s the R for which the proceeds formula pays out exactly the remaining quote:
      </P>
      <Formula label="bid capacity in base">{`C = R · (k + 1) / ( p_c · (k + 1) − s )          s = p_c − p_e`}</Formula>
      <P>Then, with x = b / C, the price falls as the bid fills and the taker receives the area under it:</P>
      <Formula label="marginal price and proceeds">{`p(x)        = p_c − s · xᵏ
proceeds(b) = b · ( p_c − s · xᵏ / (k + 1) )`}</Formula>
      <H3>Example: Priya&apos;s bid</H3>
      <P>
        {PRIYA.bid.amount} tUSDC from ${PRIYA.bid.start} down to ${PRIYA.bid.end}, α = 1. Capacity C = 2000 · 3 / (4.96 · 3 − 0.16) ={" "}
        <strong className="text-white">{fb(bidStep.cap)} wNEAR</strong>.
      </P>
      <Table
        head={["Sell (wNEAR)", "Proceeds (tUSDC)", "Avg price", "Price after"]}
        align={["r", "r", "r", "r"]}
        rows={bidTable.map((t) => [t.size, fq(t.proceeds), `$${fp(t.avg)}`, `$${fp(t.newPrice)}`])}
      />

      <H2>Re-anchoring after a fill</H2>
      <P>
        The contract stores only the current state, not the original curve. After each fill it re-anchors: the new curve runs from the new{" "}
        <C>current_price</C> to the same <C>end_price</C> over the new <C>remaining</C>, with the same α. For α = 0 (a straight line) this is
        exactly the original curve. For α ≥ 1 it isn&apos;t, so the price path depends on how a size is split:
      </P>
      <Table
        head={["Buying 200 wNEAR from Priya", "Cost (tUSDC)", "Price after"]}
        align={["l", "r", "r"]}
        rows={[
          ["One fill of 200", fq(reanchor.one.quote), `$${fp(reanchor.one.new_price)}`],
          ["100, then 100", `${fq(reanchor.f1.quote)} + ${fq(reanchor.f2.quote)} = ${fq(reanchor.split)}`, `$${fp(reanchor.f2.new_price)}`],
        ]}
      />
      <Callout type="note" title="What this means in practice">
        <p>
          With α ≥ 1, consecutive small fills are slightly cheaper for takers than one large fill, and they leave the curve lower. Every fill is
          still priced on a curve that only rises (asks) or falls (bids), and no fill is ever below the current marginal price. Makers who want a
          path-independent curve choose α = 0.
        </p>
      </Callout>

      <H2>Invariants</H2>
      <UL>
        <li>Asks require <C>start_price ≤ end_price</C>; bids require <C>start_price ≥ end_price</C>; both require a non-zero amount and price and α ≤ 3 (<C>E12_INVALID_CURVE</C>).</li>
        <li>A two-sided position must not be crossed: the bid must start strictly below the ask (<C>E15_CROSSED_POSITION</C>).</li>
        <li>The marginal price never leaves [start, end]. Filling the whole side lands exactly on <C>end_price</C>.</li>
        <li>All rounding favours the maker: takers pay rounded up and receive rounded down. See <Link className="text-mint" href="/docs/units-and-precision">Units &amp; precision</Link>.</li>
      </UL>
    </>
  );
}

export function WorkedExample() {
  const s = askStep;
  return (
    <>
      <Lead>
        This page prices one real fill exactly as <C>ask_fill</C> in <C>contracts/ebbflow/src/curve.rs</C> does: in integers, with
        fixed-point fractions and upward rounding. The numbers are computed at build time by the same library the solver uses.
      </Lead>

      <H2>The trade</H2>
      <P>
        A taker buys <strong className="text-white">100 wNEAR</strong> from Priya&apos;s untouched ask: {PRIYA.ask.amount} wNEAR, ${PRIYA.ask.start} → $
        {PRIYA.ask.end}, α = 1.
      </P>

      <H2>1. Encode the inputs</H2>
      <Table
        head={["Value", "Human", "Raw integer", "Why"]}
        align={["l", "r", "r", "l"]}
        rows={[
          ["b (base)", "100 wNEAR", raw(s.base), "wNEAR has 24 decimals"],
          ["R (remaining)", "400 wNEAR", raw(s.s.remaining), "24 decimals"],
          ["p_c", "$5.04", raw(s.pc), "5.04 × 10⁶ (tUSDC) × 10¹² (scale)"],
          ["p_e", "$5.20", raw(s.pe), "same scale"],
          ["s = p_e − p_c", "$0.16", raw(s.span), ""],
          ["k", "2", "2", "α + 1"],
          ["FRAC", "1.0", raw(10n ** 18n), "fixed-point one"],
        ]}
      />

      <H2>2. Fraction taken, x = b / R</H2>
      <P>Computed in 18-decimal fixed point and rounded up:</P>
      <Formula>{`x = ⌈ b · FRAC / R ⌉
  = ⌈ (100 × 10²⁴) · 10¹⁸ / (400 × 10²⁴) ⌉
  = ${raw(s.x)}   (0.25)`}</Formula>

      <H2>3. Power, xᵏ</H2>
      <P>Multiplied out one step at a time, rounding up after each multiplication:</P>
      <Formula>{`x² = ⌈ x · x / FRAC ⌉ = ${raw(s.xk)}      (0.0625)`}</Formula>

      <H2>4. Cost</H2>
      <P>The closed form b·(p_c + s·xᵏ/(k+1)) is evaluated as one fraction so that only a single rounding happens, in U256:</P>
      <Formula>{`numerator   = b · ( p_c · FRAC · (k+1)  +  s · xᵏ )
denominator = FRAC · (k+1) · 10²⁴ · 10¹²
cost        = ⌈ numerator / denominator ⌉`}</Formula>
      <CodeBlock
        lang="text"
        title="values"
        code={`numerator   = ${raw(s.num)}
denominator = ${raw(s.den)}
cost        = ${raw(s.quote)}   →  ${fq(s.quote)} tUSDC`}
      />
      <P>
        Check: 100 × (5.04 + 0.16 × 0.0625 / 3) = 100 × 5.0433333… = 504.33333… tUSDC. tUSDC has 6 decimals, so the contract rounds up to{" "}
        <strong className="text-white">{fq(s.quote)}</strong>. The extra 0.000000667 favours the maker.
      </P>

      <H2>5. New marginal price</H2>
      <Formula>{`step      = ⌈ s · xᵏ / FRAC ⌉ = ${raw(s.step)}     ($${fp(s.step)})
new price = p_c + step       = ${raw(s.newPrice)}  ($${fp(s.newPrice)})`}</Formula>
      <P>If the fill had taken the whole side, the contract would set the price to <C>end_price</C> directly instead.</P>

      <H2>6. State after the fill</H2>
      <Table
        head={["Field", "Before", "After"]}
        align={["l", "r", "r"]}
        rows={[
          [<C key="a">ask.remaining</C>, "400 wNEAR", "300 wNEAR"],
          [<C key="b">ask.current_price</C>, "$5.04", `$${fp(s.newPrice)}`],
          [<C key="c">bid.remaining</C>, "2000 tUSDC", `${fq(2000_000000n + s.quote)} tUSDC (recycled)`],
          [<C key="d">stats.base_sold</C>, "0", "100 wNEAR"],
          [<C key="e">stats.quote_received</C>, "0", `${fq(s.quote)} tUSDC`],
          [<C key="f">stats.fills</C>, "0", "1"],
        ]}
      />
      <Callout type="tip" title="Reproduce it yourself">
        <p>Ask the contract directly. The view prices one leg without changing state and must return the same numbers:</p>
      </Callout>
      <CodeBlock
        code={`near contract call-function as-read-only <book> quote_leg \\
  json-args '{"position_id":"<priya>","side":"buy_base","base_amount":"${s.base}"}' \\
  network-config testnet now
# → { "ok": true, "quote_amount": "${s.quote}", "new_price": "${s.newPrice}" }`}
      />
    </>
  );
}

export function CurveShapes() {
  return (
    <>
      <Lead>
        Alpha controls where on the range a maker&apos;s liquidity sits. All four shapes below sell the same 400 wNEAR between $5.04 and
        $5.20. Only the exponent differs.
      </Lead>

      <H2>Marginal price by fill level</H2>
      <Table
        head={["α", "k", "25% filled", "50% filled", "75% filled", "100% filled"]}
        align={["l", "r", "r", "r", "r", "r"]}
        rows={shapes.map((r) => [String(r.alpha), String(r.k), `$${fp(r.p25)}`, `$${fp(r.p50)}`, `$${fp(r.p75)}`, "$5.20"])}
      />

      <H2>Cost to the taker</H2>
      <Table
        head={["α", "Buy 200: cost", "Buy 200: avg", "Buy all 400: cost", "Buy all 400: avg"]}
        align={["l", "r", "r", "r", "r"]}
        rows={shapes.map((r) => [String(r.alpha), fq(r.halfCost), `$${fp(r.halfAvg)}`, fq(r.fullCost), `$${fp(r.fullAvg)}`])}
      />
      <P>
        The full-side average is always p_c + s/(k+1): $5.12, $5.0933, $5.08 and $5.072. Higher α keeps the price near the start for longer and
        then rises steeply near the end.
      </P>

      <H2>Choosing a shape</H2>
      <Table
        head={["α", "Shape", "Liquidity sits…", "Use when"]}
        rows={[
          ["0", "Linear", "Evenly across the range", "You have no view inside the range, or want path-independent pricing."],
          ["1", "Quadratic", "Mostly near the start", "Default. Tight near the market, still widening toward the edge."],
          ["2", "Cubic", "Concentrated near the start", "You are confident about the near price and want to compete for flow."],
          ["3", "Quartic", "Heavily at the start", "Behaves almost like a limit order at the start with a protective tail."],
        ]}
      />
      <Callout type="note" title="Why only integer alpha?">
        <p>
          Integer exponents mean xᵏ is a few fixed-point multiplications with checked U256 arithmetic. A fractional exponent would need logs or
          roots, which are not exact in integers. Exact, reproducible rounding matters more here than a continuous shape parameter.
        </p>
      </Callout>

      <H2>Limit orders</H2>
      <P>
        Set <C>start_price = end_price</C>. Then s = 0, the xᵏ term disappears, and every unit trades at one price: cost = b · p_c. Arjun&apos;s
        &quot;sell 100 wNEAR at $5.06&quot; is exactly this, and it goes through the same code path as any curve.
      </P>
    </>
  );
}

export function UnitsAndPrecision() {
  return (
    <>
      <Lead>Everything on-chain is an unsigned integer. This page shows how amounts and prices are encoded and which way every division rounds.</Lead>

      <H2>Token amounts</H2>
      <Table
        head={["Token", "Decimals", "1 whole token", "Contract"]}
        align={["l", "r", "r", "l"]}
        rows={[
          ["wNEAR (base)", "24", "1_000_000_000_000_000_000_000_000", <C key="w">wrap.testnet</C>],
          ["tUSDC (quote)", "6", "1_000_000", <C key="u">usdc.ebbflow-team.testnet</C>],
        ]}
      />
      <P>All amounts in JSON are decimal strings (NEAR&apos;s <C>U128</C>), because JavaScript numbers can&apos;t hold them exactly.</P>

      <H2>Prices</H2>
      <P>A price is quote atoms per <em>whole</em> base token, multiplied by <C>PRICE_SCALE</C> = 10¹² for sub-atomic precision:</P>
      <Formula>{`price_raw = human_price × 10^quote_decimals × 10¹²

$${encoding.human}  →  ${encoding.human} × 10⁶ × 10¹²  =  ${raw(encoding.price)}`}</Formula>
      <P>Converting a base amount to its quote value at a price:</P>
      <Formula>{`value(base, price) = base × price / ( 10^base_decimals × 10¹² )

value(1 wNEAR, $5.04) = ${raw(encoding.oneBase)} × ${raw(encoding.price)}
                        / ( 10²⁴ × 10¹² )
                      = ${raw(encoding.value)}   →  5.04 tUSDC`}</Formula>
      <CodeBlock
        lang="ts"
        title="@ebbflow/curve-math"
        code={`import { parsePrice, formatPrice, parseUnits } from "@ebbflow/curve-math";

parsePrice("5.04", 6);              // ${encoding.price}n
formatPrice(${encoding.price}n, 6); // "5.04"
parseUnits("1.5", 24);              // 1500000000000000000000000n`}
      />

      <H2>Intermediate precision</H2>
      <UL>
        <li>Fractions (x and xᵏ) are 18-decimal fixed point: <C>FRAC</C> = 10¹⁸.</li>
        <li>Products such as b · p_c · FRAC · (k+1) exceed 128 bits, so the contract computes in U256 and checks the final result fits in u128 (<C>E16_MATH_OVERFLOW</C> otherwise).</li>
        <li>Each fill does a single final division, so rounding error is at most one atom of the output token.</li>
      </UL>

      <H2>Rounding direction</H2>
      <Table
        head={["Quantity", "Rounds", "Effect"]}
        rows={[
          ["x = b / R (ask) or b / C (bid)", "up", "Price moves at least as far as the exact maths"],
          ["xᵏ", "up at each step", "Same"],
          ["Ask cost (taker pays)", "up", "Taker pays ≤ 1 atom extra"],
          ["Bid proceeds (taker receives)", "down", "Taker receives ≤ 1 atom less"],
          ["Bid capacity C", "down", "A bid can never promise more base than its quote covers"],
          ["New marginal price step", "up (ask) / down (bid)", "Curve state never moves in the taker's favour"],
        ]}
      />
      <Callout type="safe" title="Makers never trade through their own curve">
        <p>
          Because every rounding goes against the taker, a maker never sells below the pre-fill marginal price and never buys above it. The
          property tests in <C>curve.rs</C> check this on 2,000 random curves per side, together with: the integer result is within one atom of
          the exact real-valued integral, and the new price stays inside [start, end].
        </p>
      </Callout>

      <H2>The TypeScript port</H2>
      <P>
        <C>packages/curve-math</C> re-implements the maths with <C>bigint</C>. The Rust test <C>export_fixtures</C> writes 400 cases (all α,
        random ranges and sizes, both sides) to <C>fixtures/curve.json</C>, and the TypeScript tests require bit-for-bit equality. The solver
        prices every leg with this port, which is why quotes match settlement exactly.
      </P>
    </>
  );
}
