import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rollDryh, type DryhRequest } from './dryh.ts';
import { formatDryh } from './format.ts';
import { DiceError, type Rng } from './types.ts';

const face = (value: number): number => (value - 0.5) / 6;

/** Replays rng values in order. Pools are rolled discipline, exhaustion,
 *  madness, pain — so the faces are listed in that order. */
function faces(...values: number[]): Rng {
  let i = 0;
  return () => face(values[i++]!);
}

function request(overrides: Partial<DryhRequest> = {}): DryhRequest {
  return { discipline: 3, exhaustion: 2, madness: 1, pain: 4, comment: null, ...overrides };
}

describe('successes', () => {
  it('counts dice showing 1 to 3', () => {
    const result = rollDryh(request(), faces(2, 5, 1, 3, 6, 1, 2, 4, 3, 6));

    assert.deepEqual(
      result.pools.map((pool) => [pool.name, pool.successes]),
      [
        ['discipline', 2],
        ['exhaustion', 1],
        ['madness', 1],
        ['pain', 2],
      ],
    );
    assert.equal(result.playerSuccesses, 4);
    assert.equal(result.painSuccesses, 2);
    assert.equal(result.success, true);
  });

  it('adds Discipline, Exhaustion and Madness together against Pain alone', () => {
    const result = rollDryh(request({ discipline: 1, exhaustion: 1, madness: 1, pain: 1 }));
    assert.equal(
      result.playerSuccesses,
      result.pools
        .filter((pool) => pool.name !== 'pain')
        .reduce((sum, pool) => sum + pool.successes, 0),
    );
  });
});

describe('ties', () => {
  it('gives a tie to Pain, so the player must exceed it', () => {
    // Exhaustion [2] -> 1 success, Pain [1] -> 1 success.
    const result = rollDryh(
      request({ discipline: 0, exhaustion: 1, madness: 0, pain: 1 }),
      faces(2, 1),
    );
    assert.equal(result.playerSuccesses, 1);
    assert.equal(result.painSuccesses, 1);
    assert.equal(result.success, false);
  });

  it('succeeds on one more than Pain', () => {
    // Discipline [1], Exhaustion [2] -> 2 successes, Pain [3] -> 1.
    const result = rollDryh(
      request({ discipline: 1, exhaustion: 1, madness: 0, pain: 1 }),
      faces(1, 2, 3),
    );
    assert.equal(result.success, true);
  });
});

describe('dominance', () => {
  it('is the pool holding the highest successful die', () => {
    // Discipline [1], Exhaustion [3], Madness [1], Pain [1]
    const result = rollDryh(
      request({ discipline: 1, exhaustion: 1, madness: 1, pain: 1 }),
      faces(1, 3, 1, 1),
    );
    assert.equal(result.dominant, 'exhaustion');
  });

  it('ignores dice that were not successes', () => {
    // Discipline [6] is the highest die but not a success; Madness [2] wins.
    const result = rollDryh(
      request({ discipline: 1, exhaustion: 0, madness: 1, pain: 0 }),
      faces(6, 2),
    );
    assert.equal(result.dominant, 'madness');
  });

  it('breaks a tie towards the more dangerous pool', () => {
    // Discipline [3] and Madness [3] tie; Madness outranks Discipline.
    const result = rollDryh(
      request({ discipline: 1, exhaustion: 0, madness: 1, pain: 0 }),
      faces(3, 3),
    );
    assert.equal(result.dominant, 'madness');
  });

  it('lets Pain win a tie against everything', () => {
    const result = rollDryh(
      request({ discipline: 1, exhaustion: 1, madness: 1, pain: 1 }),
      faces(3, 3, 3, 3),
    );
    assert.equal(result.dominant, 'pain');
  });

  it('reports no dominant pool when nothing succeeded', () => {
    const result = rollDryh(
      request({ discipline: 1, exhaustion: 1, madness: 0, pain: 1 }),
      faces(4, 5, 6),
    );
    assert.equal(result.dominant, null);
    assert.equal(result.success, false);
  });
});

describe('validation', () => {
  it('rejects a pool beyond the cap', () => {
    assert.throws(() => rollDryh(request({ pain: 7 })), /between 0 and 6/);
  });

  it('rejects a negative pool', () => {
    assert.throws(() => rollDryh(request({ madness: -1 })), /between 0 and 6/);
  });

  it('rejects a fractional pool', () => {
    assert.throws(
      () => rollDryh(request({ exhaustion: 1.5 })),
      (error: Error) => {
        assert.ok(error instanceof DiceError);
        assert.match(error.message, /whole number/);
        return true;
      },
    );
  });

  it('accepts empty pools', () => {
    const result = rollDryh(request({ discipline: 0, exhaustion: 0, madness: 0, pain: 0 }));
    assert.equal(result.playerSuccesses, 0);
    assert.equal(result.success, false);
    assert.equal(result.dominant, null);
  });
});

describe('formatting', () => {
  it('strikes through the dice that missed', () => {
    const result = rollDryh(request(), faces(2, 5, 1, 3, 6, 1, 2, 4, 3, 6));
    assert.equal(
      formatDryh(result),
      [
        'Discipline [2, ~~5~~, 1] → **2 successes**',
        'Exhaustion [3, ~~6~~] → **1 success**',
        'Madness [1] → **1 success**',
        'Pain [2, ~~4~~, 3, ~~6~~] → **2 successes**',
        '',
        '**Success** — you 4, Pain 2 · dominant: **Pain**',
      ].join('\n'),
    );
  });

  it('leaves out pools with no dice', () => {
    const result = rollDryh(
      request({ discipline: 0, exhaustion: 1, madness: 0, pain: 1 }),
      faces(2, 5),
    );
    const output = formatDryh(result);
    assert.ok(!output.includes('Discipline'), output);
    assert.ok(!output.includes('Madness'), output);
    assert.ok(output.includes('Exhaustion [2]'), output);
  });

  it('leads with the comment and escapes it', () => {
    const result = rollDryh(
      request({ discipline: 1, exhaustion: 0, madness: 0, pain: 0, comment: '**ward**' }),
      faces(1),
    );
    assert.ok(formatDryh(result).startsWith('**\\*\\*ward\\*\\***\n'));
  });

  it('says so when no pool dominated', () => {
    const result = rollDryh(
      request({ discipline: 1, exhaustion: 0, madness: 0, pain: 0 }),
      faces(5),
    );
    assert.ok(formatDryh(result).includes('no dominant pool'));
  });
});
