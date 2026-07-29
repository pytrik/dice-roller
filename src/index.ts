import { verifyKey } from 'discord-interactions';
import { InteractionResponseType, InteractionType } from './discord/constants.ts';
import type { Interaction } from './discord/types.ts';
import { NOTATION_HTML } from './generated/notation.ts';
import { handleCommand } from './handlers.ts';

export interface Env {
  /** From Developer Portal → General Information. Not a secret, but set as one. */
  DISCORD_PUBLIC_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // GET serves the notation reference; POST is the interactions endpoint.
    if (request.method === 'GET') {
      return new Response(NOTATION_HTML, {
        status: 200,
        headers: {
          'content-type': 'text/html;charset=UTF-8',
          'cache-control': 'public, max-age=3600',
        },
      });
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
        // The origin Discord just posted to. Taking it from the request rather
        // than from config means a fork links to its own deployment, always,
        // with nothing to set and nothing that can go stale.
        return json(handleCommand(interaction, new URL(request.url).origin));

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
