import { EPHEMERAL, InteractionResponseType } from './discord/constants.ts';
import { getOption, type Interaction } from './discord/types.ts';
import { formatResult } from './dice/format.ts';
import { parse } from './dice/parser.ts';
import { evaluate } from './dice/roller.ts';
import { DiceError } from './dice/types.ts';

interface MessageResponse {
  type: number;
  data: { content: string; flags?: number };
}

/** Routes an application command to its handler. */
export function handleCommand(interaction: Interaction): MessageResponse {
  switch (interaction.data?.name) {
    case 'roll':
      return handleRoll(interaction);
    default:
      return reply(`Unknown command \`${interaction.data?.name}\`.`, true);
  }
}

function handleRoll(interaction: Interaction): MessageResponse {
  const notation = String(getOption(interaction, 'notation') ?? '');
  const isPrivate = getOption(interaction, 'private') === true;

  try {
    const result = evaluate(parse(notation));
    return reply(formatResult(notation, result), isPrivate);
  } catch (error) {
    if (error instanceof DiceError) return reply(`❌ ${error.message}`, true);
    console.error('roll failed', error);
    return reply('❌ Something went wrong rolling that.', true);
  }
}

function reply(content: string, ephemeral = false): MessageResponse {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: ephemeral ? { content, flags: EPHEMERAL } : { content },
  };
}
