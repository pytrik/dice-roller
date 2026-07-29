import { ApplicationCommandOptionType } from './discord/constants.ts';
import { MAX_INPUT_LENGTH } from './dice/limits.ts';

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

export const HELP_COMMAND = {
  name: 'help',
  description: 'Show the dice notation reference',
  options: [],
} as const;

export const COMMANDS = [ROLL_COMMAND, HELP_COMMAND];

/** Shown by /help. Kept under Discord's 2000-character message limit. */
export const HELP_TEXT = `**Dice notation**

**Dice** — \`d6\` \`4d6\` \`d%\` (=d100) \`dF\` (Fudge) \`d0\` \`d-100\` (negative range)
**Custom faces** — \`d[1,1,2,3]\` weighted · \`d[sword,shield,blank]\` symbols
**Maths** — \`+\` \`-\` \`*\` · \`/\` rounds down · \`//\` rounds up · \`/~\` to nearest

**Keep / drop** — \`4d6kh3\` keep highest 3 · \`2d20kl1\` keep lowest · \`5d6dl2\` drop lowest 2
The count defaults to 1, so \`2d20kh\` is advantage and \`2d20kl\` is disadvantage.

**Exploding** — \`d6!\` · \`d6!!\` compounding · \`d6!p\` penetrating · \`d6!>4\` custom trigger
**Rerolls** — \`d6r1\` reroll while it is a 1 · \`d6ro<3\` reroll once
**Success pools** — \`5d10>=7\` count successes · \`5d10>=7f1\` each 1 cancels a success

**Repeat vs multiply — these are different!**
\`5(d4+1)\` rolls d4+1 five times and sums them  (same as \`5d4+5\`)
\`5*(d4+1)\` rolls it once and multiplies the result by 5
Modifiers work on groups too: \`5(d5+2)kh2\` keeps the best two results.

**Several rolls** — \`3x 1d20+5\` repeat · \`1d20+7, 2d6+4\` separate · \`1d20+5 # perception\` label

Modifiers stack left to right: \`4d6r1kh3\` rerolls the 1s, then keeps the best 3.
Limits: 1000 dice and 20 expressions per roll.`;
