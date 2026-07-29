import { verifyKey } from 'discord-interactions';
import { InteractionResponseType, InteractionType } from './discord/constants.ts';
import type { Interaction } from './discord/types.ts';
import { handleCommand } from './handlers.ts';

export interface Env {
  /** From Developer Portal → General Information. Not a secret, but set as one. */
  DISCORD_PUBLIC_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'GET') {
      return new Response('dice-roller is up. Point Discord at POST /', { status: 200 });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Discord signs every request. Verify against the RAW body, before parsing.
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.text();

    if (!signature || !timestamp) {
      return new Response('Missing signature headers', { status: 401 });
    }
    const valid = await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
    if (!valid) {
      return new Response('Bad request signature', { status: 401 });
    }

    const interaction = JSON.parse(body) as Interaction;

    switch (interaction.type) {
      // Discord sends a PING to validate the endpoint URL, and periodically after.
      case InteractionType.PING:
        return json({ type: InteractionResponseType.PONG });

      case InteractionType.APPLICATION_COMMAND:
        return json(handleCommand(interaction));

      default:
        return new Response('Unhandled interaction type', { status: 400 });
    }
  },
} satisfies ExportedHandler<Env>;

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json;charset=UTF-8' },
  });
}
