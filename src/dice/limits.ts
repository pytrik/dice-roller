import { DiceError } from './types.ts';

/** Guard rails. A Worker has ~10ms of CPU and Discord caps messages at 2000
 *  characters, so an expression is never allowed to run away.
 *  Every breach raises — a roll is never silently truncated to a wrong total. */

export const MAX_DICE_PER_REQUEST = 1000;
export const MAX_SIDES = 1_000_000;
export const MAX_FACES = 100;
export const MAX_EXPRESSIONS = 20;
export const MAX_REPEATS = 100;

/**
 * Counts every die rolled across a whole request, including dice created by
 * explosions and rerolls. That shared budget is what stops `d1!` — which
 * always explodes — from looping forever.
 */
export class Budget {
  private rolled = 0;

  spend(count = 1): void {
    this.rolled += count;
    if (this.rolled > MAX_DICE_PER_REQUEST) {
      throw new DiceError(`Roll exceeded ${MAX_DICE_PER_REQUEST} dice.`);
    }
  }

  get spent(): number {
    return this.rolled;
  }
}
