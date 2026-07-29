# dice-roller — working notes

Discord dice-rolling bot. Cloudflare Worker, HTTP Interactions, TypeScript, no build step.

## Working agreement

- **Keep this file up to date.** When a decision is made, a requirement is
  settled, or an open question is answered, edit this file in the same turn.
  It is the memory between sessions.
- **Do not assume requirements.** When something is genuinely ambiguous and the
  readings lead to different work, ask — prefer the `AskUserQuestion` tool over
  a wall of prose.
- **Offer suggestions.** Where there is a sensible default or a better option,
  say so and recommend one; don't just present a menu.
- Ask at the right moment: do everything that doesn't depend on the answer first.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Runtime | Cloudflare Workers | free, no 24/7 process, no server upkeep |
| Transport | HTTP Interactions (webhook) | slash commands only — no Gateway needed |
| Language | TypeScript, Node 24 | native `.ts` execution, `--env-file`; no bundler config |
| Deps | `discord-interactions` only | signature verification; everything else hand-rolled |
| Tests | `node:test` | zero deps, no build step |

Deliberately **not** used: discord.js (Gateway-oriented, unnecessary here) and
`@dice-roller/rpg-dice-roller` — the parser is being written by hand on purpose.

## Layout

```
src/index.ts            Worker entry: signature verify, PING, command routing
src/handlers.ts         Command dispatch -> interaction responses
src/commands.ts         Slash-command definitions (shared with register script)
src/discord/constants.ts  API enums, kept local
src/discord/types.ts    Interaction payload types + option accessors
src/dice/types.ts       AST `Node`, `RollResult`, `DiceError`, `Rng`  <- the seam
src/dice/parser.ts      text -> AST      (PLACEHOLDER, to be replaced)
src/dice/roller.ts      AST -> result    (evaluator, RNG injected)
src/dice/format.ts      result -> Discord markdown
scripts/register.ts     uploads commands to Discord (Node, not the Worker)
```

## Conventions

- **The seam is `parse` / `evaluate`.** Parser produces a `Node` tree and never
  rolls; evaluator rolls and never parses. Extending notation = extend the
  `Node` union in `dice/types.ts`, then both halves independently.
- **RNG is injected** (`Rng = () => number`), so every roll is testable with a
  fixed sequence. Never call `Math.random()` outside `defaultRng`.
- **User-fixable errors throw `DiceError`**; its message is shown to the user.
  Anything else is logged and becomes a generic message.
- Error replies are ephemeral; successful rolls are public unless `private:true`.
- Imports use explicit `.ts` extensions (`verbatimModuleSyntax`, no transpile).

## Constraints worth remembering

- Interaction must be answered within **3 seconds** or Discord errors. Rolling
  is instant, so no `defer` yet — if a feature ever gets slow, defer first.
- Discord message content caps at **2000 chars**; `format.ts` drops the
  breakdown rather than the total when a roll gets huge.
- Guild-scoped command registration is instant; global takes up to ~1h.
- Worker free tier: 10ms CPU per request. Guard rails live in `parser.ts`
  (`MAX_DICE`, `MAX_SIDES`).

## Secrets

`.env` (bot token, app ID, guild ID) and `.dev.vars` (public key) are
git-ignored and hold real credentials. Never print, commit, or paste them into
tool output. Production secrets go in Cloudflare via `wrangler secret put`.

## Status

- [x] Scaffold, Worker, signature verify, `/roll`, register script, tests
- [ ] Not yet deployed; Interactions Endpoint URL not yet set in the portal
- [ ] **Real dice notation — requirements not gathered yet.** The current
      parser handles only `NdM` with `+`/`-` and exists to prove the pipeline.

## Open questions

Ask these before writing the real parser:
- Which systems/notations matter (D&D 5e advantage, keep/drop `4d6kh3`,
  exploding `d6!`, reroll `d6r1`, success pools `5d10>7`, Fudge `4dF`)?
- Result presentation: plain text vs embeds? Show every die or just the total?
- Saved/named rolls per user — needed? (would require storage: KV or D1)
- Should `/roll` support multiple rolls at once (`3x 1d20+5`)?
