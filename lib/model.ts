// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures, under model radar-2:
//
//   base         = tvl_usd x BASE_MULTIPLE
//   growth       = clamp(change_7d, -60, 120) per cent
//   growthMult   = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity     = 0.6 + min(age_days, 730) / 730 x 0.4   (age_days unknown: 365)
//   chainMult    = 1 + 0.02 x min(max(chains - 1, 0), 5)
//   implied      = max(1, round(base x growthMult x maturity x chainMult))
//
// Why these four terms, and why radar-2 differs from the starter's radar-1:
// - Growth weight 0.6 (was 0.5): a week's TVL move is the freshest signal in the snapshot, so it
//   earns a little more weight than a flat multiple of TVL alone would give it.
// - Maturity caps at 730 days (was 1095): a protocol earns its full maturity credit after two years
//   running with no token. Past that, age stops adding value: a protocol that has run three-plus
//   years without issuing a token is no more likely to launch than one that has run two.
// - Chain breadth (new): a protocol live on more chains has more users, more venues and more
//   surface for a token to land on. Each extra chain adds 2%, capped at five extra chains (+10%),
//   so a single-chain protocol is never punished and a ten-chain one is never crowned on breadth.
//
// A worked example, so the arithmetic can be checked by hand. Take a protocol with $100M of TVL,
// +10% seven-day growth, listed 400 days ago, live on 3 chains:
//   base       = 100,000,000 x 0.25              = 25,000,000
//   growthMult = 1 + (10 / 100) x 0.6            = 1.06
//   maturity   = 0.6 + min(400, 730) / 730 x 0.4 = 0.6 + 0.2192 = 0.8192
//   chainMult  = 1 + 0.02 x min(3 - 1, 5)        = 1.04
//   implied    = round(25,000,000 x 1.06 x 0.8192 x 1.04) = 22,575,552
// The same four numbers are shown in the dashboard's detail view for every row, so a reader can
// re-derive any implied value from the row's own TVL, growth, age and chain count.
//
// What the model deliberately does not do:
// - It never reads a protocol's name, its social following, or any price feed: the snapshot carries
//   none of those, and a model that needed them could not be checked against the sealed input.
// - It never predicts a launch date or a probability of launching. The implied value is the value
//   a token would carry if the protocol's record stayed as it is; whether the team ever issues one
//   is a fact the snapshot cannot speak to.
// - It never mixes live-token protocols into the ranking. Their market caps are the market's own
//   verdict and are shown apart, in the Live token view, so the board stays a ranking of what has
//   not launched yet.
//
// Age bands and the risk note (added in radar-2's second pass):
// A protocol's age shapes its farm plan as well as its score. The model groups protocols into four
// age bands — young (under 1 year), mid (1 to 2 years), mature (over 2 years) and unknown (no
// listed date) — and the farm plan adds an age-band step and an exit step that differ by band: a
// young protocol gets a start-small step and a longer qualifying window, a mature one gets a
// points-check step and an unwind plan. The risk note is a one-sentence read of the same record:
// single-chain and young is concentration risk, a falling seven-day TVL is momentum risk, a very
// large TVL with no token is size risk, and a long-lived protocol with no token is launch-timing
// risk. None of these change the implied value; they change what a farmer should watch.
// The constants are stated in the dashboard and changeable in its model sandbox. No protocol name
// is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max_extra: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.6,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 730,
  unknown_age_days: 365,
  chain_step: 0.02,
  chain_max_extra: 5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  risk_note: string;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  risk_note: string;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The four multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_max_extra);
  const chainMult = 1 + model.chain_step * extraChains;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult));
  return { implied, growthPct, growthMult, maturityMult, chainMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, chainMult, age } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, growthPct, growthMult, maturityMult, chainMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    risk_note: riskNote(s.p, s.age),
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The four age bands the farm plan varies by: young, mid, mature, and unknown when the snapshot
 *  carries no listed date. A band is a property of the protocol's own record, never of its name. */
export type AgeBand = 'young' | 'mid' | 'mature' | 'unknown';

/** The age band of a protocol from its age in days, or unknown when the age is not recorded. */
export function ageBand(age: number | null): AgeBand {
  if (age === null) return 'unknown';
  if (age < 365) return 'young';
  if (age < 730) return 'mid';
  return 'mature';
}

/** A one-sentence risk read of a protocol's own record. The note never changes the implied value:
 *  it tells a farmer what to watch while the position is open. Four risks, in priority order:
 *  concentration (one chain and young), momentum (TVL falling over the last week), size (a very
 *  large TVL with no token yet), and launch timing (long-lived with no token). A protocol with none
 *  of those gets a plain diversification note instead. */
export function riskNote(p: SnapshotProtocol, age: number | null): string {
  const band = ageBand(age);
  const growth = finite(p.change_7d, 0);
  const chains = p.chains.length;
  if (chains <= 1 && band === 'young') {
    return `Concentration risk: ${p.name} runs on one chain and is under a year old, so one chain outage or one exploit would hit the whole position.`;
  }
  if (chains <= 1 && band === 'unknown') {
    return `Concentration risk: ${p.name} runs on one chain and carries no listed date, so size the position small until the record is clearer.`;
  }
  if (growth <= -20) {
    return `Momentum risk: ${p.name}'s TVL fell ${Math.abs(growth).toFixed(1)}% in the last week, so the position may shrink while you farm it.`;
  }
  if (p.tvl_usd >= 1_000_000_000) {
    return `Size risk: ${p.name} already holds over $1B of TVL with no token, so any launch would be crowded and the first snapshot may be the one that counts.`;
  }
  if (band === 'mature') {
    return `Launch-timing risk: ${p.name} has run over two years with no token, so farm as if the launch may come late or not at all.`;
  }
  if (chains >= 5) {
    return `Breadth risk: ${p.name} runs on ${chains} chains, so spread the position and check each chain's points page separately.`;
  }
  return `Diversification risk: ${p.name} is mid-sized and mid-aged, so the main risk is the position itself — keep it a small share of your farm.`;
}

/** The age band's own step: what a farmer does differently because of how long the protocol has
 *  run. Young protocols get a start-small step (the record is short, so the first position is a
 *  probe); mid protocols get a scale step (the record is long enough to add capital); mature
 *  protocols get a points-check step (after two years the points program, if one exists, is the
 *  thing to verify before adding more); unknown-age protocols get a verify step (check the
 *  protocol's own pages before trusting the snapshot's dates). Two variants per band: the step's
 *  action differs by whether the protocol's category is a venue (DEX, perps, bridge, prediction)
 *  or a money market (lending, staking, vaults), because a probe means a trade in one and a
 *  deposit in the other. */
export function ageBandStep(p: SnapshotProtocol, age: number | null, capital: number, chain: string): FarmStep {
  const band = ageBand(age);
  const c = (p.category ?? '').toLowerCase();
  const venue = c.includes('dex') || c.includes('perpetual') || c.includes('derivative') || c.includes('bridge') || c.includes('cross chain') || c.includes('prediction');
  const probe = Math.max(10, Math.round(capital / 5));
  if (band === 'young') {
    return venue
      ? { text: `Start with a $${probe} probe trade on ${p.name} on ${chain} before committing the full position, because the protocol is under a year old.`, cost: `$${probe} of capital and ${gasFor(chain)}`, time: '10 minutes' }
      : { text: `Start with a $${probe} probe deposit on ${p.name} on ${chain} before committing the full position, because the protocol is under a year old.`, cost: `$${probe} of capital and ${gasFor(chain)}`, time: '10 minutes' };
  }
  if (band === 'mid') {
    return venue
      ? { text: `After two weeks of activity, scale the position on ${p.name} on ${chain} to the full $${capital} with a second trade.`, cost: `$${capital - probe} of extra capital and ${gasFor(chain)}`, time: '10 minutes' }
      : { text: `After two weeks of activity, scale the deposit on ${p.name} on ${chain} to the full $${capital}.`, cost: `$${capital - probe} of extra capital and ${gasFor(chain)}`, time: '10 minutes' };
  }
  if (band === 'mature') {
    return venue
      ? { text: `Open ${p.name}'s own points or rewards page on ${chain} and confirm the trade volume you already did counts toward it.`, cost: 'no fee to check', time: '10 minutes' }
      : { text: `Open ${p.name}'s own points or rewards page on ${chain} and confirm the deposit you already made counts toward it.`, cost: 'no fee to check', time: '10 minutes' };
  }
  return venue
    ? { text: `Verify ${p.name}'s launch status on its own site before trading more, because the snapshot carries no listed date for it.`, cost: 'no fee to check', time: '10 minutes' }
    : { text: `Verify ${p.name}'s launch status on its own site before depositing more, because the snapshot carries no listed date for it.`, cost: 'no fee to check', time: '10 minutes' };
}

/** The exit step: how to unwind the position, again by age band. A young protocol's exit is
 *  partial (leave a small position in case the launch snapshot comes late); a mid protocol's exit
 *  is staged over two withdrawals; a mature protocol's exit is a full unwind with a final claim
 *  check (after two years the points, if any, are either there or not); an unknown-age protocol's
 *  exit is a claim-first unwind (claim before withdrawing, because the record gives no date to
 *  plan around). */
export function exitStep(p: SnapshotProtocol, age: number | null, capital: number): FarmStep {
  const band = ageBand(age);
  if (band === 'young') {
    return { text: `When you exit, withdraw only half of the $${capital} and leave the rest in ${p.name} in case the launch snapshot comes after you.`, cost: `half of the $${capital} stays in the position`, time: '10 minutes' };
  }
  if (band === 'mid') {
    return { text: `When you exit, withdraw the $${capital} from ${p.name} in two stages a week apart so a late snapshot still sees activity.`, cost: 'two withdrawals, each under $3 of gas', time: '10 minutes across two weeks' };
  }
  if (band === 'mature') {
    return { text: `When you exit ${p.name}, claim any points or rewards first, then withdraw the full $${capital}, because after two years there is no more waiting to do.`, cost: 'no fee to claim, and never pay to claim', time: '15 minutes' };
  }
  return { text: `When you exit ${p.name}, claim any points or rewards before withdrawing the $${capital}, because the record carries no date to plan the exit around.`, cost: 'no fee to claim, and never pay to claim', time: '15 minutes' };
}

/** A typical gas cost for one transaction on a chain, in dollars. Ethereum is dear, Solana and the
 *  low-fee L2s are cheap; anything else is priced in the middle. Derived from the chain name only. */
function gasFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return 'about $8 of gas';
  if (c.includes('solana')) return 'under $1 of gas';
  if (c.includes('base') || c.includes('arbitrum') || c.includes('optimism') || c.includes('polygon') || c.includes('monad') || c.includes('berachain')) return 'about $1 of gas';
  if (c.includes('bitcoin')) return 'about $5 of gas';
  return 'about $3 of gas';
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('leveraged farm')) return `Open a leveraged farming position of $${capital} on ${name} on ${chain} and keep the health factor above 1.5.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('liquidity manager')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk curator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the shares.`;
  if (c.includes('chain')) return `Bridge $${capital} to ${chain} and use ${name}'s native apps so the activity is on the chain itself.`;
  if (c.includes('privacy')) return `Deposit $${capital} into ${name}'s shielded pool on ${chain} and keep the receipt.`;
  if (c.includes('index')) return `Buy $${capital} of ${name}'s index token on ${chain} and hold it.`;
  if (c.includes('payment') || c.includes('card')) return `Spend $${capital} through ${name} on ${chain} and keep the receipts.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name} on ${chain} and vote on one proposal.`;
  if (c.includes('cedefi') || c.includes('otc')) return `Place a $${capital} order through ${name} on ${chain} and keep the fill receipt.`;
  if (c.includes('btc') || c.includes('bitcoin')) return `Mint $${capital} of the BTC-backed asset through ${name} on ${chain} and hold it.`;
  if (c.includes('farm')) return `Stake $${capital} of LP tokens in ${name}'s farm on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly recurring action: what to repeat so the activity looks like a user, not a
 *  one-off deposit. Derived from the category only, never from a protocol name. */
function weeklyFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Each week, borrow a small amount against the supply on ${name} and repay it the same day.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('liquidity manager')) return `Each week, swap a small amount through ${name} on ${chain} and re-add the proceeds to the pool.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Each week, open and close one small position on ${name} instead of leaving the margin idle.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Each week, bridge a small amount through ${name} in both directions so the route stays active.`;
  if (c.includes('staking') || c.includes('restak')) return `Each week, restake the rewards ${name} pays out instead of withdrawing them.`;
  if (c.includes('prediction')) return `Each week, place one small market position on ${name} on a market you follow.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk curator')) return `Each week, move a small amount between ${name} vaults on ${chain} and keep the receipts.`;
  if (c.includes('stable')) return `Each week, mint and redeem a small amount of the stable asset through ${name}.`;
  if (c.includes('rwa')) return `Each week, check ${name}'s yield accrual on ${chain} and add a small amount to the position.`;
  if (c.includes('chain')) return `Each week, use one native app on ${chain} through ${name} so the chain activity continues.`;
  if (c.includes('governance')) return `Each week, vote on any live proposal on ${name} and keep the vote receipt.`;
  if (c.includes('basis')) return `Each week, check ${name}'s funding rate on ${chain} and top up the vault when it is positive.`;
  return `Each week, make one qualifying action on ${name}, such as a deposit, a swap or a vote.`;
}

/**
 * A protocol's farm plan: nine steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * Step 2 is the category's main action, step 3 is its weekly repeat, and step 4 repeats the position
 * on a second chain when the protocol runs on more than one. Step 5 is the age band's own step:
 * young protocols start small, mid ones scale, mature ones verify their points, and unknown-age
 * ones verify the launch status first. Step 8 is the exit step, staged by the same age band.
 * The risk note is separate from the plan: one sentence on what to watch, in the row itself.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyFor(p, capital, chain);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: weekly,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
  ];
  if (secondChain !== null) {
    steps.push({
      text: `Repeat the same position on ${secondChain} with $${Math.round(capital / 2)} so the activity is not on one chain only.`,
      cost: `$${Math.round(capital / 2)} of capital and ${gasFor(secondChain)}`,
      time: '15 minutes',
    });
  } else {
    steps.push({
      text: `Use the protocol on its only chain, ${chain}, for a second product, such as its swap, vault or rewards page.`,
      cost: gas,
      time: '10 minutes',
    });
  }
  steps.push(ageBandStep(p, age, capital, chain));
  steps.push(
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    exitStep(p, age, capital),
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  );
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    risk_note: row.risk_note,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
  };
}

/** What the radar-2 model deliberately does not do: three limits the reader should know before trusting a rank. */
export function describeModelLimitations(): string[] {
  return [
    'No price prediction: an implied value is what a token would be worth if the protocol launched one at its current size, not a forecast of any future price.',
    'No launch-date prediction: the model says nothing about whether or when a protocol issues a token, only how valuable one would be if it did.',
    'No off-snapshot data: only the sealed snapshot\'s own figures (TVL, seven-day change, listed age, chain count) feed a rank, so anything the snapshot does not record cannot move it.',
  ];
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (typeof r.risk_note !== 'string' || r.risk_note.length < 20) return `${r.slug} has no risk note`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
