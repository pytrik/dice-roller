import { HELP_TEXT } from './commands.ts';
import { EPHEMERAL, InteractionResponseType } from './discord/constants.ts';
import { getOption, type Interaction } from './discord/types.ts';
import { formatProgram } from './dice/format.ts';
import { parseProgram } from './dice/parser.ts';
import { rollProgram } from './dice/roller.ts';
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

/** Routes an application command to its handler. */
export function handleCommand(interaction: Interaction): MessageResponse {
  switch (interaction.data?.name) {
    case 'roll':
      return handleRoll(interaction);
    case 'help':
      return reply(HELP_TEXT, true);
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
      return reply(`❌ ${error.message}\nTry \`/help\` for the notation reference.`, true);
    }
    console.error('roll failed', error);
    return reply('❌ Something went wrong rolling that.', true);
  }
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
