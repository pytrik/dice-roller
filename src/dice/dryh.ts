import { Budget, MAX_POOL } from './limits.ts';
import { rollPool } from './roller.ts';
import { DiceError, defaultRng, type Rng } from './types.ts';

/* ----------------------------------------------------------------------- *
 * Don't Rest Your Head.
 *
 * Four pools of d6. Every die showing 1-3 is a success. The player's three
 * pools are counted together and compared against Pain; the dominant pool
 * colours how the outcome is narrated.
 *
 * Rules confirmed with the user; the two tie-breaks are our choice and are
 * documented in NOTATION.md so they can be corrected after seeing them run.
 * ----------------------------------------------------------------------- */

export const POOL_NAMES = ['discipline', 'exhaustion', 'madness', 'pain'] as const;

export type PoolName = (typeof POOL_NAMES)[number];

const LABELS: Record<PoolName, string> = {
  discipline: 'Discipline',
  exhaustion: 'Exhaustion',
  madness: 'Madness',
  pain: 'Pain',
};

/** The highest die that still counts as a success. */
const SUCCESS_MAX = 3;

/** A tie on the highest successful die goes to the more dangerous pool. */
const DOMINANCE_ORDER: readonly PoolName[] = ['pain', 'madness', 'exhaustion', 'discipline'];

export interface PoolRoll {
  name: PoolName;
  label: string;
  faces: number[];
  successes: number;
  /** Highest die that was a success, or null if the pool had none. */
  best: number | null;
}

export interface DryhRequest {
  discipline: number;
  exhaustion: number;
  madness: number;
  pain: number;
  comment: string | null;
}

export interface DryhResult {
  pools: PoolRoll[];
  playerSuccesses: number;
  painSuccesses: number;
  /** Pain wins ties, so the player must exceed it rather than match it. */
  success: boolean;
  dominant: PoolName | null;
  comment: string | null;
}

export function rollDryh(request: DryhRequest, rng: Rng = defaultRng): DryhResult {
  const budget = new Budget();

  const pools = POOL_NAMES.map((name) => {
    const count = validate(name, request[name]);
    const faces = rollPool(count, rng, budget);
    return {
      name,
      label: LABELS[name],
      faces,
      successes: faces.filter(isSuccess).length,
      best: highestSuccess(faces),
    };
  });

  const painSuccesses = pools.find((pool) => pool.name === 'pain')!.successes;
  const playerSuccesses = pools
    .filter((pool) => pool.name !== 'pain')
    .reduce((sum, pool) => sum + pool.successes, 0);

  return {
    pools,
    playerSuccesses,
    painSuccesses,
    success: playerSuccesses > painSuccesses,
    dominant: findDominant(pools),
    comment: request.comment,
  };
}

/** Exported so the formatter marks exactly the dice this counted. */
export function isSuccess(face: number): boolean {
  return face <= SUCCESS_MAX;
}

function highestSuccess(faces: number[]): number | null {
  const successes = faces.filter(isSuccess);
  return successes.length === 0 ? null : Math.max(...successes);
}

/** The pool holding the highest successful die. Null when nothing succeeded. */
function findDominant(pools: PoolRoll[]): PoolName | null {
  const contenders = pools.filter((pool) => pool.best !== null);
  if (contenders.length === 0) return null;

  return contenders.reduce((leader, pool) => {
    if (pool.best! > leader.best!) return pool;
    if (pool.best! < leader.best!) return leader;
    return rank(pool.name) < rank(leader.name) ? pool : leader;
  }).name;
}

function rank(name: PoolName): number {
  return DOMINANCE_ORDER.indexOf(name);
}

function validate(name: PoolName, count: number): number {
  if (!Number.isInteger(count) || count < 0 || count > MAX_POOL) {
    throw new DiceError(`${LABELS[name]} must be a whole number between 0 and ${MAX_POOL}.`);
  }
  return count;
}
