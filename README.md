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

GET on the same URL serves the notation reference, rendered from NOTATION.md.
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
| `/help` | How to drive the bot, shown only to you |

`/help` links to the full notation reference, which **the Worker serves itself**
at its own root URL. The link is built from the origin of the request Discord
made, so a fork points at its own deployment with nothing to configure and no
way to accidentally link back here.

`NOTATION.md` is rendered to HTML by `npm run docs` into
`src/generated/notation.ts`, which is committed. A test regenerates it and
asserts it matches, so a stale page fails the suite instead of shipping.

## Dice notation

See [NOTATION.md](NOTATION.md) for the full syntax — keep/drop, three explosion
styles, rerolls, success pools with botches, custom and symbolic faces, Fudge
dice, mirrored negative dice, repetition groups and three rounding divisions.

```
`3d12 + 1d10 + 5(d5+2)kh2` → 3d12 [9, 8, 5]  1d10 [10]  5(d5+2) [5, 7, ~~4~~, ~~4~~, ~~5~~] = **44**
```

The parser is hand-written — a character scanner rather than a token stream,
because the grammar is context-sensitive: `d` starts a die but `dl` is
drop-lowest, and `>` is a success test unless it follows `!`. Every example in
`NOTATION.md` is rolled by `src/dice/spec.test.ts`, so the documentation cannot
drift away from the implementation.

## How this was built

**This project was written with AI assistance.** Essentially all of the code,
tests and documentation in this repository were produced by
[Claude Opus](https://www.anthropic.com/claude) running in
[Claude Code](https://claude.com/claude-code), working from my requirements
across a series of conversations.

I directed the work rather than typing it: I chose the platform and the
notation, made the design calls the model put to me — how repetition composes
with keep/drop, how ties resolve in `/dryh`, what the safety limits should be —
reviewed the output, and tested it against a real Discord server. The model
proposed the architecture, wrote the parser and evaluator, found and fixed the
denial-of-service holes in its own first draft, and deployed it.

Saying so plainly seems better than leaving people to guess. If you are
evaluating this code, weigh it on its merits — the test suite is thorough and
the reasoning is recorded in the commit messages, which is the honest place to
judge it from.

## Licence

MIT — see [LICENSE](LICENSE).

## Secrets

`.env` and `.dev.vars` are git-ignored. Production secrets live in Cloudflare
(`wrangler secret put`), never in `wrangler.jsonc`. If the bot token ever leaks,
reset it in the Developer Portal immediately.
