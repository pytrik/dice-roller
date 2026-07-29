import { MAX_COMMENT_LENGTH, MAX_INPUT_LENGTH } from './limits.ts';
import { DiceError } from './types.ts';

/* ----------------------------------------------------------------------- *
 * Anything the user typed that we later echo back into a Discord message is
 * untrusted. The grammar rejects what it does not understand, so a blanket
 * character blocklist on the whole input would only be a weaker second gate.
 * What does need handling is narrower:
 *
 *   - invisible characters, which make the output lie about what was rolled
 *   - markdown in free-text fields, which lets a roll forge formatting
 *   - mentions, which are neutralised on the response, not here
 * ----------------------------------------------------------------------- */

/**
 * C0/C1 controls (tab and newline are left for the whitespace collapse below),
 * zero-width characters, and the bidi controls. A right-to-left override
 * inside a face name reverses how the rest of the line renders, so a roll
 * could be made to display as something it is not.
 *
 * Built from a string rather than written as a regex literal so the escape
 * sequences cannot end up in the file as the very characters they match.
 */
const INVISIBLE = new RegExp(
  '[\\u0000-\\u0008\\u000B-\\u001F\\u007F-\\u009F' + // C0/C1 controls
    '\\u200B-\\u200F' + // zero-width space and joiners, LTR/RTL marks
    '\\u202A-\\u202E' + // bidi embeddings and overrides
    '\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]', // word joiner, isolates, BOM
  'g',
);

/** Characters Discord treats as formatting. */
const MARKDOWN = /([\\`*_~|])/g;

/** How much of a bad expression an error message quotes back. */
const QUOTE_LENGTH = 40;

/** First pass over the raw command argument, before parsing. */
export function normalizeInput(raw: string): string {
  if (raw.length > MAX_INPUT_LENGTH) {
    throw new DiceError(`Roll is too long — keep it under ${MAX_INPUT_LENGTH} characters.`);
  }

  const cleaned = strip(raw);
  if (cleaned === '') throw new DiceError('Nothing to roll.');
  return cleaned;
}

/** Trailing `# comment` text. Free-form, so it is trimmed rather than rejected. */
export function normalizeComment(raw: string): string | null {
  const cleaned = strip(raw);
  if (cleaned === '') return null;
  return cleaned.length > MAX_COMMENT_LENGTH
    ? `${cleaned.slice(0, MAX_COMMENT_LENGTH)}…`
    : cleaned;
}

/** Escapes text that goes into a message as content rather than as formatting. */
export function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN, '\\$1');
}

/**
 * Renders a fragment of user input inside an error message. Errors quote what
 * the user typed, so without this a stray backtick would break out of the code
 * span and let a failed roll forge formatting.
 */
export function quote(text: string): string {
  const cleaned = strip(text).replace(/`/g, '');
  const clipped = cleaned.length > QUOTE_LENGTH ? `${cleaned.slice(0, QUOTE_LENGTH)}…` : cleaned;
  return `\`${clipped}\``;
}

function strip(text: string): string {
  return text.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}
