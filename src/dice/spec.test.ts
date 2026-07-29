import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseProgram } from './parser.ts';
import { rollProgram } from './roller.ts';
import type { Rng } from './types.ts';

/**
 * Every example NOTATION.md shows as valid input, rolled.
 *
 * The point is coverage of the spec as a document: if a future edit adds
 * notation to NOTATION.md without implementing it — or drops something the
 * spec still promises — this is what notices.
 */
const fixed: Rng = () => 0.5;

const EXAMPLES = [
  // Quick tour
  '1d20+5',
  '3d12 + 1d10 + 5(d5+2)kh2',
  '4d6kh3',
  '5d10>=7f1',
  '4dF',
  'd[sword,shield,blank]',
  '3x 1d20+5',
  '1d20+5, 2d6+3',
  '1d20+5 # perception',

  // Dice terms table
  'd0',
  'd1',
  'd6',
  'd-6',
  'd-100',
  'd%',
  'd[1,1,2,3]',
  '4d[sword,shield,blank]',

  // Arithmetic
  '10/3',
  '10//3',
  '10/~3',
  '2d6/2',
  '1+2*3',
  '-d6+10',

  // Repetition vs multiplication
  '5(d4+1)',
  '5*(d4+1)',
  '5d4kh2',
  '5(d4)kh2',
  '5(d5+2)kh2',

  // Keep and drop, including the defaulted count
  '2d20kh',
  '2d20kl',
  '4d6kh3',
  '2d20kl1',
  '5d6dl2',
  '5d6dh2',

  // Exploding
  'd6!',
  'd6!!',
  'd6!p',
  'd6!>4',
  'd6!=1',

  // Rerolls
  'd6r1',
  'd6ro<3',
  'd6r<=2',

  // Success pools
  '5d10>=7',
  '5d10>7',
  '5d10<3',
  '5d10<=3',
  '5d10=7',
  '5d10>=7f1',

  // Command-level syntax
  '3x 1d20+5 # initiative',
  '1d20+7, 2d6+4 # attack and damage',

  // Stacking, which the spec promises works left to right
  '4d6r1kh3',
  '4d6!kh3',
] as const;

describe('every example in NOTATION.md', () => {
  for (const example of EXAMPLES) {
    it(`rolls ${example}`, () => {
      const result = rollProgram(parseProgram(example), fixed);
      assert.ok(result.rolls.length > 0, 'produced no result');
      for (const roll of result.rolls) {
        assert.ok(Number.isFinite(roll.total), `non-finite total for ${example}`);
      }
    });
  }
});
