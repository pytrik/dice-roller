import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatProgram } from './format.ts';
import { MAX_DEPTH, MAX_INPUT_LENGTH } from './limits.ts';
import { parse, parseProgram } from './parser.ts';
import { rollProgram } from './roller.ts';
import { escapeMarkdown, normalizeInput, quote } from './sanitize.ts';
import { DiceError, type Rng } from './types.ts';

const fixed: Rng = () => 0.5;

describe('input size', () => {
  it('rejects an over-long expression', () => {
    const long = `1+${'1+'.repeat(MAX_INPUT_LENGTH)}1`;
    assert.throws(() => parseProgram(long), /too long/);
  });

  it('accepts anything of a sane length', () => {
    assert.doesNotThrow(() => parseProgram('3d12 + 1d10 + 5(d5+2)kh2 # a comment'));
  });
});

describe('nesting', () => {
  // The length cap alone keeps input short enough that the stack survives, so
  // these use depths that fit inside it — the guard is what makes the bound a
  // usable message instead of a RangeError.
  it('rejects nesting past the limit instead of overflowing the stack', () => {
    const deep = '('.repeat(50) + '1' + ')'.repeat(50);
    assert.throws(
      () => parse(deep),
      (error: Error) => {
        assert.ok(error instanceof DiceError, `expected DiceError, got ${error.name}`);
        assert.match(error.message, /Too much nesting/);
        return true;
      },
    );
  });

  it('allows nesting up to the limit', () => {
    const ok = '('.repeat(MAX_DEPTH) + '1' + ')'.repeat(MAX_DEPTH);
    assert.equal(rollProgram(parseProgram(ok), fixed).rolls[0]!.total, 1);
  });

  it('counts repetition groups towards the same limit', () => {
    const deep = '2('.repeat(50) + '1' + ')'.repeat(50);
    assert.throws(() => parse(deep), /Too much nesting/);
  });

  it('rejects an over-long expression before it can nest deeply at all', () => {
    const deep = '('.repeat(2000) + '1' + ')'.repeat(2000);
    assert.throws(() => parse(deep), /too long/);
  });
});

describe('evaluation cost', () => {
  it('stops a repetition nest that rolls no dice at all', () => {
    // The dice budget cannot see this one: 10^6 evaluations, zero dice.
    const program = parseProgram('100(100(100(1)))');
    assert.throws(() => rollProgram(program, fixed), /too complex/);
  });

  it('still allows an expensive but reasonable roll', () => {
    const program = parseProgram('20x 20d6');
    assert.doesNotThrow(() => rollProgram(program, fixed));
  });
});

describe('echoed text', () => {
  it('strips invisible characters from input', () => {
    assert.equal(normalizeInput('2​d‮6'), '2d6');
  });

  it('caps and cleans the comment', () => {
    const program = parseProgram(`d6 # ${'x'.repeat(300)}`);
    assert.ok(program.comment!.length <= 201, `comment was ${program.comment!.length}`);
    assert.ok(program.comment!.endsWith('…'));
  });

  it('escapes markdown in the comment rather than rendering it', () => {
    const output = formatProgram(rollProgram(parseProgram('d6 # **not bold**'), fixed));
    assert.ok(output.startsWith('**\\*\\*not bold\\*\\***'), output);
  });

  it('keeps a stray backtick from breaking out of an error quote', () => {
    assert.equal(quote('a`b'), '`ab`');
    assert.equal(escapeMarkdown('a*b'), 'a\\*b');
  });

  it('quotes bad input back without unbalancing the code span', () => {
    // The `**` survives, but it is inert inside a code span. What must not
    // survive is the user's backticks, which would close the span and let the
    // rest of the message be rendered as markdown.
    assert.throws(() => parse('2d6 `**x**`'), (error: Error) => {
      const backticks = (error.message.match(/`/g) ?? []).length;
      assert.equal(backticks % 2, 0, `unbalanced backticks in: ${error.message}`);
      assert.equal(backticks, 4, error.message);
      return true;
    });
  });
});

describe('face names', () => {
  it('allows ordinary words', () => {
    assert.doesNotThrow(() => parse("d[sword,shield,blank,d'Artagnan,+1 sword]"));
  });

  it('rejects markdown and mention characters', () => {
    assert.throws(() => parse('d[@everyone,x]'), /not allowed/);
    assert.throws(() => parse('d[**bold**,x]'), /not allowed/);
    assert.throws(() => parse('d[`code`,x]'), /not allowed/);
  });

  it('rejects over-long face names', () => {
    assert.throws(() => parse(`d[${'x'.repeat(50)},y]`), /longer than/);
  });
});
