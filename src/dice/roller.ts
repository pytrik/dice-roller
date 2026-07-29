import { Budget } from './limits.ts';
import {
  DiceError,
  compare,
  defaultRng,
  type BinaryOp,
  type DieGroup,
  type DieSpec,
  type Entry,
  type Modifier,
  type Node,
  type Program,
  type ProgramResult,
  type ResultKind,
  type Rng,
  type RollResult,
} from './types.ts';

/* ----------------------------------------------------------------------- *
 * A dice term and a repetition group both produce a LIST of values, and every
 * modifier consumes a list. That is the whole trick: `4d6kh3` keeping the best
 * three faces and `5(d5+2)kh2` keeping the best two group results run through
 * exactly the same code.
 * ----------------------------------------------------------------------- */

interface Context {
  rng: Rng;
  budget: Budget;
  /** Off while evaluating a repetition body, so inner dice do not each
   *  produce their own line in the breakdown. */
  capture: boolean;
  groups: DieGroup[];
}

/** A rolled list, before it collapses to a single value. */
interface ListValue {
  entries: Entry[];
  /** The die behind these values, or null for a repetition group. Explosions
   *  and rerolls need it, because they have to roll more of the same die. */
  die: DieSpec | null;
  /** Face names parallel to `entries`, for symbolic dice. */
  symbols: string[] | null;
  /** Set once a success test has run; the list then counts instead of sums. */
  successes: number | null;
  notation: string;
  display: DieGroup['display'];
}

interface Value {
  total: number;
  kind: ResultKind;
  symbols?: Record<string, number>;
}

/** Rolls every expression in a parsed command. The dice budget is shared
 *  across the whole request, repeats included. */
export function rollProgram(program: Program, rng: Rng = defaultRng): ProgramResult {
  const budget = new Budget();
  const rolls: RollResult[] = [];

  for (const entry of program.entries) {
    for (let i = 0; i < entry.times; i++) {
      rolls.push(rollNode(entry.node, entry.notation, rng, budget));
    }
  }

  return { rolls, comment: program.comment };
}

/** Rolls one expression. Exported for tests and the local CLI. */
export function rollNode(
  node: Node,
  notation: string,
  rng: Rng = defaultRng,
  budget: Budget = new Budget(),
): RollResult {
  const context: Context = { rng, budget, capture: true, groups: [] };
  const value = evalValue(node, context);
  return {
    notation,
    total: value.total,
    kind: value.kind,
    ...(value.symbols ? { symbols: value.symbols } : {}),
    groups: context.groups,
  };
}

/* ------------------------------------------------------------ evaluation -- */

function evalValue(node: Node, context: Context): Value {
  switch (node.kind) {
    case 'number':
      return { total: node.value, kind: 'number' };

    case 'negate':
      return { total: -evalNumber(node.operand, context), kind: 'number' };

    case 'binary':
      return {
        total: applyBinary(node.op, evalNumber(node.left, context), evalNumber(node.right, context)),
        kind: 'number',
      };

    case 'dice':
    case 'repeat':
    case 'modifier':
      return collapse(evalList(node, context), context);
  }
}

/** Evaluates to a plain number, rejecting symbolic dice. */
function evalNumber(node: Node, context: Context): number {
  const value = evalValue(node, context);
  if (value.kind === 'symbols') {
    throw new DiceError('Symbol dice cannot be used in arithmetic.');
  }
  return value.total;
}

/** Turns a rolled list into a single value, and records it in the breakdown. */
function collapse(list: ListValue, context: Context): Value {
  if (context.capture) {
    context.groups.push({
      notation: list.notation,
      entries: list.entries,
      display: list.display,
      ...(list.symbols ? { symbols: list.symbols } : {}),
    });
  }

  if (list.symbols) {
    const counts: Record<string, number> = {};
    list.symbols.forEach((symbol, i) => {
      if (list.entries[i]!.kept) counts[symbol] = (counts[symbol] ?? 0) + 1;
    });
    return { total: 0, kind: 'symbols', symbols: counts };
  }

  if (list.successes !== null) return { total: list.successes, kind: 'successes' };

  const total = list.entries.reduce((sum, entry) => (entry.kept ? sum + entry.value : sum), 0);
  return { total, kind: 'number' };
}

function applyBinary(op: BinaryOp, left: number, right: number): number {
  switch (op) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return Math.floor(divide(left, right));
    case '//':
      return Math.ceil(divide(left, right));
    case '/~':
      return Math.round(divide(left, right));
    default:
      throw new DiceError(`Unknown operator \`${op}\`.`);
  }
}

function divide(left: number, right: number): number {
  if (right === 0) throw new DiceError('Division by zero.');
  return left / right;
}

/* ------------------------------------------------------------------ lists -- */

function evalList(node: Node, context: Context): ListValue {
  switch (node.kind) {
    case 'dice':
      return rollDiceTerm(node.count, node.spec, node.source, context);

    case 'repeat': {
      // Inner dice are not listed individually — only the group results are.
      const outer = context.capture;
      context.capture = false;
      const entries: Entry[] = [];
      try {
        for (let i = 0; i < node.times; i++) {
          entries.push({ value: evalNumber(node.body, context), kept: true });
        }
      } finally {
        context.capture = outer;
      }
      return {
        entries,
        die: null,
        symbols: null,
        successes: null,
        notation: node.source,
        display: 'number',
      };
    }

    case 'modifier':
      return applyModifier(evalList(node.operand, context), node.modifier, context);

    default:
      throw new DiceError('Modifiers only apply to dice or to a repeated group.');
  }
}

function rollDiceTerm(count: number, spec: DieSpec, source: string, context: Context): ListValue {
  if (count < 0) throw new DiceError('Dice count cannot be negative.');
  context.budget.spend(count);

  const entries: Entry[] = [];
  const symbols: string[] = [];

  for (let i = 0; i < count; i++) {
    const roll = rollDie(spec, context);
    entries.push({ value: roll.value, kept: true });
    if (roll.symbol !== undefined) symbols.push(roll.symbol);
  }

  return {
    entries,
    die: spec,
    symbols: spec.kind === 'symbolFaces' ? symbols : null,
    successes: null,
    notation: source,
    display: spec.kind === 'fudge' ? 'fudge' : spec.kind === 'symbolFaces' ? 'symbol' : 'number',
  };
}

/** One die. Budget is spent by the caller for the initial batch, and here for
 *  every extra die an explosion or reroll creates. */
function rollDie(spec: DieSpec, context: Context): { value: number; symbol?: string } {
  switch (spec.kind) {
    case 'range': {
      if (spec.sides === 0) return { value: 0 };
      const magnitude = Math.abs(spec.sides);
      const roll = Math.floor(context.rng() * magnitude) + 1;
      return { value: spec.sides > 0 ? roll : -roll };
    }
    case 'fudge':
      return { value: Math.floor(context.rng() * 3) - 1 };
    case 'numericFaces':
      return { value: pick(spec.faces, context) };
    case 'symbolFaces': {
      const symbol = pick(spec.faces, context);
      return { value: 0, symbol };
    }
  }
}

function pick<T>(items: readonly T[], context: Context): T {
  return items[Math.floor(context.rng() * items.length)]!;
}

/* -------------------------------------------------------------- modifiers -- */

function applyModifier(list: ListValue, modifier: Modifier, context: Context): ListValue {
  if (list.successes !== null) {
    throw new DiceError('Modifiers cannot follow a success test.');
  }
  if (list.symbols) {
    throw new DiceError('Symbol dice do not take modifiers.');
  }

  switch (modifier.kind) {
    case 'keep':
    case 'drop':
      return applyKeepDrop(list, modifier);
    case 'explode':
      return applyExplode(list, modifier, context);
    case 'reroll':
      return applyReroll(list, modifier, context);
    case 'success':
      return applySuccess(list, modifier);
  }
}

function applyKeepDrop(
  list: ListValue,
  modifier: Extract<Modifier, { kind: 'keep' | 'drop' }>,
): ListValue {
  const live = list.entries.filter((entry) => entry.kept);
  const ranked = [...live].sort((a, b) =>
    modifier.end === 'high' ? b.value - a.value : a.value - b.value,
  );

  // `kh3` keeps the first 3 of the ranking; `dh3` drops them.
  const chosen = new Set(ranked.slice(0, modifier.count));
  for (const entry of live) {
    entry.kept = modifier.kind === 'keep' ? chosen.has(entry) : !chosen.has(entry);
  }

  return list;
}

function applyExplode(
  list: ListValue,
  modifier: Extract<Modifier, { kind: 'explode' }>,
  context: Context,
): ListValue {
  const die = requireDie(list, 'Exploding');
  const trigger = modifier.trigger ?? { op: '=' as const, value: maxFace(die) };

  const explodes = (value: number) => compare(value, trigger);
  const extras: Entry[] = [];

  for (const entry of list.entries) {
    if (!explodes(entry.value)) continue;
    entry.note = '!';

    if (modifier.style === 'compound') {
      // Extras merge into the die that triggered them.
      let next = rollExtra(die, context);
      while (explodes(next)) {
        entry.value += next;
        next = rollExtra(die, context);
      }
      entry.value += next;
      continue;
    }

    // Standard and penetrating both append new dice, which can explode again.
    let penalty = modifier.style === 'penetrate' ? 1 : 0;
    for (;;) {
      const raw = rollExtra(die, context);
      const extra: Entry = { value: raw - penalty, kept: true };
      extras.push(extra);
      if (!explodes(raw)) break;
      extra.note = '!';
      if (modifier.style === 'penetrate') penalty = 1;
    }
  }

  list.entries.push(...extras);
  return list;
}

function applyReroll(
  list: ListValue,
  modifier: Extract<Modifier, { kind: 'reroll' }>,
  context: Context,
): ListValue {
  const die = requireDie(list, 'Rerolling');
  const rebuilt: Entry[] = [];

  for (const entry of list.entries) {
    if (!entry.kept || !compare(entry.value, modifier.condition)) {
      rebuilt.push(entry);
      continue;
    }

    // The discarded value stays in the breakdown, struck through, immediately
    // before what replaced it.
    let current = entry;
    for (;;) {
      current.kept = false; // struck through in the breakdown
      rebuilt.push(current);

      current = { value: rollExtra(die, context), kept: true };
      if (modifier.once || !compare(current.value, modifier.condition)) break;
    }
    rebuilt.push(current);
  }

  list.entries = rebuilt;
  return list;
}

function applySuccess(
  list: ListValue,
  modifier: Extract<Modifier, { kind: 'success' }>,
): ListValue {
  let successes = 0;
  for (const entry of list.entries) {
    if (!entry.kept) continue;
    if (compare(entry.value, modifier.condition)) successes++;
    else if (modifier.failure && compare(entry.value, modifier.failure)) successes--;
  }

  list.successes = successes;
  return list;
}

function rollExtra(die: DieSpec, context: Context): number {
  context.budget.spend();
  return rollDie(die, context).value;
}

function requireDie(list: ListValue, what: string): DieSpec {
  if (list.die === null) {
    throw new DiceError(`${what} only applies to dice, not to a repeated group.`);
  }
  if (list.die.kind === 'symbolFaces') {
    throw new DiceError(`${what} does not apply to symbol dice.`);
  }
  return list.die;
}

/** The value an unmodified explosion triggers on. */
function maxFace(die: DieSpec): number {
  switch (die.kind) {
    case 'range':
      return die.sides === 0 ? 0 : die.sides > 0 ? die.sides : -1;
    case 'fudge':
      return 1;
    case 'numericFaces':
      return Math.max(...die.faces);
    case 'symbolFaces':
      throw new DiceError('Symbol dice cannot explode.');
  }
}
