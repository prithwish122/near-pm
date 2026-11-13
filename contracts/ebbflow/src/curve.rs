//! Exact integer curve maths for one side of a position.
//!
//! Prices are quote atomic units per one whole base token, scaled by `PRICE_SCALE`.
//! Both sides are parameterised by the base amount taken, as a fraction `x` of the
//! side's base capacity `B`. With `k = alpha + 1`:
//!
//! * ask (maker sells base): `p(x) = p_c + (p_e - p_c) * x^k`, price rises.
//! * bid (maker buys base):  `p(x) = p_c - (p_c - p_e) * x^k`, price falls.
//!
//! The quote for taking `d` base is the integral `d * [p_c ± span * x^k / (k + 1)]`.
//! Every rounding step goes against the taker.

use near_sdk::near;
mod u256 {
    #![allow(clippy::manual_div_ceil)]
    uint::construct_uint! {
        pub struct U256(4);
    }
}
pub use u256::U256;

/// Prices carry 12 extra decimals of precision.
pub const PRICE_SCALE: u128 = 1_000_000_000_000;
/// Fixed-point scale for the fraction `x`.
pub const FRAC: u128 = 1_000_000_000_000_000_000;
pub const MAX_ALPHA: u8 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CurveError {
    InvalidCurve,
    InsufficientLiquidity,
    ZeroAmount,
    Overflow,
}

/// The remaining segment of one side of a position.
///
/// `remaining` is base for an ask side and quote for a bid side.
#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Side {
    #[serde(with = "u128_string")]
    pub remaining: u128,
    #[serde(with = "u128_string")]
    pub start_price: u128,
    #[serde(with = "u128_string")]
    pub current_price: u128,
    #[serde(with = "u128_string")]
    pub end_price: u128,
    pub alpha: u8,
}

/// Result of taking `base` from a side.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Fill {
    pub base: u128,
    /// Ask: quote the taker pays. Bid: quote the taker receives.
    pub quote: u128,
    pub new_price: u128,
}

impl Side {
    pub fn new(remaining: u128, start_price: u128, end_price: u128, alpha: u8) -> Self {
        Self { remaining, start_price, current_price: start_price, end_price, alpha }
    }

    fn k(&self) -> u32 {
        self.alpha as u32 + 1
    }
}

pub fn validate_ask(s: &Side) -> Result<(), CurveError> {
    if s.remaining == 0 || s.alpha > MAX_ALPHA || s.start_price == 0 || s.start_price > s.end_price
    {
        return Err(CurveError::InvalidCurve);
    }
    Ok(())
}

pub fn validate_bid(s: &Side) -> Result<(), CurveError> {
    if s.remaining == 0 || s.alpha > MAX_ALPHA || s.end_price == 0 || s.start_price < s.end_price
    {
        return Err(CurveError::InvalidCurve);
    }
    Ok(())
}

// ---------- U256 helpers ----------

fn u(x: u128) -> U256 {
    U256::from(x)
}

fn mul(a: U256, b: U256) -> Result<U256, CurveError> {
    a.checked_mul(b).ok_or(CurveError::Overflow)
}

fn add(a: U256, b: U256) -> Result<U256, CurveError> {
    a.checked_add(b).ok_or(CurveError::Overflow)
}

fn div_up(a: U256, b: U256) -> U256 {
    let (q, r) = a.div_mod(b);
    if r.is_zero() {
        q
    } else {
        q + 1
    }
}

fn to_u128(x: U256) -> Result<u128, CurveError> {
    if x > u(u128::MAX) {
        Err(CurveError::Overflow)
    } else {
        Ok(x.as_u128())
    }
}

/// `x^k` in `FRAC` fixed point, rounding up at every step. Requires `x <= FRAC`.
fn pow_frac_up(x: U256, k: u32) -> U256 {
    let frac = u(FRAC);
    let mut r = x;
    for _ in 1..k {
        // r, x <= 1e18 so the product fits easily.
        r = div_up(r * x, frac);
    }
    r
}

/// Quote value of `base` at `price`, rounded up or down.
pub fn value(base: u128, price: u128, base_unit: u128, round_up: bool) -> Result<u128, CurveError> {
    let num = mul(u(base), u(price))?;
    let den = mul(u(base_unit), u(PRICE_SCALE))?;
    to_u128(if round_up { div_up(num, den) } else { num / den })
}

// ---------- ask side ----------

/// Base the ask side can still sell.
pub fn ask_capacity(s: &Side) -> u128 {
    s.remaining
}

/// Taker buys `base` from an ask side. Returns the quote cost (rounded up).
pub fn ask_fill(s: &Side, base_unit: u128, base: u128) -> Result<Fill, CurveError> {
    if base == 0 {
        return Err(CurveError::ZeroAmount);
    }
    if base > s.remaining {
        return Err(CurveError::InsufficientLiquidity);
    }
    let p_c = s.current_price;
    let span = s.end_price - p_c;
    let k = s.k();
    let k1 = u(k as u128 + 1);

    let xk = if span == 0 {
        U256::zero()
    } else {
        let x = div_up(mul(u(base), u(FRAC))?, u(s.remaining));
        pow_frac_up(x, k)
    };

    // cost = base * (p_c*FRAC*(k+1) + span*xk) / (FRAC*(k+1)*base_unit*PRICE_SCALE)
    let avg_num = add(mul(mul(u(p_c), u(FRAC))?, k1)?, mul(u(span), xk)?)?;
    let num = mul(u(base), avg_num)?;
    let den = mul(mul(mul(u(FRAC), k1)?, u(base_unit))?, u(PRICE_SCALE))?;
    let quote = to_u128(div_up(num, den))?;

    let new_price = if base == s.remaining {
        s.end_price
    } else {
        let step = to_u128(div_up(mul(u(span), xk)?, u(FRAC)))?;
        (p_c + step).min(s.end_price)
    };
    Ok(Fill { base, quote, new_price })
}

// ---------- bid side ----------

/// Base the bid side can still buy if its whole remaining curve is consumed (rounded down).
pub fn bid_capacity(s: &Side, base_unit: u128) -> Result<u128, CurveError> {
    if s.remaining == 0 {
        return Ok(0);
    }
    let k = s.k() as u128;
    let span = s.current_price - s.end_price;
    // avg_price * (k+1) = p_c*(k+1) - span = p_c*k + p_e > 0
    let den = mul(u(s.current_price), u(k + 1))?
        .checked_sub(u(span))
        .ok_or(CurveError::Overflow)?;
    let num = mul(mul(mul(u(s.remaining), u(base_unit))?, u(PRICE_SCALE))?, u(k + 1))?;
    to_u128(num / den)
}

/// Taker sells `base` into a bid side. Returns the quote output (rounded down).
pub fn bid_fill(s: &Side, base_unit: u128, base: u128) -> Result<Fill, CurveError> {
    if base == 0 {
        return Err(CurveError::ZeroAmount);
    }
    let cap = bid_capacity(s, base_unit)?;
    if base > cap {
        return Err(CurveError::InsufficientLiquidity);
    }
    let p_c = s.current_price;
    let span = p_c - s.end_price;
    let k = s.k();
    let k1 = u(k as u128 + 1);

    let xk = if span == 0 {
        U256::zero()
    } else {
        let x = div_up(mul(u(base), u(FRAC))?, u(cap));
        pow_frac_up(x, k)
    };

    // out = base * (p_c*FRAC*(k+1) - span*xk) / (FRAC*(k+1)*base_unit*PRICE_SCALE)
    // span <= p_c and xk <= FRAC, so the subtraction cannot underflow.
    let avg_num = mul(mul(u(p_c), u(FRAC))?, k1)? - mul(u(span), xk)?;
    let num = mul(u(base), avg_num)?;
    let den = mul(mul(mul(u(FRAC), k1)?, u(base_unit))?, u(PRICE_SCALE))?;
    let quote = to_u128(num / den)?.min(s.remaining);

    let new_price = if base == cap {
        s.end_price
    } else {
        let step = to_u128(div_up(mul(u(span), xk)?, u(FRAC)))?;
        p_c.saturating_sub(step).max(s.end_price)
    };
    Ok(Fill { base, quote, new_price })
}

/// Serialise u128 as a decimal string in JSON.
pub mod u128_string {
    use near_sdk::serde::{de, Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(v: &u128, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&v.to_string())
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<u128, D::Error> {
        String::deserialize(d)?.parse().map_err(de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    const WNEAR: u128 = 1_000_000_000_000_000_000_000_000; // 1e24
    const USDC: u128 = 1_000_000; // 1e6

    /// Human price in cents -> scaled price for a 6-decimal quote.
    fn cents(c: u128) -> u128 {
        c * USDC / 100 * PRICE_SCALE
    }

    fn near(n: u128) -> u128 {
        n * WNEAR
    }

    fn usdc(n: u128) -> u128 {
        n * USDC
    }

    // TST-U1
    #[test]
    fn ask_alpha0_matches_closed_form() {
        // 400 base from $5.00 to $5.40 linear. Taking 100 → x = 1/4.
        // avg = 5.00 + 0.40 * 0.25 / 2 = 5.05 → cost 505.
        let s = Side::new(near(400), cents(500), cents(540), 0);
        let f = ask_fill(&s, WNEAR, near(100)).unwrap();
        assert_eq!(f.quote, usdc(505));
        assert_eq!(f.new_price, cents(510));
    }

    // TST-U2
    #[test]
    fn ask_alpha1_to_3() {
        // Taking everything from a side costs base * (p_c + span/(k+1)).
        for alpha in 0..=3u8 {
            let k1 = alpha as u128 + 2;
            let s = Side::new(near(100), cents(500), cents(500) + cents(100) * k1 / 100, alpha);
            // span = k1 cents, so avg premium = 1 cent; cost = 100 * 5.01 = 501
            let f = ask_fill(&s, WNEAR, near(100)).unwrap();
            assert_eq!(f.quote, usdc(501), "alpha {alpha}");
            assert_eq!(f.new_price, s.end_price);
        }
    }

    // TST-U3
    #[test]
    fn bid_alpha0_and_capacity() {
        // 1,010 USDC from $5.20 down to $4.90, linear: avg over full = 5.05 → capacity 200.
        let s = Side::new(usdc(1010), cents(520), cents(490), 0);
        assert_eq!(bid_capacity(&s, WNEAR).unwrap(), near(200));
        // Sell 100 → x = 1/2, avg = 5.20 - 0.30*0.5/2 = 5.125 → 512.5
        let f = bid_fill(&s, WNEAR, near(100)).unwrap();
        assert_eq!(f.quote, 512_500_000);
        assert_eq!(f.new_price, cents(505));
    }

    #[test]
    fn bid_alpha1_to_3_full_consumption_returns_inventory() {
        for alpha in 0..=3u8 {
            let s = Side::new(usdc(2000), cents(496), cents(480), alpha);
            let cap = bid_capacity(&s, WNEAR).unwrap();
            let f = bid_fill(&s, WNEAR, cap).unwrap();
            assert!(f.quote <= s.remaining);
            assert!(s.remaining - f.quote <= 2, "alpha {alpha}: dust {}", s.remaining - f.quote);
            assert_eq!(f.new_price, s.end_price);
        }
    }

    // TST-U4
    #[test]
    fn limit_order_constant_price() {
        let s = Side::new(near(100), cents(506), cents(506), 0);
        for n in [1u128, 10, 58, 100] {
            let f = ask_fill(&s, WNEAR, near(n)).unwrap();
            assert_eq!(f.quote, usdc(n) * 506 / 100);
            assert_eq!(f.new_price, cents(506));
        }
        let b = Side::new(usdc(496), cents(496), cents(496), 2);
        assert_eq!(bid_capacity(&b, WNEAR).unwrap(), near(100));
        assert_eq!(bid_fill(&b, WNEAR, near(50)).unwrap().quote, usdc(248));
    }

    // TST-U5
    #[test]
    fn rounding_against_taker() {
        // 1 atomic base at $5.04 is worth 5.04e-18 atomic quote: cost rounds up to 1, output down to 0.
        let a = Side::new(near(1), cents(504), cents(504), 0);
        assert_eq!(ask_fill(&a, WNEAR, 1).unwrap().quote, 1);
        let b = Side::new(usdc(5), cents(504), cents(504), 0);
        assert_eq!(bid_fill(&b, WNEAR, 1).unwrap().quote, 0);
    }

    // TST-U6
    #[test]
    fn full_consumption_moves_to_end_price() {
        let s = Side::new(near(400), cents(504), cents(520), 1);
        let f = ask_fill(&s, WNEAR, near(400)).unwrap();
        assert_eq!(f.new_price, cents(520));
        assert_eq!(ask_fill(&s, WNEAR, near(400) + 1), Err(CurveError::InsufficientLiquidity));
        assert_eq!(ask_fill(&s, WNEAR, 0), Err(CurveError::ZeroAmount));
    }

    // TST-U9
    #[test]
    fn validation() {
        assert!(validate_ask(&Side::new(1, 5, 5, 0)).is_ok());
        assert_eq!(validate_ask(&Side::new(1, 6, 5, 0)), Err(CurveError::InvalidCurve));
        assert_eq!(validate_ask(&Side::new(0, 5, 6, 0)), Err(CurveError::InvalidCurve));
        assert_eq!(validate_ask(&Side::new(1, 0, 6, 0)), Err(CurveError::InvalidCurve));
        assert_eq!(validate_ask(&Side::new(1, 5, 6, 4)), Err(CurveError::InvalidCurve));
        assert!(validate_bid(&Side::new(1, 6, 5, 3)).is_ok());
        assert_eq!(validate_bid(&Side::new(1, 5, 6, 0)), Err(CurveError::InvalidCurve));
        assert_eq!(validate_bid(&Side::new(1, 5, 0, 0)), Err(CurveError::InvalidCurve));
    }

    // TST-U10: the PRD §7.8 worked example.
    #[test]
    fn prd_worked_example() {
        let priya = Side::new(near(400), cents(504), cents(520), 1);
        let arjun = Side::new(near(100), cents(506), cents(506), 0);
        // Priya supplies until her marginal reaches $5.06: x = sqrt(0.125) → 141.4213562 wNEAR
        let priya_base = 141_421_356_237_309_504_880_168_872u128; // 400 * sqrt(0.125) * 1e24
        let arjun_base = near(200) - priya_base;
        let p = ask_fill(&priya, WNEAR, priya_base).unwrap();
        let a = ask_fill(&arjun, WNEAR, arjun_base).unwrap();
        // Priya ≈ $713.70, Arjun ≈ $296.41, total ≈ $1,010.11
        assert!((p.quote as i128 - 713_703_000).abs() < 10_000, "priya {}", p.quote);
        assert!((a.quote as i128 - 296_408_000).abs() < 10_000, "arjun {}", a.quote);
        assert!(((p.quote + a.quote) as i128 - 1_010_111_000).abs() < 20_000);
        assert!((p.new_price as i128 - cents(506) as i128).abs() < PRICE_SCALE as i128);
    }

    // TST-U11
    #[test]
    fn large_amounts_do_not_overflow() {
        // 1e9 wNEAR at $1,000,000
        let s = Side::new(near(1_000_000_000), cents(100_000_000), cents(200_000_000), 3);
        let f = ask_fill(&s, WNEAR, near(999_999_999)).unwrap();
        assert!(f.quote > 0);
        let b = Side::new(usdc(1_000_000_000_000), cents(100_000_000), cents(1), 3);
        let cap = bid_capacity(&b, WNEAR).unwrap();
        assert!(bid_fill(&b, WNEAR, cap / 2).unwrap().quote > 0);
    }

    // TST-U12
    #[test]
    fn alpha0_path_independent() {
        let s = Side::new(near(400), cents(504), cents(520), 0);
        let whole = ask_fill(&s, WNEAR, near(100)).unwrap();
        let first = ask_fill(&s, WNEAR, near(50)).unwrap();
        let mut s2 = s.clone();
        s2.remaining -= near(50);
        s2.current_price = first.new_price;
        let second = ask_fill(&s2, WNEAR, near(50)).unwrap();
        assert!((first.quote + second.quote).abs_diff(whole.quote) <= 2);
        assert!(second.new_price.abs_diff(whole.new_price) <= 2);
    }

    // ---------- property tests (TST-P1, TST-P3, TST-P4) ----------

    fn reference_ask(s: &Side, base: u128) -> f64 {
        let r = s.remaining as f64;
        let x = base as f64 / r;
        let k = s.alpha as i32 + 1;
        let span = (s.end_price - s.current_price) as f64;
        let avg = s.current_price as f64 + span * x.powi(k) / (k + 1) as f64;
        base as f64 * avg / (WNEAR as f64 * PRICE_SCALE as f64)
    }

    fn reference_bid(s: &Side, cap: u128, base: u128) -> f64 {
        let x = base as f64 / cap as f64;
        let k = s.alpha as i32 + 1;
        let span = (s.current_price - s.end_price) as f64;
        let avg = s.current_price as f64 - span * x.powi(k) / (k + 1) as f64;
        base as f64 * avg / (WNEAR as f64 * PRICE_SCALE as f64)
    }

    fn arb_ask() -> impl Strategy<Value = (Side, u128)> {
        (1u128..1_000_000, 1u128..100_000, 0u128..100_000, 0u8..=3, 1u128..=1000).prop_map(
            |(inv, p0, span, alpha, permille)| {
                let s = Side::new(near(inv), cents(p0), cents(p0 + span), alpha);
                let base = (s.remaining / 1000 * permille).max(1);
                (s, base)
            },
        )
    }

    fn arb_bid() -> impl Strategy<Value = (Side, u128)> {
        (1u128..1_000_000_000, 2u128..100_000, 0u128..100, 0u8..=3, 1u128..=1000).prop_map(
            |(inv, p0, span_pct, alpha, permille)| {
                let p_e = (p0 * (100 - span_pct) / 100).max(1);
                let s = Side::new(usdc(inv), cents(p0), cents(p_e), alpha);
                let cap = bid_capacity(&s, WNEAR).unwrap();
                (s, (cap / 1000 * permille).max(1))
            },
        )
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(2000))]

        #[test]
        fn ask_matches_reference_and_favours_maker((s, base) in arb_ask()) {
            let f = ask_fill(&s, WNEAR, base).unwrap();
            let r = reference_ask(&s, base);
            // Within 1 unit plus float noise, and never below the reference.
            prop_assert!(f.quote as f64 >= r * (1.0 - 1e-12) - 1e-6, "cost {} < ref {}", f.quote, r);
            prop_assert!(f.quote as f64 <= r * (1.0 + 1e-9) + 1.0, "cost {} >> ref {}", f.quote, r);
            // TST-P3: maker never sells below the pre-fill marginal price.
            prop_assert!(f.quote >= value(base, s.current_price, WNEAR, false).unwrap());
            // TST-P4: price moves monotonically within the range.
            prop_assert!(f.new_price >= s.current_price && f.new_price <= s.end_price);
        }

        #[test]
        fn bid_matches_reference_and_favours_maker((s, base) in arb_bid()) {
            let cap = bid_capacity(&s, WNEAR).unwrap();
            let f = bid_fill(&s, WNEAR, base).unwrap();
            let r = reference_bid(&s, cap, base);
            prop_assert!(f.quote as f64 <= r * (1.0 + 1e-12) + 1e-6, "out {} > ref {}", f.quote, r);
            prop_assert!(f.quote as f64 >= r * (1.0 - 1e-9) - 1.0, "out {} << ref {}", f.quote, r);
            prop_assert!(f.quote <= s.remaining);
            prop_assert!(f.quote <= value(base, s.current_price, WNEAR, true).unwrap());
            prop_assert!(f.new_price <= s.current_price && f.new_price >= s.end_price);
        }
    }
}
