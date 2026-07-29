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
src/dice/types.ts       AST, results, `DiceError`, `Rng`  <- the seam
src/dice/scanner.ts     character cursor the parser drives
src/dice/parser.ts      text -> AST      (recursive descent)
src/dice/roller.ts      AST -> result    (evaluator, RNG injected)
src/dice/format.ts      result -> Discord markdown
src/dice/limits.ts      caps + the shared per-request dice and step budget
src/dice/sanitize.ts    input normalisation, markdown escaping, error quoting
scripts/register.ts     uploads commands to Discord (Node, not the Worker)
scripts/roll.ts         local CLI: `npm run roll -- "2d6+3"` — no Discord
DEPLOY.md               go-live steps, deliberately deferred
```

## Conventions

- **The seam is `parse` / `roll`.** The parser produces a `Node` tree and never
  rolls; the evaluator rolls and never parses. Extending notation = extend the
  `Node` union in `dice/types.ts`, then both halves independently.
- **A dice term and a repetition group both produce a LIST, and every modifier
  consumes a list.** That is why `4d6kh3` and `5(d5+2)kh2` share one code path.
  Keep it that way when adding modifiers.
- **No separate token stream.** The grammar is context-sensitive (`d` starts a
  die but `dl` is drop-lowest; `>` is a success test unless it follows `!`), so
  the parser drives a `Scanner` cursor and asks for what it expects.
- **Node strips types without transforming them** (`erasableSyntaxOnly`), so no
  enums, no namespaces, and no `constructor(readonly x: T)` parameter
  properties — they parse but fail at runtime.
- **RNG is injected** (`Rng = () => number`), so every roll is testable with a
  fixed sequence. Never call `Math.random()` outside `defaultRng`.
- **User-fixable errors throw `DiceError`**; its message is shown to the user.
  Anything else is logged and becomes a generic message.
- Error replies are ephemeral; successful rolls are public unless `private:true`.
- Imports use explicit `.ts` extensions (`verbatimModuleSyntax`, no transpile).

## Safety model

The threat is a hostile `/roll` argument, since that is the only untrusted
input. Four things bound it; keep all four in mind when adding features.

| Guard | Stops |
| --- | --- |
| `MAX_INPUT_LENGTH`, plus the option's `max_length` | over-long input, rejected by Discord before it reaches the Worker |
| `MAX_DEPTH` in the parser | stack overflow from nested `(` — a `RangeError` is not a `DiceError` and would escape as "something went wrong" |
| `Budget.step()` in the evaluator | repetition nests such as `100(100(100(100(1))))`, which cost ~10^8 evaluations while rolling **zero** dice, so the dice budget never fires |
| `allowed_mentions: { parse: [] }` on every response | `/roll d6 # @everyone` pinging the server with the bot's permissions |

Plus, on the two free-text fields that get echoed back: face names are
allowlisted, comments are markdown-escaped, invisible and bidi characters are
stripped everywhere, and error messages quote user input through `quote()` so
a stray backtick cannot break out of the code span.

A blanket character blocklist on the whole input was considered and rejected:
the grammar already refuses everything it does not understand, so a blocklist
would be a weaker second gate — and it cannot express the rules that actually
matter, which are about *echoed* text rather than parsed text.

## Constraints worth remembering

- Interaction must be answered within **3 seconds** or Discord errors. Rolling
  is instant, so no `defer` yet — if a feature ever gets slow, defer first.
- Discord message content caps at **2000 chars**; `format.ts` drops the
  breakdown rather than the total when a roll gets huge.
- Guild-scoped command registration is instant; global takes up to ~1h.
- Worker free tier: 10ms CPU per request. Guard rails live in `parser.ts`
  (`MAX_DICE`, `MAX_SIDES`).

## Deployment gotchas

Both of these cost real time once; do not rediscover them.

- **`wrangler secret put` keeps a trailing newline.** Piping with `echo` (or
  any PowerShell pipeline) stores a 65-character key and every signature check
  fails. Discord then reports only "could not be verified" while the Worker
  looks perfectly healthy from outside. Use `printf '%s'` or the prompt.
- **A 401 from the Worker is the good outcome** when probing with a garbage
  signature: it proves verification ran and returned false. A 500 would mean it
  threw. That single probe separates "key is wrong" from "library is broken",
  which is otherwise invisible.

`npm run endpoint -- <url>` sets the interactions endpoint through the API, so
the Developer Portal is never needed. `--clear` removes it.

## Secrets

`.env` (bot token, app ID, guild ID) and `.dev.vars` (public key) are
git-ignored and hold real credentials. Never print, commit, or paste them into
tool output. Production secrets go in Cloudflare via `wrangler secret put`.

## Status

- [x] Scaffold, Worker, signature verify, register script
- [x] **Full notation implemented** per `NOTATION.md` — scanner, parser,
      evaluator, formatter
- [x] `/roll`, `/dryh`, `/help`, plus local CLIs (`npm run roll`, `npm run dryh`)
- [x] Deployed and live, guild-scoped. Nothing registered globally; bot is not
      public. Deployment specifics live in `CLAUDE.local.md`, which is
      git-ignored — keep hostnames, server names and account details there.
- [x] MIT licence

`/help` is where the syntax reference lives, because Discord caps command
descriptions at 100 characters. It links to the notation page the Worker itself
serves, using the origin of the request Discord just made — so a fork links to
its own deployment with nothing to configure.

## Requirements (settled 2026-07-29)

Mechanics — all of these are in scope:
- Keep/drop: `4d6kh3`, `2d20kl1`, `5d6dl2`
- Exploding and rerolls: `d6!`, `d6r1`, `d6ro<3`
- Success pools: `5d10>7` (counting, not summing)
- Non-numeric dice: Fudge `4dF`, custom faces
- **Don't Rest Your Head** style pool rolling
- **Weird-sided dice**: `d0`, `d-100`. Integer sides only — no fractional dice.
- **Parentheses and repetition**: `5(d4+1)` means roll `d4+1` five times and
  sum, i.e. equivalent to `5d4+5`. `5(d5+2)kh2` keeps the highest 2 *group
  results*, not faces.
- **Sums of mixed terms**: `3d12 + 1d10 + 5(d5+2)kh2`

Interface:
- Plain-text output with a full breakdown (no embeds), e.g.
  `` `4d6kh3` → 4d6 [5, 4, 3, ~~1~~] = **12** ``
- **Stateless.** No KV, no D1, no saved rolls, no history.
- `/roll` conveniences wanted: repeat (`3x 1d20+5`), labels/comments
  (`1d20+5 # perception`), several expressions at once (`1d20+5, 2d6+3`)
- Not wanted for now: autocomplete

### Design consequence

Keep/drop applies to a **list of values**, and that list is either the faces of
a dice term or the results of a repeated group. So the AST needs a uniform
"produces a list" notion rather than treating keep/drop as a dice-only suffix.
Modifiers compose on top of any list-producing node.

### Die ranges

A die is a uniform pick from a contiguous range; a negative side count mirrors
the positive one. Sides must be integers.

```
d0    -> 0 (always)      d6    -> 1..6
d1    -> 1               d-6   -> -6..-1
                         d-100 -> -100..-1
```

### Grammar: juxtaposition vs multiplication

These are **different operations** and both are supported:

```
5(d4+1)    roll d4+1 five times and sum   ==  5d4+5
5*(d4+1)   roll d4+1 once, multiply by 5
5d4kh2     keep the highest 2 faces
5(d4)kh2   keep the highest 2 group results
```

### Don't Rest Your Head

Its own `/dryh` command with named integer options per pool — not notation
inside `/roll`. Full spec in `NOTATION.md`. Successes are dice showing 1-3;
Discipline + Exhaustion + Madness are compared against Pain.

Both tie-breaks are ours rather than the book's, so they are the first thing to
revisit if the user's table disagrees: a successes tie goes to Pain, and a
dominance tie goes to the more dangerous pool
(Pain > Madness > Exhaustion > Discipline).

### Discord command options

Worth knowing before designing another command, because it is easy to get
wrong from the outside:

- **Users never type option names.** The client inserts `pain:` on Tab, so
  short or abbreviated option names save nothing and cost discoverability.
- **Options cannot have aliases.** An option has exactly one `name`; a second
  name means a second field in the UI, which anyone could also fill in.
- **There are no positional arguments.** Everything is `name:value`. Order-based
  input is only possible by parsing one string option yourself, which throws
  away the labelling the UI gives for free.
- **Autocomplete suggests values for one option, not names.** It needs a
  separate interaction type answered within 3 seconds, and is pointless for
  small integer ranges.

### Decided without asking

- Exploding and rerolls are capped (a `d1!` would otherwise never terminate).
  Cap is per-term and raises a `DiceError` rather than silently truncating.
- Modifiers stack left to right: `4d6r1kh3` rerolls first, then keeps.
- `3x` prefix repeats an expression as separate results; `,` separates
  independent expressions; `#` starts a trailing comment/label.

### Notation spec

**`NOTATION.md` is the contract.** Full syntax, semantics, precedence, limits
and output format live there — read it before touching `src/dice/`. Keep it and
the parser in step; if one changes, change the other in the same commit.

Summary of what was settled beyond the basics: `/` floors, `//` ceilings, `/~`
rounds to nearest; success pools are comparison suffixes with an optional `fC`
botch clause; custom faces are `d[...]` lists (numeric ones sum, symbolic ones
tally); exploding has `!`, `!!` and `!p` variants with comparison triggers; all
limits raise `DiceError` rather than truncating.

## Open questions

None blocking. The user said they expect to add requirements — treat
`NOTATION.md` as settled-so-far, not finished.
