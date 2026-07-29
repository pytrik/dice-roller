import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatResult } from './format.ts';
import { parse } from './parser.ts';
import { evaluate } from './roller.ts';
import { DiceError, type Rng } from './types.ts';

/** Deterministic RNG: replays the given [0,1) values in order, then repeats. */
function seq(...values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('parse', () => {
  it('reads a bare die', () => {
    assert.deepEqual(parse('d20'), { kind: 'dice', count: 1, sides: 20 });
  });

  it('reads counts and modifiers', () => {
    assert.deepEqual(parse('2d6+3'), {
      kind: 'binary',
      op: '+',
      left: { kind: 'dice', count: 2, sides: 6 },
      right: { kind: 'number', value: 3 },
    });
  });

  it('rejects nonsense', () => {
    assert.throws(() => parse('two d6'), DiceError);
    assert.throws(() => parse(''), DiceError);
    assert.throws(() => parse('2d6+'), DiceError);
  });

  it('rejects absurd dice counts', () => {
    assert.throws(() => parse('99999d6'), DiceError);
  });
});

describe('evaluate', () => {
  it('rolls in [1, sides]', () => {
    const { total, groups } = evaluate(parse('2d6'), seq(0, 0.999));
    assert.deepEqual(groups[0]!.faces, [1, 6]);
    assert.equal(total, 7);
  });

  it('applies modifiers', () => {
    assert.equal(evaluate(parse('1d6+3'), seq(0.5)).total, 7);
    assert.equal(evaluate(parse('1d6-1'), seq(0.5)).total, 3);
  });
});

describe('formatResult', () => {
  it('shows the breakdown and the total', () => {
    const result = evaluate(parse('2d6+3'), seq(0.5, 0.999));
    assert.equal(formatResult('2d6+3', result), '`2d6+3` → 2d6 [4, 6] = **13**');
  });
});
