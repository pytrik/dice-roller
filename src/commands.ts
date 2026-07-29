import { ApplicationCommandOptionType } from './discord/constants.ts';

/** Command definitions. Edit here, then run `npm run register`.
 *  Imported by both the Worker (to dispatch) and scripts/register.ts (to upload). */

export const ROLL_COMMAND = {
  name: 'roll',
  description: 'Roll dice, e.g. 2d6+3',
  options: [
    {
      name: 'notation',
      description: 'Dice notation to roll, e.g. 2d6+3',
      type: ApplicationCommandOptionType.STRING,
      required: true,
    },
    {
      name: 'private',
      description: 'Only you see the result (default: false)',
      type: ApplicationCommandOptionType.BOOLEAN,
      required: false,
    },
  ],
} as const;

export const COMMANDS = [ROLL_COMMAND];
