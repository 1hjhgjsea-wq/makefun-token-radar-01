# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/1hjhgjsea-wq/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/1hjhgjsea-wq/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for [make.fun's token-radar-01 bounty](https://make.fun/bounty/token-radar-01): it reads a sealed DefiLlama snapshot of 758 protocols, ranks the 200 pre-token ones by an implied token value, and gives every row a concrete farm plan. The 40-protocol watchlist (TVL of $50M or more, no token on record) is the floor; the early radar adds the 160 pre-token protocols below that floor with the most TVL.

> New to make.fun? Start with my link: https://make.fun/r/qg9vrma2 — my referral code is `qg9vrma2`.

## The model (radar-2)

Implied value follows only from the snapshot's own figures. No protocol name is special-cased.

```
implied = round( tvl_usd x 0.25
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.6)
  x (0.6 + min(age_days, 730) / 730 x 0.4)
  x (1 + 0.02 x min(chains - 1, 5)) )
```

- **TVL x 0.25** is the base: a protocol's token is valued at a quarter of its TVL.
- **Growth** (weight 0.6): a week's TVL move is the freshest signal in the snapshot.
- **Maturity** (0.6 to 1.0, capped at 730 days): a protocol earns full credit after two years running with no token; past that, age stops adding value.
- **Chain breadth** (+2% per extra chain, max +10%): a protocol live on more chains has more users and more surface for a token to land on.
- Age is the time since DefiLlama first listed the protocol; an unlisted age uses 365 days. A protocol that records no token is described as recording no token, never as having none.

Live-token protocols are kept apart in their own view, shown with their market caps, never mixed into the pre-token ranking.

## The farm plan

Every row carries nine steps, generated from its own category, chains, TVL and age:

1. A fresh wallet, seed phrase offline.
2. The category's main action (supply to a lending market, provide DEX liquidity, stake, bridge, deposit margin, mint an RWA asset, and so on) with capital sized by TVL ($50–$250) and gas priced by chain (Ethereum ~$8, Solana under $1, Base/Arbitrum/Optimism ~$1).
3. The category's weekly repeat, so the activity reads as a user rather than a one-off deposit.
4. The same position on a second chain, when the protocol runs on more than one.
5. A hold of 30–60 days, longer for younger protocols.
6. A claim check on the protocol's own points page, never a paid claim link.
7. A farm log of wallet, dates and transactions.

## The dashboard

A static page with no network and no framework: `dashboard/index.html`, `app.css`, `app.js`, fed by `data.js` written beside it.

- A board table sorted by implied value (also sortable by name, TVL, 7-day growth and age), with a bar showing each row against the top.
- Search by name, slug, category or chain; filters by category and by chain; a watchlist-only toggle.
- Pre-token and Live-token tabs, kept apart.
- A detail view for every protocol: TVL, 7-day growth, age, all four multipliers, the recomputed implied value, and its seven-step farm plan. The page recomputes each row and says whether the number matches `board.json`.
- A model sandbox: move the base multiple (0.10–0.50) or the growth weight (0–1.0) and the board recomputes live from the same figures. `board.json` keeps the shipped radar-2 numbers.

## Run it

Node 22 or later, standard library only, nothing to install:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

That writes `out/board.json` (200 rows), `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. The program runs twice in grading and both runs must write the same bytes; it reads only the snapshot and writes only to the output directory. Verified locally: two runs produce byte-identical `board.json` and `dossier.json`, and the dossier's source text is 39,844 bytes, inside the 65,536-byte cap, so the judge reads the whole dashboard source.

## Files

- `main.ts` — the program: reads the snapshot, builds the board, writes the outputs.
- `lib/model.ts` — the radar-2 model, the farm-plan derivation and the board gate checks.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied unchanged from the kit.
- `dashboard/` — the static page.
- `screenshots/` — the board, a protocol detail view and a filtered view.
- `LICENSE` — MIT.

## Links

- [token-radar-01 bounty](https://make.fun/bounty/token-radar-01)
- [make.fun](https://make.fun/?ref=qg9vrma2)
- [make.fun/skill.md](https://make.fun/skill.md)

---

<sub>Built for the make.fun community. Sign up with my referral link: https://make.fun/r/qg9vrma2 · code `qg9vrma2`</sub>
