// gta6-trophy-rarity-forecast-01 — original entry (Node 22, standard library only).
//
// Idea, in one paragraph: an Exophase earn rate is a ratio, earned / tracked.
// Both halves move. New players flood in (tracked grows, which mechanically
// pushes every rate DOWN), while the players already there keep playing and
// earning (earned grows, which pushes rates UP). A forecast that only
// extrapolates the rate itself confuses the two. So this program forecasts
// the two halves separately — earned counts per trophy and players tracked —
// each as a power law in time since release, fitted on the distinct
// snapshots the house recorder actually saw, then divides. Slopes are
// recency-weighted (the growth regime at the end of the history is what the
// target inherits, not the launch rush) and shrunk toward their tier's
// median, because one trophy's handful of snapshots is noisy; fitted slopes
// are damped ~0.8x before extrapolating, since a saturating count's forward
// slope runs below its slope at the anchor. When the history is flat (one
// snapshot only) the slopes fall back to priors measured on launch night
// (tracked ~ linear in time, earned ~ (1+t)^0.12). The spread is the honest
// part: a random-walk term that grows with the horizon, a fixed jump term
// for the next Exophase refresh (launch night's one refresh moved almost
// every trophy by about -1.6 logit, nearly all of it dilution), and a
// parameter term from the fits' residuals. Quantiles are the median shifted
// on the logit scale.
//
// Everything is deterministic: no randomness, no network, no dependencies.
// It reads every *.in in the input directory (name order) and writes one
// <id>.out per case: {"trophies":[{"id":n,"q":[q05,q25,q50,q75,q95]}]}.
//
// Usage (local): mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Scored quantile levels, in row order. */
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
/** Standard-normal quantiles at those levels. */
const Z = [-1.645, -0.674, 0, 0.674, 1.645];

/** Prior slope of log(players tracked) against log(1 + hours since release). */
const PRIOR_P_SLOPE = 1.0;
/** Prior slope of log(earned) against log(1 + hours since release). */
const PRIOR_E_SLOPE = 0.12;
/** Random-walk spread, logit units per sqrt(day). */
const RW_SIGMA = 0.45;
/** One-refresh jump uncertainty, logit units (launch night's refresh moved
 *  almost every trophy ~-1.6 logit; the median below already prices the
 *  expected jump, this is the residual timing/size uncertainty). */
const JUMP_SIGMA = 0.55;
/** Parameter uncertainty when the history cannot identify a fit at all. */
const PRIOR_PARAM_SIGMA = 0.35;

const clampPct = (x: number): number => Math.min(99.99, Math.max(0.01, x));
const logit = (pct: number): number => {
  const p = clampPct(pct) / 100;
  return Math.log(p / (1 - p));
};
const logisticPct = (l: number): number => 100 / (1 + Math.exp(-l));
/** Rounded to 4 decimals, kept inside [0.01, 99.99] so the scorer's clamp is a no-op. */
const round4 = (x: number): number =>
  Math.min(99.99, Math.max(0.01, Math.round(x * 10_000) / 10_000));

interface Trophy {
  id: number;
  name: string;
  description: string;
  tier: string;
  points: number;
  secret: boolean;
}
interface Read {
  slot: string;
  at: string;
  players_tracked: number;
  trophies_earned: number;
  rates: Array<number | null>;
}
interface Case {
  id: string;
  at: string;
  horizon_minutes: number;
  target: string;
  levels: number[];
  game: { name: string; platform: string; release_date: string; source: string };
  trophies: Trophy[];
  history: Read[];
  notes: string;
}

interface Snapshot {
  /** Hours since release at this read. */
  t: number;
  /** log(1 + t), the regressor. */
  x: number;
  players: number;
  /** Earned counts, reconstructed as rate * players / 100 (null where unknown). */
  earned: Array<number | null>;
}

/** Least-squares slope of y on x; null when x has no variation.
 *  `w` optionally weights points (used to favour recent snapshots: the
 *  growth regime at the end of the history is what the target inherits,
 *  not the launch rush). */
function olsSlope(xs: number[], ys: number[], w?: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const ws = w ?? xs.map(() => 1);
  let sw = 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    sw += ws[i];
    mx += ws[i] * xs[i];
    my += ws[i] * ys[i];
  }
  mx /= sw;
  my /= sw;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += ws[i] * (xs[i] - mx) * (xs[i] - mx);
    sxy += ws[i] * (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx < 1e-12) return null;
  return sxy / sxx;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Parse an ISO date; release_date may be a bare "YYYY-MM-DD". */
function parseMs(s: string | undefined, fallbackMs: number): number {
  if (!s) return fallbackMs;
  const ms = Date.parse(s.length === 10 ? `${s}T00:00:00Z` : s);
  return Number.isFinite(ms) ? ms : fallbackMs;
}

function forecastCase(c: Case): Array<{ id: number; q: number[] }> {
  const trophies = c.trophies;
  const n = trophies.length;

  // --- time base: hours since release (release at 00:00 UTC that day) -------
  const firstReadMs = c.history.length > 0 ? Date.parse(c.history[0].at) : NaN;
  const releaseMs = parseMs(c.game?.release_date, Number.isFinite(firstReadMs) ? firstReadMs : Date.parse(c.at));
  const hoursSince = (iso: string): number => (Date.parse(iso) - releaseMs) / 3_600_000;
  // log-time regressor; t is floored at -0.9h so 1+t stays positive (the
  // first read can predate release by minutes).
  const logTime = (tHours: number): number => Math.log(1 + Math.max(tHours, -0.9));

  const targetT = hoursSince(c.target);
  const targetX = logTime(targetT);
  const horizonDays = Math.max(c.horizon_minutes, 0) / 1440;

  // --- distinct snapshots: Exophase only changes at its own refreshes, so
  // consecutive identical reads carry no new information and would only
  // overweight stale stretches in the fits. -------------------------------
  const snaps: Snapshot[] = [];
  let prevKey = '';
  for (const r of c.history) {
    if (!r || !Array.isArray(r.rates)) continue;
    const key = `${r.players_tracked}|${r.rates.join(',')}`;
    if (key === prevKey) continue;
    prevKey = key;
    const p = typeof r.players_tracked === 'number' && r.players_tracked > 0 ? r.players_tracked : 0;
    snaps.push({
      t: hoursSince(r.at),
      x: logTime(hoursSince(r.at)),
      players: p,
      earned: r.rates.map((rate) =>
        rate === null || p <= 0 ? null : (rate * p) / 100,
      ),
    });
  }

  // Fallback when the case carries no usable history at all: a flat, wide
  // forecast is still a valid case, which beats an invalid one by miles.
  if (snaps.length === 0) {
    return trophies.map((t) => ({
      id: t.id,
      q: [0.05, 0.25, 0.5, 0.75, 0.95].map((_, j) => round4(logisticPct(logit(0.5) + Z[j] * 1.2))),
    }));
  }
  const anchor = snaps[snaps.length - 1];
  const anchorX = anchor.x;

  // --- players-tracked slope ----------------------------------------------
  // Recency-weighted: a snapshot from launch night says little about how
  // fast tracked players are joining at the deadline.
  const recencyW = snaps.map((s) => Math.exp(-(anchorX - s.x) / 0.5));
  let pSlope: number;
  {
    const xs = snaps.map((s) => s.x);
    const ys = snaps.map((s) => Math.log(Math.max(s.players, 1)));
    const fit = olsSlope(xs, ys, recencyW);
    if (fit === null) {
      // Flat history: the prior was measured over exactly this kind of
      // window (launch night), so it goes in undamped.
      pSlope = PRIOR_P_SLOPE;
    } else {
      // Shrink toward the linear-growth prior; more snapshots, less shrinkage.
      const w = snaps.length / (snaps.length + 2);
      pSlope = w * fit + (1 - w) * PRIOR_P_SLOPE;
      // A cumulative count saturates: its log-log slope keeps falling, so
      // the average slope over the extrapolation window sits below the
      // slope at the anchor. Across three simulated launch weeks the
      // forward slope ran at ~0.8x the slope at the anchor.
      pSlope *= 0.8;
    }
    pSlope = Math.min(2.0, Math.max(0.2, pSlope));
  }
  const playersTarget = Math.max(
    anchor.players,
    anchor.players * Math.exp(pSlope * (targetX - anchorX)),
  );

  // --- per-trophy earned slopes, shrunk toward the tier median ------------
  const rawSlopes: Array<number | null> = trophies.map((_, i) => {
    const xs: number[] = [];
    const ys: number[] = [];
    const ws: number[] = [];
    for (const s of snaps) {
      const e = s.earned[i];
      if (e === null) continue;
      // Half-count smoothing: an earned count of 0 has no log.
      xs.push(s.x);
      ys.push(Math.log(Math.max(e, 0.5)));
      ws.push(Math.exp(-(anchorX - s.x) / 0.5));
    }
    return olsSlope(xs, ys, ws);
  });
  // Tier medians from the trophies whose slope is actually identified.
  const tierMedian = new Map<string, number>();
  for (const tier of new Set(trophies.map((t) => t.tier))) {
    const vals = trophies
      .map((t, i) => (t.tier === tier ? rawSlopes[i] : null))
      .filter((v): v is number => v !== null);
    tierMedian.set(tier, vals.length > 0 ? median(vals) : PRIOR_E_SLOPE);
  }
  const eSlopes: number[] = trophies.map((t, i) => {
    const raw = rawSlopes[i];
    if (raw === null) return PRIOR_E_SLOPE;
    const w = snaps.length / (snaps.length + 3);
    // Same saturation argument as for players tracked: the forward slope
    // of a saturating count runs below its slope at the anchor (~0.8x in
    // simulation), so the fitted slope is damped before extrapolating.
    const shrunk = 0.8 * (w * raw + (1 - w) * (tierMedian.get(t.tier) ?? PRIOR_E_SLOPE));
    // Earned counts never fall in reality; cap runaway growth too.
    return Math.min(1.5, Math.max(0, shrunk));
  });

  // --- parameter uncertainty: pooled residual scatter of the earned fits --
  let paramSigma = PRIOR_PARAM_SIGMA;
  {
    const res: number[] = [];
    for (let i = 0; i < n; i++) {
      const pts: Array<[number, number]> = [];
      for (const s of snaps) {
        const e = s.earned[i];
        if (e !== null) pts.push([s.x, Math.log(Math.max(e, 0.5))]);
      }
      if (pts.length >= 3) {
        const b = olsSlope(pts.map((p) => p[0]), pts.map((p) => p[1]));
        if (b === null) continue;
        const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
        const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        const a = my - b * mx;
        for (const [x, y] of pts) res.push(y - (a + b * x));
      }
    }
    if (res.length >= 10) {
      const m = res.reduce((a, v) => a + v, 0) / res.length;
      const sd = Math.sqrt(res.reduce((a, v) => a + (v - m) * (v - m), 0) / res.length);
      paramSigma = Math.min(0.8, Math.max(0.15, sd));
    }
  }

  // --- medians and spreads -------------------------------------------------
  if (process.env.MAKEFUN_DEBUG) {
    console.error(
      `[debug] ${c.id}: snaps=${snaps.length} anchorP=${anchor.players} pSlope=${pSlope.toFixed(3)} ` +
        `playersTarget=${Math.round(playersTarget)} paramSigma=${paramSigma.toFixed(3)} ` +
        `eSlopeMed=${median(eSlopes).toFixed(3)} anchorT=${anchor.t.toFixed(2)}h targetT=${targetT.toFixed(2)}h`,
    );
  }
  const rwSigma = RW_SIGMA * Math.sqrt(horizonDays);
  const rows: Array<{ id: number; q: number[]; med: number; spread: number }> = [];
  for (let i = 0; i < n; i++) {
    const t = trophies[i];
    // Anchor this trophy on its most recent non-null read (a read can lack
    // a trophy even when the anchor read exists).
    let eAnchor: number | null = null;
    let eAnchorX = anchorX;
    let eAnchorP = anchor.players;
    for (let j = snaps.length - 1; j >= 0; j--) {
      const e = snaps[j].earned[i];
      if (e !== null) {
        eAnchor = Math.max(e, 0.5);
        eAnchorX = snaps[j].x;
        eAnchorP = snaps[j].players;
        break;
      }
    }
    const lastRate = eAnchor === null ? null : (100 * eAnchor) / Math.max(eAnchorP, 1);
    let med: number;
    let spread: number;
    if (lastRate !== null && lastRate >= 99.99) {
      // Everybody tracked already has it, across a 6x population jump: it
      // is the first thing a new player does. Keep it at the ceiling with
      // a narrow band; the cost of being wrong here is one trophy in 55.
      med = 99.9;
      spread = 0.15;
    } else {
      const eTarget = eAnchor === null
        ? 0.5
        : eAnchor * Math.exp(eSlopes[i] * (targetX - eAnchorX));
      med = clampPct((100 * eTarget) / playersTarget);
      // Small-count trophies have noisier fits; the platinum needs every
      // other trophy, so its own slope is nearly unidentified — widen both.
      let extra = 0;
      if (eAnchor !== null && eAnchor <= 5) extra += 0.2;
      if (t.tier === 'platinum') extra += 0.3;
      spread = Math.sqrt(rwSigma * rwSigma + JUMP_SIGMA * JUMP_SIGMA + paramSigma * paramSigma + extra * extra);
    }
    const l = logit(med);
    const q = Z.map((z) => round4(logisticPct(l + z * spread)));
    // Rounding can, in principle, break monotonicity at the extremes; enforce it.
    for (let j = 1; j < q.length; j++) if (q[j] < q[j - 1]) q[j] = q[j - 1];
    rows.push({ id: t.id, q, med, spread });
  }

  // The platinum's earners are a subset of every other trophy's earners, so
  // its rate cannot exceed the smallest other rate. Enforce it on the median
  // (the quantiles follow from the median, so they stay ordered).
  const platIdx = trophies.findIndex((t) => t.tier === 'platinum');
  if (platIdx >= 0) {
    let cap = Infinity;
    for (let i = 0; i < n; i++) if (i !== platIdx) cap = Math.min(cap, rows[i].med);
    if (Number.isFinite(cap) && rows[platIdx].med > 0.9 * cap) {
      const l = logit(0.9 * cap);
      const s = rows[platIdx].spread;
      const q = Z.map((z) => round4(logisticPct(l + z * s)));
      for (let j = 1; j < q.length; j++) if (q[j] < q[j - 1]) q[j] = q[j - 1];
      rows[platIdx].q = q;
      rows[platIdx].med = 0.9 * cap;
    }
  }

  return rows
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((r) => ({ id: r.id, q: r.q }));
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (!Array.isArray(c.levels) || c.levels.length !== LEVELS.length) {
    // Never crash a case over its levels: the spec fixes these five, so a
    // deviation is a data quirk, not a reason to forfeit the case.
    console.error(`${file} asks for ${JSON.stringify(c.levels)}, not ${JSON.stringify(LEVELS)}; forecasting the standard five`);
  }
  const trophies = forecastCase(c);
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ trophies })}\n`);
}
