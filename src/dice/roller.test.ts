import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse, parseProgram } from './parser.ts';
import { rollNode, rollProgram } from './roller.ts';
import { DiceError, type Rng } from './types.ts';

/** The rng value that makes a die of `sides` land on `face`. */
const face = (value: number, sides: number): number => (value - 0.5) / sides;
/** The rng value that picks entry `index` of a face list of length `length`. */
const index = (i: number, length: number): number => (i + 0.5) / length;
/** The rng value that makes a Fudge die land on -1, 0 or +1. */
const fudge = (value: number): number => (value + 1.5) / 3;

/** Replays the given rng values in order, then repeats them. */
function seq(...values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length]!;
}

/** Rolls an expression with a fixed rng and returns the result. */
function roll(notation: string, rng: Rng) {
  return rollNode(parse(notation), notation, rng);
}

describe('die ranges', () => {
  it('rolls 1..sides', () => {
    assert.equal(roll('d6', seq(0)).total, 1);
    assert.equal(roll('d6', seq(0.999)).total, 6);
  });

  it('mirrors negative dice', () => {
    assert.equal(roll('d-6', seq(0)).total, -1);
    assert.equal(roll('d-100', seq(0.999)).total, -100);
  });

  it('always rolls zero on d0', () => {
    assert.equal(roll('4d0', seq(0, 0.5, 0.999, 0.2)).total, 0);
  });

  it('treats d% as d100', () => {
    assert.equal(roll('d%', seq(face(73, 100))).total, 73);
  });

  it('rolls Fudge dice as -1, 0, +1', () => {
    const result = roll('4dF', seq(fudge(1), fudge(-1), fudge(0), fudge(1)));
    assert.equal(result.total, 1);
    assert.deepEqual(
      result.groups[0]!.entries.map((e) => e.value),
      [1, -1, 0, 1],
    );
  });

  it('rolls weighted numeric face lists', () => {
    assert.equal(roll('d[1,1,2,3]', seq(index(3, 4))).total, 3);
  });
});

describe('arithmetic', () => {
  it('applies modifiers to a roll', () => {
    assert.equal(roll('2d6+3', seq(face(4, 6), face(6, 6))).total, 13);
  });

  it('rounds division three ways', () => {
    assert.equal(roll('10/3', seq(0)).total, 3);
    assert.equal(roll('10//3', seq(0)).total, 4);
    assert.equal(roll('10/~3', seq(0)).total, 3);
    assert.equal(roll('7/~2', seq(0)).total, 4); // halves round up
  });

  it('rejects division by zero', () => {
    assert.throws(() => roll('4/0', seq(0)), DiceError);
  });
});

describe('repetition', () => {
  it('rolls the body once per repetition and sums', () => {
    // d4 faces 1,2,3,4,1 -> group results 2,3,4,5,2
    const rng = seq(face(1, 4), face(2, 4), face(3, 4), face(4, 4), face(1, 4));
    assert.equal(roll('5(d4+1)', rng).total, 16);
  });

  it('is not the same as multiplication', () => {
    const rng = seq(face(3, 4));
    assert.equal(roll('5*(d4+1)', rng).total, 20); // one roll of 3, +1, x5
  });

  it('keeps the best group results, not the best faces', () => {
    // d5 faces 1,2,3,4,5 -> group results 3,4,5,6,7 -> keep highest 2 -> 13
    const rng = seq(face(1, 5), face(2, 5), face(3, 5), face(4, 5), face(5, 5));
    assert.equal(roll('5(d5+2)kh2', rng).total, 13);
  });

  it('shows group results rather than every inner die', () => {
    const rng = seq(face(1, 4), face(2, 4), face(3, 4), face(4, 4), face(1, 4));
    const result = roll('5(d4+1)', rng);
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0]!.notation, '5(d4+1)');
    assert.deepEqual(
      result.groups[0]!.entries.map((e) => e.value),
      [2, 3, 4, 5, 2],
    );
  });
});

describe('keep and drop', () => {
  /** A fresh generator per test — one `seq` shared across tests would carry
   *  its cursor over and make the tests order-dependent. */
  const stats = () => seq(face(5, 6), face(4, 6), face(3, 6), face(1, 6));

  it('keeps the highest', () => {
    assert.equal(roll('4d6kh3', stats()).total, 12);
  });

  it('drops the lowest', () => {
    assert.equal(roll('4d6dl1', stats()).total, 12);
  });

  it('defaults to one, giving advantage and disadvantage', () => {
    const rng = seq(face(18, 20), face(4, 20));
    assert.equal(roll('2d20kh', rng).total, 18);
    assert.equal(roll('2d20kl', seq(face(18, 20), face(4, 20))).total, 4);
  });

  it('marks dropped dice rather than removing them', () => {
    const result = roll('4d6kh3', stats());
    assert.deepEqual(
      result.groups[0]!.entries.map((e) => e.kept),
      [true, true, true, false],
    );
  });
});

describe('exploding', () => {
  it('appends a new die on the trigger', () => {
    const result = roll('d6!', seq(face(6, 6), face(3, 6)));
    assert.equal(result.total, 9);
    assert.deepEqual(
      result.groups[0]!.entries.map((e) => e.value),
      [6, 3],
    );
  });

  it('compounds into the triggering die', () => {
    const result = roll('d6!!', seq(face(6, 6), face(3, 6)));
    assert.equal(result.total, 9);
    assert.equal(result.groups[0]!.entries.length, 1);
  });

  it('penetrates with a -1 on each extra die', () => {
    const result = roll('d6!p', seq(face(6, 6), face(3, 6)));
    assert.equal(result.total, 8);
  });

  it('honours a custom trigger', () => {
    const result = roll('d6!>4', seq(face(5, 6), face(2, 6)));
    assert.equal(result.total, 7);
  });

  it('errors instead of looping forever', () => {
    assert.throws(() => roll('d1!', seq(0)), /exceeded 1000 dice/);
  });

  it('refuses to explode a repetition group', () => {
    assert.throws(() => roll('3(d6)!', seq(0)), /only applies to dice/);
  });
});

describe('rerolls', () => {
  it('rerolls while the condition holds', () => {
    const result = roll('d6r1', seq(face(1, 6), face(1, 6), face(4, 6)));
    assert.equal(result.total, 4);
    assert.deepEqual(
      result.groups[0]!.entries.map((e) => [e.value, e.kept]),
      [
        [1, false],
        [1, false],
        [4, true],
      ],
    );
  });

  it('rerolls once with ro', () => {
    const result = roll('d6ro1', seq(face(1, 6), face(1, 6), face(4, 6)));
    assert.equal(result.total, 1);
  });

  it('accepts a comparison condition', () => {
    assert.equal(roll('d6ro<3', seq(face(2, 6), face(6, 6))).total, 6);
  });
});

describe('success pools', () => {
  const pool = () => seq(face(9, 10), face(7, 10), face(4, 10), face(1, 10), face(2, 10));

  it('counts dice at or above the target', () => {
    const result = roll('5d10>=7', pool());
    assert.equal(result.total, 2);
    assert.equal(result.kind, 'successes');
  });

  it('subtracts botches', () => {
    assert.equal(roll('5d10>=7f1', pool()).total, 1);
  });

  it('rejects further modifiers after a success test', () => {
    assert.throws(() => roll('5d10>=7kh2', pool()), /cannot follow a success test/);
  });
});

describe('symbol dice', () => {
  it('tallies faces instead of summing', () => {
    const rng = seq(index(0, 3), index(0, 3), index(2, 3), index(1, 3));
    const result = roll('4d[sword,shield,blank]', rng);
    assert.equal(result.kind, 'symbols');
    assert.deepEqual(result.symbols, { sword: 2, blank: 1, shield: 1 });
  });

  it('refuses arithmetic', () => {
    assert.throws(() => roll('d[sword,shield]+1', seq(0)), /cannot be used in arithmetic/);
  });

  it('refuses modifiers', () => {
    assert.throws(() => roll('4d[a,b]kh2', seq(0)), /do not take modifiers/);
  });
});

describe('limits', () => {
  it('caps the dice rolled per request', () => {
    assert.throws(() => roll('1001d6', seq(0)), /exceeded 1000 dice/);
  });

  it('shares the budget across repeats', () => {
    const program = parseProgram('100x 20d6');
    assert.throws(() => rollProgram(program, seq(0)), /exceeded 1000 dice/);
  });
});

describe('program', () => {
  it('rolls a repeated expression once per repetition', () => {
    const result = rollProgram(parseProgram('3x 1d20'), seq(face(5, 20)));
    assert.equal(result.rolls.length, 3);
    assert.deepEqual(
      result.rolls.map((r) => r.total),
      [5, 5, 5],
    );
  });

  it('rolls several expressions independently', () => {
    const result = rollProgram(parseProgram('1d20, 2d6'), seq(face(20, 20), face(6, 6)));
    assert.equal(result.rolls.length, 2);
    assert.equal(result.rolls[0]!.notation, '1d20');
    assert.equal(result.rolls[1]!.notation, '2d6');
  });

  it('carries the comment through', () => {
    const result = rollProgram(parseProgram('1d20 # perception'), seq(0));
    assert.equal(result.comment, 'perception');
  });
});
