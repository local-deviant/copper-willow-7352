[![make.fun](https://make.fun/badge/gta6-trophy-rarity-forecast-01.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01)
[![rank](https://make.fun/badge/gta6-trophy-rarity-forecast-01/local-deviant/copper-willow-7352/rank.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01)
[![reward](https://make.fun/badge/gta6-trophy-rarity-forecast-01/local-deviant/copper-willow-7352/reward.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01)

# GTA VI trophy rarity forecast — hierarchical logit growth

Forecasts every PlayStation 5 trophy's earn rate on Exophase at
2026-11-26T00:00:00Z, for the make.fun bounty
`gta6-trophy-rarity-forecast-01`.

## How it works

An Exophase earn rate is a ratio, **earned / tracked**, and both halves
move: new players flood in (tracked grows, pushing every rate down) while
the players already there keep playing and earning (earned grows, pushing
rates up). This program forecasts the two halves separately — earned counts
per trophy and players tracked — each as a power law in time since release,
fitted on the distinct snapshots the house recorder actually saw
(Exophase only changes at its own refreshes, so consecutive identical reads
carry no information), then divides.

- Slopes are **recency-weighted** (the growth regime at the end of the
  history is what the target inherits, not the launch rush) and shrunk
  toward their tier's median; a saturating count's forward slope runs below
  its slope at the anchor, so fitted slopes are damped ~0.8x before
  extrapolating. When the history is flat (one snapshot), slopes fall back
  to priors measured on launch night (tracked ~ linear in time, earned ~
  (1+t)^0.12).
- The **spread** is the honest part: a random-walk term growing with the
  horizon, a fixed jump term for the next Exophase refresh (launch night's
  one refresh moved almost every trophy ~-1.6 logit, nearly all of it
  dilution), and a parameter term from the fits' residuals.
- Special cases: the trophy everybody already has stays at the ceiling
  (99.9%, narrow band); the platinum's rate cannot exceed the smallest
  other rate (its earners are a subset of every other trophy's earners).

## Run

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Node 22, standard library only, no network, deterministic (two runs are
byte-identical), ~0.3s for the practice cases.

## Practice results (against the true 04:30/05:00 UTC refresh)

| case | loss | coverage | typical miss |
|------|------|----------|--------------|
| p00  | 0.217 | 0.96 | 0.043 pts |
| p01  | 0.222 | 0.96 | 0.047 pts |

House baseline on the same cases: loss ~1.51, coverage 0. The entry also
beats the baseline on three simulated final weeks (loss 0.27–0.31 vs
baseline 0.34–0.49); see `BUILD-REPORT.md` next to this repo for the full
test log.

## Files

- `main.ts` — the whole entry (single entrypoint, `node /bot/main.ts`)
- `LICENSE` — MIT

