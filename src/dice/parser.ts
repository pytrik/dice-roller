import { MAX_EXPRESSIONS, MAX_FACES, MAX_REPEATS, MAX_SIDES } from './limits.ts';
import { Scanner } from './scanner.ts';
import {
  DiceError,
  isListNode,
  type Comparison,
  type DieSpec,
  type Modifier,
  type Node,
  type Program,
  type ProgramEntry,
} from './types.ts';

/* ----------------------------------------------------------------------- *
 * Grammar (see NOTATION.md for semantics)
 *
 *   program  := entry ("," entry)* ("#" comment)?
 *   entry    := (INT "x")? sum
 *   sum      := product (("+" | "-") product)*
 *   product  := unary (("*" | "//" | "/~" | "/") unary)*
 *   unary    := "-" unary | postfix
 *   postfix  := atom modifier*
 *   atom     := INT "(" sum ")"        -- repetition
 *             | "(" sum ")"
 *             | INT? "d" diespec
 *             | INT
 *   diespec  := "%" | "F" | "-"? INT | "[" face ("," face)* "]"
 * ----------------------------------------------------------------------- */

/** Longer alternatives first, so `//` is never read as two `/`. */
const PRODUCT_OPS = ['*', '//', '/~', '/'] as const;
const COMPARISON_OPS = ['>=', '<=', '>', '<', '='] as const;

/** Parses a whole `/roll` argument: repeats, several expressions, a comment. */
export function parseProgram(input: string): Program {
  const { expressions, comment } = splitProgram(input);

  if (expressions.length === 0) throw new DiceError('Nothing to roll.');
  if (expressions.length > MAX_EXPRESSIONS) {
    throw new DiceError(`At most ${MAX_EXPRESSIONS} expressions per roll.`);
  }

  const entries: ProgramEntry[] = expressions.map((text) => {
    const repeat = /^\s*(\d+)\s*x\s*(?=\S)/i.exec(text);
    const times = repeat ? Number(repeat[1]) : 1;
    const body = repeat ? text.slice(repeat[0].length) : text;

    if (times < 1) throw new DiceError('Repeat count must be at least 1.');
    if (times > MAX_REPEATS) throw new DiceError(`Cannot repeat more than ${MAX_REPEATS} times.`);

    return { notation: body.trim(), times, node: parse(body) };
  });

  return { entries, comment };
}

/** Parses a single expression. Exported for tests and for the local CLI. */
export function parse(input: string): Node {
  const scanner = new Scanner(input);
  if (scanner.atEnd()) throw new DiceError('Nothing to roll.');

  const node = parseSum(scanner);
  if (!scanner.atEnd()) {
    throw new DiceError(`Unexpected \`${scanner.rest()}\` in \`${input.trim()}\`.`);
  }
  return node;
}

/* ------------------------------------------------------- program splitting */

/** Splits off the comment and the comma-separated expressions, ignoring any
 *  commas that sit inside `d[...]` face lists or parentheses. */
function splitProgram(input: string): { expressions: string[]; comment: string | null } {
  const expressions: string[] = [];
  let current = '';
  let comment: string | null = null;
  let depth = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;

    if (char === '#' && depth === 0) {
      comment = input.slice(i + 1).trim() || null;
      break;
    }
    if (char === ',' && depth === 0) {
      expressions.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  expressions.push(current);

  return { expressions: expressions.filter((e) => e.trim() !== ''), comment };
}

/* -------------------------------------------------------------- expressions */

function parseSum(scanner: Scanner): Node {
  let node = parseProduct(scanner);
  for (;;) {
    const op = scanner.eatAny(['+', '-']);
    if (op === null) return node;
    node = { kind: 'binary', op, left: node, right: parseProduct(scanner) };
  }
}

function parseProduct(scanner: Scanner): Node {
  let node = parseUnary(scanner);
  for (;;) {
    const op = scanner.eatAny(PRODUCT_OPS);
    if (op === null) return node;
    node = { kind: 'binary', op, left: node, right: parseUnary(scanner) };
  }
}

function parseUnary(scanner: Scanner): Node {
  if (scanner.eat('-')) return { kind: 'negate', operand: parseUnary(scanner) };
  return parsePostfix(scanner);
}

function parsePostfix(scanner: Scanner): Node {
  let node = parseAtom(scanner);
  for (;;) {
    const modifier = parseModifier(scanner);
    if (modifier === null) return node;
    if (!isListNode(node)) {
      throw new DiceError('Modifiers only apply to dice or to a repeated group.');
    }
    node = { kind: 'modifier', modifier, operand: node };
  }
}

function parseAtom(scanner: Scanner): Node {
  scanner.skipSpace();
  const start = scanner.pos;

  const leading = scanner.integer();

  if (leading !== null) {
    // `5(d4+1)` repeats; `5*(d4+1)` multiplies. Juxtaposition is the difference.
    if (scanner.eat('(')) {
      if (leading < 1) throw new DiceError('Repeat count must be at least 1.');
      if (leading > MAX_REPEATS) {
        throw new DiceError(`Cannot repeat more than ${MAX_REPEATS} times.`);
      }
      const body = parseSum(scanner);
      expect(scanner, ')');
      return { kind: 'repeat', times: leading, body, source: scanner.since(start) };
    }
    if (scanner.eat('d')) {
      return { kind: 'dice', count: leading, spec: parseDieSpec(scanner), source: scanner.since(start) };
    }
    return { kind: 'number', value: leading };
  }

  if (scanner.eat('(')) {
    const node = parseSum(scanner);
    expect(scanner, ')');
    return node;
  }

  if (scanner.eat('d')) {
    return { kind: 'dice', count: 1, spec: parseDieSpec(scanner), source: scanner.since(start) };
  }

  const rest = scanner.rest();
  throw new DiceError(
    rest === '' ? 'Expression ends unexpectedly.' : `Expected a number or dice term, got \`${rest}\`.`,
  );
}

/* --------------------------------------------------------------- die specs */

function parseDieSpec(scanner: Scanner): DieSpec {
  if (scanner.eatTight('%')) return { kind: 'range', sides: 100 };
  if (scanner.eatTight('F') || scanner.eatTight('f')) return { kind: 'fudge' };
  if (scanner.eatTight('[')) return parseFaceList(scanner);

  const negative = scanner.eatTight('-');
  const sides = scanner.integer();
  if (sides === null) throw new DiceError('A die needs a number of sides, e.g. `d6`.');
  if (sides > MAX_SIDES) throw new DiceError(`A die cannot have more than ${MAX_SIDES} sides.`);

  return { kind: 'range', sides: negative ? -sides : sides };
}

function parseFaceList(scanner: Scanner): DieSpec {
  const body = scanner.match(/[^\]]*/);
  if (body === null || !scanner.eatTight(']')) {
    throw new DiceError('Unclosed face list — expected `]`.');
  }

  const faces = body.split(',').map((face) => face.trim());
  if (faces.length === 0 || faces.some((face) => face === '')) {
    throw new DiceError('Face lists cannot contain empty faces, e.g. `d[1,2,3]`.');
  }
  if (faces.length > MAX_FACES) {
    throw new DiceError(`A die cannot have more than ${MAX_FACES} faces.`);
  }

  // All-numeric face lists are ordinary dice; anything else is symbolic.
  if (faces.every((face) => /^-?\d+$/.test(face))) {
    return { kind: 'numericFaces', faces: faces.map(Number) };
  }
  return { kind: 'symbolFaces', faces };
}

/* -------------------------------------------------------------- modifiers */

function parseModifier(scanner: Scanner): Modifier | null {
  return (
    parseKeepDrop(scanner) ?? parseExplode(scanner) ?? parseReroll(scanner) ?? parseSuccess(scanner)
  );
}

function parseKeepDrop(scanner: Scanner): Modifier | null {
  const word = scanner.eatAny(['kh', 'kl', 'dh', 'dl']);
  if (word === null) return null;

  const count = scanner.integer() ?? 1; // `2d20kh` is advantage
  if (count < 1) throw new DiceError('Keep/drop count must be at least 1.');

  const end = word[1] === 'h' ? 'high' : 'low';
  return word[0] === 'k' ? { kind: 'keep', end, count } : { kind: 'drop', end, count };
}

function parseExplode(scanner: Scanner): Modifier | null {
  // `!p` before `!`, and `!!` before both, or the shorter form wins the prefix.
  const marker = scanner.eatAny(['!!', '!p', '!']);
  if (marker === null) return null;

  const style = marker === '!!' ? 'compound' : marker === '!p' ? 'penetrate' : 'standard';
  // A comparison here is the explosion trigger, not a success test.
  return { kind: 'explode', style, trigger: parseComparison(scanner) };
}

function parseReroll(scanner: Scanner): Modifier | null {
  const marker = scanner.eatAny(['ro', 'r']); // `ro` first, or `r` swallows it
  if (marker === null) return null;

  const condition = parseCondition(scanner);
  if (condition === null) throw new DiceError('A reroll needs a condition, e.g. `d6r1` or `d6r<3`.');

  return { kind: 'reroll', once: marker === 'ro', condition };
}

function parseSuccess(scanner: Scanner): Modifier | null {
  const condition = parseComparison(scanner);
  if (condition === null) return null;

  let failure: Comparison | null = null;
  if (scanner.eat('f')) {
    failure = parseCondition(scanner);
    if (failure === null) throw new DiceError('A botch clause needs a value, e.g. `5d10>=7f1`.');
  }

  return { kind: 'success', condition, failure };
}

/** `>=7`, `<3`, `=1`. Null when no comparison is present. */
function parseComparison(scanner: Scanner): Comparison | null {
  const op = scanner.eatAny(COMPARISON_OPS);
  if (op === null) return null;

  const value = scanner.integer();
  if (value === null) throw new DiceError(`\`${op}\` needs a number after it.`);
  return { op, value };
}

/** A comparison, or a bare number meaning "equal to". */
function parseCondition(scanner: Scanner): Comparison | null {
  const comparison = parseComparison(scanner);
  if (comparison !== null) return comparison;

  const value = scanner.integer();
  return value === null ? null : { op: '=', value };
}

function expect(scanner: Scanner, literal: string): void {
  if (!scanner.eat(literal)) {
    const rest = scanner.rest();
    throw new DiceError(rest === '' ? `Missing \`${literal}\`.` : `Expected \`${literal}\` before \`${rest}\`.`);
  }
}
