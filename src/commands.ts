import { ApplicationCommandOptionType } from './discord/constants.ts';
import { MAX_COMMENT_LENGTH, MAX_INPUT_LENGTH, MAX_POOL } from './dice/limits.ts';

/** Command definitions. Edit here, then run `npm run register`.
 *  Imported by both the Worker (to dispatch) and scripts/register.ts (to upload).
 *  Discord caps descriptions at 100 characters, which is why the real syntax
 *  reference lives in /help rather than in the option description. */

export const ROLL_COMMAND = {
  name: 'roll',
  description: 'Roll dice: keep/drop, exploding, rerolls, pools, custom faces. /help for syntax.',
  options: [
    {
      name: 'notation',
      description: 'What to roll, e.g. 4d6kh3, 5d10>=7f1, 3d12+5(d5+2)kh2. See /help.',
      type: ApplicationCommandOptionType.STRING,
      required: true,
      // Enforced by Discord before the request is ever sent, so an over-long
      // argument costs the Worker nothing. Re-checked server-side regardless.
      min_length: 1,
      max_length: MAX_INPUT_LENGTH,
    },
    {
      name: 'private',
      description: 'Only you see the result (default: false)',
      type: ApplicationCommandOptionType.BOOLEAN,
      required: false,
    },
  ],
} as const;

const POOL_OPTION = {
  type: ApplicationCommandOptionType.INTEGER,
  min_value: 0,
  max_value: MAX_POOL,
} as const;

export const DRYH_COMMAND = {
  name: 'dryh',
  description: "Don't Rest Your Head: roll Discipline, Exhaustion and Madness against Pain.",
  options: [
    {
      name: 'pain',
      description: 'Pain dice the GM set (0-6)',
      required: true,
      ...POOL_OPTION,
    },
    {
      // Required despite having an obvious default: it changes constantly in
      // play, and a forgotten value that silently rolls 1 looks correct.
      name: 'exhaustion',
      description: 'Your current Exhaustion (0-6)',
      required: true,
      ...POOL_OPTION,
    },
    {
      name: 'madness',
      description: 'Madness dice you are spending (0-6, default 0)',
      required: false,
      ...POOL_OPTION,
    },
    {
      name: 'discipline',
      description: 'Discipline dice (0-6, default 3)',
      required: false,
      ...POOL_OPTION,
    },
    {
      name: 'comment',
      description: 'What you are rolling for, e.g. escape the ward',
      type: ApplicationCommandOptionType.STRING,
      required: false,
      max_length: MAX_COMMENT_LENGTH,
    },
    {
      name: 'private',
      description: 'Only you see the result (default: false)',
      type: ApplicationCommandOptionType.BOOLEAN,
      required: false,
    },
  ],
} as const;

export const HELP_COMMAND = {
  name: 'help',
  description: 'Show the dice notation reference',
  options: [],
} as const;

export const COMMANDS = [ROLL_COMMAND, DRYH_COMMAND, HELP_COMMAND];

/**
 * Shown by /help, for people who have not used slash commands before.
 *
 * Deliberately short: it covers how to drive the command and the rolls people
 * actually make, and links to the full grammar rather than dumping it into a
 * chat message. `origin` is the Worker's own URL, so the link always points at
 * whichever deployment answered.
 */
export function helpText(origin: string): string {
  return `**How to use this bot**

Type \`/roll\` and press **Tab** — Discord fills the rest in for you. You never
type the option names yourself; **Tab** moves you between the fields.

> \`/roll\` **Tab** \`2d6+3\` **Enter**

Keep pressing **Tab** to reach the optional fields, such as \`private\`, which
shows the result to you alone.

**Commands**
\`/roll\` — roll dice. This is the main one.
\`/dryh\` — Don't Rest Your Head pools. Fill in \`pain\` and \`exhaustion\`.
\`/help\` — this message.

**Rolls people actually make**
\`d20\` — one die
\`2d6+3\` — two dice, plus three
\`4d6kh3\` — roll four, keep the best three
\`2d20kh\` — advantage · \`2d20kl\` — disadvantage
\`d6!\` — explodes: a 6 rolls again and adds
\`d6r1\` — reroll any 1s
\`5d10>=7\` — count successes instead of adding up
\`3x 1d20+5\` — roll the same thing three times
\`1d20+7, 2d6+4\` — two different rolls at once
\`1d20+5 # perception\` — label what it was for

Dice that did not count are ~~struck through~~ in the result, so you can always
see what was rolled and what was dropped.

**Everything else — exploding variants, custom dice, success pools, maths:**
<${origin}>`;
}

