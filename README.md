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

## Local development

```bash
npm install
npm run roll -- "2d6+3"   # drive the parser/evaluator from the CLI, no Discord
npm run roll -- "2d6" --times 5 --ast
npm test                  # unit tests (node:test, no build step)
npm run typecheck
npm run dev               # wrangler dev on http://localhost:8787
```

`npm run roll` is the fast loop while designing notation — it skips Discord and
the Worker entirely.

## Deploying

See [DEPLOY.md](DEPLOY.md). Not needed until the bot should run for real.

## Dice notation

`src/dice/parser.ts` is a **placeholder** supporting only `NdM` with `+`/`-`.
The real notation is being designed — see `CLAUDE.md`.

## Secrets

`.env` and `.dev.vars` are git-ignored. Production secrets live in Cloudflare
(`wrangler secret put`), never in `wrangler.jsonc`. If the bot token ever leaks,
reset it in the Developer Portal immediately.
