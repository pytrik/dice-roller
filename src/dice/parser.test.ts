import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse, parseProgram } from './parser.ts';
import { DiceError, type Node } from './types.ts';

/** Narrows to a node kind, failing the test if it is anything else. */
function expectKind<K extends Node['kind']>(node: Node, kind: K): Extract<Node, { kind: K }> {
  assert.equal(node.kind, kind);
  return node as Extract<Node, { kind: K }>;
}

describe('dice terms', () => {
  it('defaults the count to one', () => {
    const dice = expectKind(parse('d20'), 'dice');
    assert.equal(dice.count, 1);
    assert.deepEqual(dice.spec, { kind: 'range', sides: 20 });
  });

  it('reads counts', () => {
    assert.equal(expectKind(parse('4d6'), 'dice').count, 4);
  });

  it('reads the special die specs', () => {
    assert.deepEqual(expectKind(parse('d%'), 'dice').spec, { kind: 'range', sides: 100 });
    assert.deepEqual(expectKind(parse('dF'), 'dice').spec, { kind: 'fudge' });
    assert.deepEqual(expectKind(parse('d0'), 'dice').spec, { kind: 'range', sides: 0 });
    assert.deepEqual(expectKind(parse('d-100'), 'dice').spec, { kind: 'range', sides: -100 });
  });

  it('separates numeric face lists from symbolic ones', () => {
    assert.deepEqual(expectKind(parse('d[1,1,2,3]'), 'dice').spec, {
      kind: 'numericFaces',
      faces: [1, 1, 2, 3],
    });
    assert.deepEqual(expectKind(parse('d[sword,shield]'), 'dice').spec, {
      kind: 'symbolFaces',
      faces: ['sword', 'shield'],
    });
  });

  it('records the source text for the breakdown label', () => {
    assert.equal(expectKind(parse('4d6'), 'dice').source, '4d6');
  });
});

describe('repetition vs multiplication', () => {
  it('treats an integer against a paren as repetition', () => {
    const repeat = expectKind(parse('5(d4+1)'), 'repeat');
    assert.equal(repeat.times, 5);
    assert.equal(repeat.source, '5(d4+1)');
    assert.equal(repeat.body.kind, 'binary');
  });

  it('treats an explicit star as multiplication', () => {
    const binary = expectKind(parse('5*(d4+1)'), 'binary');
    assert.equal(binary.op, '*');
  });

  it('lets modifiers apply to a repetition group', () => {
    const modifier = expectKind(parse('5(d5+2)kh2'), 'modifier');
    assert.deepEqual(modifier.modifier, { kind: 'keep', end: 'high', count: 2 });
    assert.equal(modifier.operand.kind, 'repeat');
  });
});

describe('modifiers', () => {
  it('reads keep and drop, defaulting the count to one', () => {
    assert.deepEqual(expectKind(parse('4d6kh3'), 'modifier').modifier, {
      kind: 'keep',
      end: 'high',
      count: 3,
    });
    assert.deepEqual(expectKind(parse('2d20kh'), 'modifier').modifier, {
      kind: 'keep',
      end: 'high',
      count: 1,
    });
    assert.deepEqual(expectKind(parse('5d6dl2'), 'modifier').modifier, {
      kind: 'drop',
      end: 'low',
      count: 2,
    });
  });

  it('reads the explosion variants', () => {
    assert.deepEqual(expectKind(parse('d6!'), 'modifier').modifier, {
      kind: 'explode',
      style: 'standard',
      trigger: null,
    });
    assert.equal(
      (expectKind(parse('d6!!'), 'modifier').modifier as { style: string }).style,
      'compound',
    );
    assert.equal(
      (expectKind(parse('d6!p'), 'modifier').modifier as { style: string }).style,
      'penetrate',
    );
  });

  it('reads a comparison after ! as an explosion trigger, not a success test', () => {
    assert.deepEqual(expectKind(parse('d6!>4'), 'modifier').modifier, {
      kind: 'explode',
      style: 'standard',
      trigger: { op: '>', value: 4 },
    });
  });

  it('reads rerolls, bare numbers meaning equals', () => {
    assert.deepEqual(expectKind(parse('d6r1'), 'modifier').modifier, {
      kind: 'reroll',
      once: false,
      condition: { op: '=', value: 1 },
    });
    assert.deepEqual(expectKind(parse('d6ro<3'), 'modifier').modifier, {
      kind: 'reroll',
      once: true,
      condition: { op: '<', value: 3 },
    });
  });

  it('reads success pools with an optional botch clause', () => {
    assert.deepEqual(expectKind(parse('5d10>=7'), 'modifier').modifier, {
      kind: 'success',
      condition: { op: '>=', value: 7 },
      failure: null,
    });
    assert.deepEqual(expectKind(parse('5d10>=7f1'), 'modifier').modifier, {
      kind: 'success',
      condition: { op: '>=', value: 7 },
      failure: { op: '=', value: 1 },
    });
  });

  it('stacks left to right', () => {
    const outer = expectKind(parse('4d6r1kh3'), 'modifier');
    assert.equal(outer.modifier.kind, 'keep');
    assert.equal(expectKind(outer.operand, 'modifier').modifier.kind, 'reroll');
  });
});

describe('arithmetic', () => {
  it('gives multiplication and division tighter binding than addition', () => {
    const sum = expectKind(parse('1+2*3'), 'binary');
    assert.equal(sum.op, '+');
    assert.equal(expectKind(sum.right, 'binary').op, '*');
  });

  it('distinguishes the three division operators', () => {
    assert.equal(expectKind(parse('7/2'), 'binary').op, '/');
    assert.equal(expectKind(parse('7//2'), 'binary').op, '//');
    assert.equal(expectKind(parse('7/~2'), 'binary').op, '/~');
  });
});

describe('program', () => {
  it('reads a repeat prefix', () => {
    const { entries } = parseProgram('3x 1d20+5');
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.times, 3);
    assert.equal(entries[0]!.notation, '1d20+5');
  });

  it('splits several expressions', () => {
    const { entries } = parseProgram('1d20+7, 2d6+4');
    assert.deepEqual(
      entries.map((e) => e.notation),
      ['1d20+7', '2d6+4'],
    );
  });

  it('does not split on commas inside a face list', () => {
    const { entries } = parseProgram('d[sword,shield,blank], d6');
    assert.equal(entries.length, 2);
    assert.equal(entries[0]!.notation, 'd[sword,shield,blank]');
  });

  it('peels off a trailing comment', () => {
    const program = parseProgram('1d20+5 # perception check');
    assert.equal(program.comment, 'perception check');
    assert.equal(program.entries[0]!.notation, '1d20+5');
  });
});

describe('errors', () => {
  const bad: Array<[string, RegExp]> = [
    ['', /Nothing to roll/],
    ['two d6', /Expected a number or dice term/],
    ['2d6+', /ends unexpectedly/],
    ['4d6k3', /Unexpected/],
    ['(2d6', /Missing `\)`/],
    ['d[1,2', /Unclosed face list/],
    ['d[]', /empty faces/],
    ['5*3kh2', /Modifiers only apply/],
    ['d2000001', /more than 1000000 sides/],
    ['d6r', /reroll needs a condition/],
    ['0(d6)', /Repeat count must be at least 1/],
  ];

  for (const [input, message] of bad) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      assert.throws(() => parse(input), (error: Error) => {
        assert.ok(error instanceof DiceError, `expected DiceError, got ${error.name}`);
        assert.match(error.message, message);
        return true;
      });
    });
  }

  it('caps the number of expressions', () => {
    const many = Array.from({ length: 21 }, () => 'd6').join(',');
    assert.throws(() => parseProgram(many), /At most 20 expressions/);
  });
});
