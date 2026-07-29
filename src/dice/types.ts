/** Shared vocabulary between the parser, the evaluator and the formatter.
 *  The notation these types describe is specified in NOTATION.md. */

/* ------------------------------------------------------------------ AST -- */

export type ComparisonOp = '>' | '>=' | '<' | '<=' | '=';

export interface Comparison {
  op: ComparisonOp;
  value: number;
}

/** What a single die looks like. */
export type DieSpec =
  /** Contiguous range. Positive sides give 1..n, negative give -n..-1, 0 gives 0. */
  | { kind: 'range'; sides: number }
  /** Fudge/FATE: -1, 0, +1. Displayed as -, 0, +. */
  | { kind: 'fudge' }
  /** `d[1,1,2,3]` — weighted numeric die, behaves like any other die. */
  | { kind: 'numericFaces'; faces: number[] }
  /** `d[sword,shield]` — tallied by symbol, no arithmetic. */
  | { kind: 'symbolFaces'; faces: string[] };

export type Modifier =
  | { kind: 'keep'; end: 'high' | 'low'; count: number }
  | { kind: 'drop'; end: 'high' | 'low'; count: number }
  | { kind: 'explode'; style: 'standard' | 'compound' | 'penetrate'; trigger: Comparison | null }
  | { kind: 'reroll'; once: boolean; condition: Comparison }
  | { kind: 'success'; condition: Comparison; failure: Comparison | null };

export type BinaryOp = '+' | '-' | '*' | '/' | '//' | '/~';

export type Node =
  | { kind: 'number'; value: number }
  | { kind: 'dice'; count: number; spec: DieSpec; source: string }
  /** `5(d4+1)` — evaluates the body N times and produces the N results as a list. */
  | { kind: 'repeat'; times: number; body: Node; source: string }
  | { kind: 'modifier'; modifier: Modifier; operand: Node }
  | { kind: 'binary'; op: BinaryOp; left: Node; right: Node }
  | { kind: 'negate'; operand: Node };

/** Nodes that produce a list of values, and so can carry modifiers. */
export function isListNode(node: Node): boolean {
  return node.kind === 'dice' || node.kind === 'repeat' || node.kind === 'modifier';
}

/* -------------------------------------------------------------- program -- */

/** One expression from the command, plus how many times to roll it. */
export interface ProgramEntry {
  /** The expression exactly as the user typed it, for echoing back. */
  notation: string;
  /** `3x 1d20` -> 3. Defaults to 1. */
  times: number;
  node: Node;
}

export interface Program {
  entries: ProgramEntry[];
  /** Text after `#`, if any. */
  comment: string | null;
}

/* --------------------------------------------------------------- result -- */

/** One rolled value inside a breakdown. */
export interface Entry {
  value: number;
  /** False for values dropped by keep/drop or replaced by a reroll. */
  kept: boolean;
  /** Marker shown after the value, e.g. `!` for a die that exploded. */
  note?: string;
}

export interface DieGroup {
  /** The term as written, without its modifiers, e.g. `4d6` or `5(d5+2)`. */
  notation: string;
  entries: Entry[];
  /** How the entries should be rendered. */
  display: 'number' | 'fudge' | 'symbol';
  /** Face names, parallel to `entries`, for symbolic dice. */
  symbols?: string[];
}

export type ResultKind = 'number' | 'successes' | 'symbols';

export interface RollResult {
  /** The expression as typed. */
  notation: string;
  /** Sum, or success count when `kind` is `successes`. Zero for symbols. */
  total: number;
  kind: ResultKind;
  /** Face name -> count, when `kind` is `symbols`. */
  symbols?: Record<string, number>;
  groups: DieGroup[];
}

export interface ProgramResult {
  rolls: RollResult[];
  comment: string | null;
}

/* ---------------------------------------------------------------- misc --- */

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

export function compare(value: number, comparison: Comparison): boolean {
  switch (comparison.op) {
    case '>':
      return value > comparison.value;
    case '>=':
      return value >= comparison.value;
    case '<':
      return value < comparison.value;
    case '<=':
      return value <= comparison.value;
    case '=':
      return value === comparison.value;
  }
}

export function formatComparison({ op, value }: Comparison): string {
  return `${op}${value}`;
}
