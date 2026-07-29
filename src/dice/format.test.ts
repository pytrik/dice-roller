import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatProgram, formatRoll } from './format.ts';
import { parse, parseProgram } from './parser.ts';
import { rollNode, rollProgram } from './roller.ts';
import type { Rng } from './types.ts';

const face = (value: number, sides: number): number => (value - 0.5) / sides;
const index = (i: number, length: number): number => (i + 0.5) / length;
const fudge = (value: number): number => (value + 1.5) / 3;

function seq(...values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length]!;
}

function render(notation: string, rng: Rng): string {
  return formatRoll(rollNode(parse(notation), notation, rng));
}

describe('formatRoll', () => {
  it('shows the term, the faces and the total', () => {
    const rng = seq(face(4, 6), face(6, 6));
    assert.equal(render('2d6+3', rng), '`2d6+3` → 2d6 [4, 6] = **13**');
  });

  it('strikes through dropped dice', () => {
    const rng = seq(face(5, 6), face(4, 6), face(3, 6), face(1, 6));
    assert.equal(render('4d6kh3', rng), '`4d6kh3` → 4d6 [5, 4, 3, ~~1~~] = **12**');
  });

  it('marks dice that exploded', () => {
    const rng = seq(face(6, 6), face(3, 6));
    // The label echoes the term as typed — `d6`, not a normalised `1d6`.
    assert.equal(render('d6!', rng), '`d6!` → d6 [6!, 3] = **9**');
  });

  it('signs Fudge results and shows their faces as symbols', () => {
    const rng = seq(fudge(1), fudge(-1), fudge(0), fudge(1));
    assert.equal(render('4dF', rng), '`4dF` → 4dF [+, -, 0, +] = **+1**');
  });

  it('leaves a Fudge zero unsigned', () => {
    const rng = seq(fudge(1), fudge(-1), fudge(0), fudge(0));
    assert.equal(render('4dF', rng), '`4dF` → 4dF [+, -, 0, 0] = **0**');
  });

  it('counts successes rather than summing', () => {
    const rng = seq(face(9, 10), face(7, 10), face(4, 10), face(1, 10), face(2, 10));
    assert.equal(render('5d10>=7f1', rng), '`5d10>=7f1` → 5d10 [9, 7, 4, 1, 2] = **1 success**');
  });

  it('tallies symbol dice', () => {
    const rng = seq(index(0, 3), index(0, 3), index(2, 3), index(1, 3));
    assert.equal(
      render('4d[sword,shield,blank]', rng),
      '`4d[sword,shield,blank]` → 4d[sword,shield,blank] [sword, sword, blank, shield] = **sword ×2, blank ×1, shield ×1**',
    );
  });

  it('shows group results for a repetition', () => {
    const rng = seq(face(1, 5), face(2, 5), face(3, 5), face(4, 5), face(5, 5));
    assert.equal(render('5(d5+2)kh2', rng), '`5(d5+2)kh2` → 5(d5+2) [~~3~~, ~~4~~, ~~5~~, 6, 7] = **13**');
  });

  it('omits the breakdown for pure arithmetic', () => {
    assert.equal(render('10/3', seq(0)), '`10/3` = **3**');
  });
});

describe('formatProgram', () => {
  it('puts each roll on its own line', () => {
    const result = rollProgram(parseProgram('3x 1d20'), seq(face(5, 20)));
    assert.equal(
      formatProgram(result),
      '`1d20` → 1d20 [5] = **5**\n`1d20` → 1d20 [5] = **5**\n`1d20` → 1d20 [5] = **5**',
    );
  });

  it('leads with the comment when there is one', () => {
    const result = rollProgram(parseProgram('1d20 # perception'), seq(face(18, 20)));
    assert.equal(formatProgram(result), '**perception**\n`1d20` → 1d20 [18] = **18**');
  });

  it('drops breakdowns before it drops answers', () => {
    const result = rollProgram(parseProgram('100x 5d100'), seq(face(77, 100)));
    const output = formatProgram(result);
    assert.ok(output.length <= 1900, `output was ${output.length} characters`);
    assert.ok(output.includes('**385**'), 'the totals survive');
    assert.ok(!output.includes('[77'), 'the breakdown is gone');
  });
});
