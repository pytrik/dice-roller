# Going live

Not needed while developing locally — see "Local loop" at the bottom.
Run these in order; step 5 fails unless 3 and 4 are both done.

## Prerequisites

- `.env` filled in (bot token, application ID, guild ID) — done
- `.dev.vars` filled in (public key) — done
- A Cloudflare account (free tier is enough)

## Steps

```bash
# 1. Log in to Cloudflare (opens a browser once, then remembers)
npx wrangler login

# 2. Upload the slash commands to your test server.
#    Guild-scoped: appears instantly. Re-run after editing src/commands.ts.
npm run register

# 3. Publish the Worker. Prints a URL like
#    https://dice-roller.<your-subdomain>.workers.dev
npm run deploy

# 4. Give the deployed Worker the public key it verifies signatures with.
#    Paste the same value that is in .dev.vars.
npx wrangler secret put DISCORD_PUBLIC_KEY
```

**5.** Discord Developer Portal → your application → **General Information** →
**Interactions Endpoint URL** → paste the Worker URL from step 3 → **Save**.

Discord sends a PING to that URL and refuses to save if it does not get a valid
signed PONG back. If saving fails, the Worker is not deployed (step 3) or the
secret is missing/wrong (step 4).

**6.** Invite the bot: Developer Portal → **Installation** (or OAuth2 → URL
Generator) → scopes `bot` + `applications.commands`, permission `Send Messages`
→ open the generated URL → pick your server → Authorize.

Then type `/roll 2d6+3` in that server.

## When it is time for real users

```bash
npm run register:global   # global commands, up to ~1h to propagate
```

Keep the guild registration for development — global commands are slow to
update and you do not want to wait an hour per iteration.

## Redeploying

Code change → `npm run deploy`.
Change to `src/commands.ts` (names, options, descriptions) → also
`npm run register`. Commands and code are uploaded separately.

## Local loop (no deploy, no Discord)

```bash
npm run roll -- "2d6+3"   # exercise the parser/evaluator straight from the CLI
npm test                  # unit tests
npm run typecheck
npm run dev               # wrangler dev, http://localhost:8787
```

`wrangler dev` runs the real Worker, but Discord cannot reach localhost and
requests must carry a valid Discord signature — so `curl` against it will get
`401`. To test against real Discord without deploying, tunnel it:

```bash
npx cloudflared tunnel --url http://localhost:8787
```

then set the Interactions Endpoint URL to the tunnel URL while developing.
