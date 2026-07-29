import { DiceError, type Node } from './types.ts';

/**
 * PLACEHOLDER PARSER — replace this file with your own.
 *
 * Handles only `NdM`, integers, and `+`/`-` chains, e.g. `2d6+3`, `d20-1`.
 * It exists so the bot works end to end before the real notation is designed.
 * Keep the signature (`string -> Node`, throwing `DiceError` on bad input) and
 * nothing else in the codebase needs to change.
 */
export function parse(input: string): Node {
  const text = input.trim();
  if (text === '') throw new DiceError('Empty roll.');

  const tokens = text.match(/\d*d\d+|\d+|[+-]/gi);
  if (!tokens || tokens.join('') !== text.replace(/\s+/g, '')) {
    throw new DiceError(`Could not understand \`${input}\`.`);
  }

  let node = term(tokens.shift());
  while (tokens.length > 0) {
    const op = tokens.shift();
    if (op !== '+' && op !== '-') throw new DiceError(`Expected + or -, got \`${op}\`.`);
    node = { kind: 'binary', op, left: node, right: term(tokens.shift()) };
  }
  return node;
}

function term(token: string | undefined): Node {
  if (token === undefined) throw new DiceError('Roll ends unexpectedly.');

  const dice = /^(\d*)d(\d+)$/i.exec(token);
  if (dice) {
    const count = dice[1] === '' ? 1 : Number(dice[1]);
    const sides = Number(dice[2]);
    if (count < 1 || count > MAX_DICE) {
      throw new DiceError(`Dice count must be between 1 and ${MAX_DICE}.`);
    }
    if (sides < 1 || sides > MAX_SIDES) {
      throw new DiceError(`Die must have between 1 and ${MAX_SIDES} sides.`);
    }
    return { kind: 'dice', count, sides };
  }

  if (/^\d+$/.test(token)) return { kind: 'number', value: Number(token) };

  throw new DiceError(`Expected a number or dice term, got \`${token}\`.`);
}

/** Guard rails: a Discord message caps at 2000 chars and a Worker at ~10ms CPU. */
export const MAX_DICE = 500;
export const MAX_SIDES = 1_000_000;
