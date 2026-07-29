import { helpText } from './commands.ts';
import { EPHEMERAL, InteractionResponseType } from './discord/constants.ts';
import { getOption, type Interaction } from './discord/types.ts';
import { rollDryh } from './dice/dryh.ts';
import { formatDryh, formatProgram } from './dice/format.ts';
import { parseProgram } from './dice/parser.ts';
import { rollProgram } from './dice/roller.ts';
import { normalizeComment } from './dice/sanitize.ts';
import { DiceError } from './dice/types.ts';

interface MessageResponse {
  type: number;
  data: {
    content: string;
    flags?: number;
    allowed_mentions: { parse: never[] };
  };
}

/**
 * Rolls echo user text — comments and face names — back into a message the
 * bot sends. Without this, `/roll d6 # @everyone` would ping the server with
 * the bot's permissions. An empty `parse` list makes every mention in the
 * content inert, so no filtering of the text itself is needed for safety.
 */
const NO_MENTIONS = { parse: [] as never[] };

/** Routes an application command to its handler.
 *  `origin` is the Worker's own URL, used to link to the notation reference. */
export function handleCommand(interaction: Interaction, origin: string): MessageResponse {
  switch (interaction.data?.name) {
    case 'roll':
      return handleRoll(interaction);
    case 'dryh':
      return handleDryh(interaction);
    case 'help':
      return reply(helpText(origin), true);
    default:
      return reply(`Unknown command \`${interaction.data?.name}\`.`, true);
  }
}

function handleRoll(interaction: Interaction): MessageResponse {
  const notation = String(getOption(interaction, 'notation') ?? '');
  const isPrivate = getOption(interaction, 'private') === true;

  try {
    return reply(formatProgram(rollProgram(parseProgram(notation))), isPrivate);
  } catch (error) {
    if (error instanceof DiceError) {
      return reply(`❌ ${error.message}\nTry \`/help\` if you are not sure of the syntax.`, true);
    }
    console.error('roll failed', error);
    return reply('❌ Something went wrong rolling that.', true);
  }
}

function handleDryh(interaction: Interaction): MessageResponse {
  const isPrivate = getOption(interaction, 'private') === true;

  try {
    const result = rollDryh({
      pain: integerOption(interaction, 'pain', 0),
      exhaustion: integerOption(interaction, 'exhaustion', 0),
      madness: integerOption(interaction, 'madness', 0),
      // Fixed at 3 by the rules, so it is the one pool with a safe default.
      discipline: integerOption(interaction, 'discipline', 3),
      comment: normalizeComment(String(getOption(interaction, 'comment') ?? '')),
    });
    return reply(formatDryh(result), isPrivate);
  } catch (error) {
    return failure(error, 'dryh');
  }
}

/** Discord validates `min_value`/`max_value`, but the payload is still just
 *  JSON from the network, so the value is re-checked rather than trusted. */
function integerOption(interaction: Interaction, name: string, fallback: number): number {
  const value = getOption(interaction, name);
  return value === undefined ? fallback : Number(value);
}

function failure(error: unknown, command: string): MessageResponse {
  if (error instanceof DiceError) {
    return reply(`❌ ${error.message}`, true);
  }
  console.error(`${command} failed`, error);
  return reply('❌ Something went wrong with that roll.', true);
}

function reply(content: string, ephemeral = false): MessageResponse {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      allowed_mentions: NO_MENTIONS,
      ...(ephemeral ? { flags: EPHEMERAL } : {}),
    },
  };
}
