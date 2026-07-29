# dice-roller

A Discord dice-rolling bot running on Cloudflare Workers via HTTP Interactions
(no always-on process, no server to maintain).

## How it fits together

```
Discord  --POST signed interaction-->  Cloudflare Worker (src/index.ts)
                                         |- verify Ed25519 signature
                                         |- handlers.ts  -> dispatch /roll
                                         |    dice/parser.ts   text -> AST
                                         |    dice/roller.ts   AST  -> result
                                         |    dice/format.ts   result -> markdown
                                         '- JSON response (shown in channel)
```

Slash commands are uploaded separately by `scripts/register.ts` — the Worker
never registers them itself.

## Setup

1. `npm install`
2. Fill in `.env` (bot token, application ID, your test server's ID).
3. Fill in `.dev.vars` (public key).
4. `npm run register` — uploads `/roll` to your test guild, appears instantly.
5. `npm run deploy` — publishes the Worker, prints its URL.
6. `npx wrangler secret put DISCORD_PUBLIC_KEY` — paste the same public key.
7. Developer Portal → General Information → **Interactions Endpoint URL** →
   paste the Worker URL → Save. Discord sends a PING; saving fails if the
   Worker isn't live or the key is wrong.

## Local development

```bash
npm run dev      # wrangler dev on http://localhost:8787
npm test         # unit tests (node:test, no build step)
npm run typecheck
```

Discord can't reach `localhost`, so to test against real Discord either deploy,
or tunnel: `npx cloudflared tunnel --url http://localhost:8787` and point the
Interactions Endpoint URL at the tunnel while developing.

## Dice notation

`src/dice/parser.ts` is a **placeholder** supporting only `NdM` with `+`/`-`.
The real notation is being designed — see `CLAUDE.md`.

## Secrets

`.env` and `.dev.vars` are git-ignored. Production secrets live in Cloudflare
(`wrangler secret put`), never in `wrangler.jsonc`. If the bot token ever leaks,
reset it in the Developer Portal immediately.
