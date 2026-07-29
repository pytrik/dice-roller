import { DiceError } from './types.ts';

/** Guard rails. A Worker has ~10ms of CPU and Discord caps messages at 2000
 *  characters, so an expression is never allowed to run away.
 *  Every breach raises — a roll is never silently truncated to a wrong total. */

export const MAX_DICE_PER_REQUEST = 1000;
export const MAX_SIDES = 1_000_000;
export const MAX_FACES = 100;
export const MAX_EXPRESSIONS = 20;
export const MAX_REPEATS = 100;

/** Don't Rest Your Head pools. The game caps Exhaustion and Madness at 6, and
 *  a Pain pool beyond that is not a roll anyone makes. */
export const MAX_POOL = 6;

/** Far beyond any real roll. Discord enforces this too, via the option's
 *  `max_length`, so an over-long argument never reaches the Worker. */
export const MAX_INPUT_LENGTH = 500;
export const MAX_COMMENT_LENGTH = 200;

/** Face names are free text that gets echoed back, so they are the one place
 *  a character allowlist genuinely earns its keep. */
export const MAX_FACE_LENGTH = 24;
export const FACE_PATTERN = /^[\p{L}\p{N} _'+-]+$/u;

/** Parenthesis and repetition nesting. The parser and the evaluator both
 *  recurse per level, so unbounded nesting overflows the stack — and a
 *  RangeError is not a DiceError, so it would escape as "something went
 *  wrong" rather than as a usable message. */
export const MAX_DEPTH = 16;

/** Evaluation steps per request. The dice budget cannot catch
 *  `100(100(100(100(1))))` — it rolls no dice at all, yet costs ~10^8 node
 *  evaluations. This is the limit that does. */
export const MAX_STEPS = 100_000;

/**
 * Counts every die rolled across a whole request, including dice created by
 * explosions and rerolls. That shared budget is what stops `d1!` — which
 * always explodes — from looping forever.
 */
export class Budget {
  private rolled = 0;
  private steps = 0;

  spend(count = 1): void {
    this.rolled += count;
    if (this.rolled > MAX_DICE_PER_REQUEST) {
      throw new DiceError(`Roll exceeded ${MAX_DICE_PER_REQUEST} dice.`);
    }
  }

  /** Counts evaluation work, which is not the same as dice rolled — a nest of
   *  repetitions can cost millions of steps without rolling a single die. */
  step(): void {
    if (++this.steps > MAX_STEPS) {
      throw new DiceError('Roll is too complex — reduce the nesting or the repeat counts.');
    }
  }

  get spent(): number {
    return this.rolled;
  }
}
