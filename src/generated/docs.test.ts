import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { renderPage } from '../../scripts/build-docs.ts';
import { helpText } from '../commands.ts';
import { NOTATION_HTML } from './notation.ts';

describe('generated notation page', () => {
  it('matches NOTATION.md — run `npm run docs` if this fails', () => {
    assert.equal(
      NOTATION_HTML,
      renderPage(readFileSync('NOTATION.md', 'utf8')),
      'src/generated/notation.ts is stale. Regenerate it with `npm run docs`.',
    );
  });

  it('is a complete HTML document', () => {
    assert.ok(NOTATION_HTML.startsWith('<!doctype html>'));
    assert.ok(NOTATION_HTML.includes('</html>'));
  });

  it('carries the content, not just the shell', () => {
    for (const expected of ['Dice terms', 'Repetition vs multiplication', 'Success pools']) {
      assert.ok(NOTATION_HTML.includes(expected), `missing section: ${expected}`);
    }
  });
});

describe('help text', () => {
  it('fits inside a Discord message', () => {
    const text = helpText('https://dice-roller.example.workers.dev');
    assert.ok(text.length <= 2000, `help is ${text.length} characters, limit is 2000`);
  });

  it('links to whichever deployment answered', () => {
    assert.ok(helpText('https://fork.example.workers.dev').includes('<https://fork.example.workers.dev>'));
  });

  it('explains the part newcomers get stuck on', () => {
    const text = helpText('https://example.com');
    assert.ok(text.includes('Tab'), 'should explain tabbing between fields');
    assert.ok(text.includes('/roll'), 'should name the main command');
  });
});
