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
npm run roll -- "5(d5+2)kh2" --ast
npm run dryh -- --pain 4 --exhaustion 2   # Don't Rest Your Head
npm test                  # unit tests (node:test, no build step)
npm run typecheck
npm run dev               # wrangler dev on http://localhost:8787
```

`npm run roll` is the fast loop while designing notation — it skips Discord and
the Worker entirely.

## Deploying

See [DEPLOY.md](DEPLOY.md). Not needed until the bot should run for real.

## Commands

| Command | Does |
| --- | --- |
| `/roll` | Dice notation — see [NOTATION.md](NOTATION.md) |
| `/dryh` | Don't Rest Your Head pool roll |
| `/help` | The notation reference, shown only to you |

## Dice notation

See [NOTATION.md](NOTATION.md) for the full syntax.

`src/dice/parser.ts` does **not** implement it yet — it is a placeholder
supporting only `NdM` with `+`/`-`, there to prove the pipeline end to end.

## Licence

MIT — see [LICENSE](LICENSE).

## Secrets

`.env` and `.dev.vars` are git-ignored. Production secrets live in Cloudflare
(`wrangler secret put`), never in `wrangler.jsonc`. If the bot token ever leaks,
reset it in the Developer Portal immediately.
