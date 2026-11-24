# Token Radar — Calibrated Edition

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Tidaksukasatir/token-radar-v3/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Tidaksukasatir/token-radar-v3/reward.svg)](https://make.fun/bounty/token-radar-01)

Token Radar ranks DeFi protocols that have not yet issued a token, by an implied value derived from their own on-chain footprint — and, unlike a point estimate alone, it shows the range the value could be. It reads a sealed snapshot of DefiLlama's protocol index, scores every pre-token protocol with a single transparent model, and renders a static, offline dashboard a reader can sort, filter and drill into.

## What it answers

A "launch" is the token a protocol may issue one day. This radar does **not** predict whether or when a protocol issues a token. It answers a narrower, answerable question: *if* a protocol's record stayed as it is today, what would a fair launch be worth, what is the range it could be worth, and what should a farmer do before and after it?

The snapshot carries no ranking, no value and no strategy. Every number this dashboard shows is derived from ten fields per protocol — TVL, seven-day change, category, chains, listing age, and the token-absence signals — using one function stated in full on the page.

## The value model (`radar-4`)

```
implied = round( tvl_usd × FITTED
  × (1 + clamp(change_7d, G_FLOOR, G_CAP)/100 × G_W)
  × (M_FLOOR + min(age_days, M_DAYS)/M_DAYS × M_RANGE)
  × (1 + (chain_count − 1) × CHAIN_W) )
```

| Term | Meaning | Source |
| --- | --- | --- |
| `tvl_usd × FITTED` | The economic base: a launch is worth a fraction of the capital already committed. FITTED is the median market-cap / TVL of the protocol's own category bucket, fitted from the snapshot's live-token protocols — never hand-set | snapshot TVL + live peers |
| growth multiplier | Momentum: protocols growing on-chain attract more of a launch's distribution | `change_7d` |
| maturity multiplier | Track record: a protocol running years without a token has proven staying power | `listed_at` age |
| breadth multiplier | Multi-chain protocols reach more users at launch | `chains.length` |

The constants are fixed in `lib/model.ts` and shown on the page. No protocol name is special-cased: the same function scores every row, so the ranking is reproducible from the snapshot alone.

## The range: P10–P90, calibrated to hold 80%

A point estimate is the best single number; the range is the honest one. Every row carries a P10–P90 range: the 10th and 90th percentiles of market-cap / TVL across **all** of the snapshot's live-token protocols (a bucket holds 5–21 peers, too few for a stable percentile — the bucket sets the row's centre, the whole market sets its width), widened ×1.10, times the row's own adjustments. The widening is the smallest of 1.00 / 1.05 / 1.10 / 1.15 whose mean held-out coverage reaches 80%.

Measured, not claimed: the ranges hold **83.1%** on one held-out half of the live protocols and **79.7%** on the other (mean 81.4%, target 80%). A $100M point with a $2M–$900M range is a guess with a wide error bar, and the board says so instead of hiding it.

## Every value term, tested held-out

For each of the four terms the dashboard shows the held-out ranking (Spearman) with the term and without it, on both halves, beside a TVL-only baseline. The table is the evidence, including where a term adds nothing: maturity is near-neutral on both halves, and the category multiple — the biggest term — helps one half and hurts the other, which is within noise at ~60 protocols a half. Nothing here is claimed that the table does not show.

## Five build-time checks

The program refuses to write a board that fails any of them, and the cover shows all five with their measured facts: the board gate (watchlist covered, ranks 1..n, strictly falling implied values, farm steps valid), the range calibration (both held-out halves within 70–90%, mean within 78–84%), the per-term held-out table (complete on both halves, full model within 0.05 of TVL-only), the snapshot's integrity, and the output caps.

## Farm calls: Farm now / Wait / Don't farm

From the implied value each farm dollar buys (the board's own tertiles) and the token odds of the row's bucket. Farm now means the top third by value for money with token odds of at least 10%. Don't farm means the bottom third, or token odds below 3%. Wait is everything else. Each protocol's plan gives seven concrete steps with what they cost and how long they take.

## Watchlist and early radar

The snapshot's watchlist is the **floor, never the ceiling**: 40 protocols at or above $50M TVL that record no token and are not a wrapped, staked or bridged product of one that already trades. The radar covers every watchlist slug and adds a further 157 pre-token protocols below the floor (ranked by TVL), because the next big launch is more likely hiding under the floor than already famous.

Protocols whose token already trades are set aside into a separate "Live token" tab and shown at their **market cap** — a fact, not a model. They are never mixed into the pre-token ranking.

## A note on the data

DefiLlama's record is not proof. This dashboard says a protocol *records* no token — never that it *has* none. A protocol on the list may still have a token its record does not carry. Implied value is an estimate, not a price, and never a promise of a launch.

## Run it

```
# Build the board and dossier from the sealed snapshot
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json

# Serve the dashboard locally for a look
python3 -m http.server 8080 -d out/dashboard
```

`main.ts` reads `snapshot.json` (or `/input/snapshot.json` in the grader), writes `board.json`, `data.js`, copies `dashboard/` and `screenshots/` to the output dir, and emits `dossier.json` via the vendored make.fun library.

## Layout

- `main.ts` — entrypoint: parse snapshot, score, write outputs, build dossier
- `lib/model.ts` — the value model, ranges, term tests, checks, board builder, farm-plan derivation, gate checks
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`), no framework, no network
- `screenshots/` — the board, a detail view and a filtered view
- `vendor/makefun-board.ts` — make.fun's board library, copied verbatim from the kit
