/** Shared vocabulary between the parser and the evaluator.
 *
 *  This is the seam: `parse()` turns text into a `Node` tree, `evaluate()`
 *  turns a `Node` tree into a `RollResult`. Grow the `Node` union as the
 *  notation grows (keep/drop, exploding, rerolls, success counting, ...) and
 *  the two halves stay independently testable.
 */

export type Node =
  | { kind: 'number'; value: number }
  | { kind: 'dice'; count: number; sides: number }
  | { kind: 'binary'; op: BinaryOp; left: Node; right: Node }
  | { kind: 'negate'; operand: Node };

export type BinaryOp = '+' | '-' | '*' | '/';

/** One dice term after it was rolled — kept so we can show the breakdown. */
export interface DieGroup {
  /** How it was written, e.g. "2d6". */
  notation: string;
  /** Every face rolled, in order. */
  faces: number[];
  /** Faces that did not contribute to the total (dropped/rerolled). */
  discarded?: number[];
}

export interface RollResult {
  total: number;
  /** Every dice term that was rolled, in source order. */
  groups: DieGroup[];
}

/** Thrown for anything the user could fix by retyping. Message is shown to them. */
export class DiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiceError';
  }
}

/** Returns a float in [0, 1). Injected so tests can use a fixed sequence. */
export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();
