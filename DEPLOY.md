# Going live

Not needed while developing locally — see "Local loop" at the bottom.

Only the first step needs a human. Everything after it is scriptable, and the
order matters: step 4 fails unless 2 and 3 have both happened.

## Prerequisites

- `.env` filled in (bot token, application ID, guild ID) — done
- `.dev.vars` filled in (public key) — done
- The bot invited to the test server — done
- A Cloudflare account (free tier is enough)

## Steps

**1. Authenticate to Cloudflare.** The only interactive step: it opens a
browser and cannot be scripted.

```bash
npx wrangler login
```

Alternatively, create a scoped API token in the Cloudflare dashboard
(My Profile → API Tokens → "Edit Cloudflare Workers") and set
`CLOUDFLARE_API_TOKEN`. More setup, but then deploys work headlessly.

**2. Publish the Worker.** Prints a URL like
`https://dice-roller.<your-subdomain>.workers.dev`.

```bash
npm run deploy
```

**3. Give the deployed Worker its public key.** `wrangler secret put` prompts
by default, but reads stdin, so it does not have to.

```bash
npx wrangler secret put DISCORD_PUBLIC_KEY          # prompts, paste the key
```

To pipe it instead, **the value must not end in a newline** — wrangler stores
whatever stdin gives it, so a trailing `\n` makes the key 65 characters and
every signature check fails. The symptom is step 4 reporting that the endpoint
"could not be verified", with a Worker that otherwise looks perfectly healthy.

```bash
printf '%s' "$KEY" | npx wrangler secret put DISCORD_PUBLIC_KEY   # correct
echo "$KEY"        | npx wrangler secret put DISCORD_PUBLIC_KEY   # BROKEN
```

PowerShell's pipeline appends a newline too, so pipe from bash or use the
interactive prompt.

**4. Point Discord at the Worker.**

```bash
npm run endpoint -- https://dice-roller.<your-subdomain>.workers.dev
```

This is the API equivalent of the Developer Portal's "Interactions Endpoint
URL" field. Discord validates it by sending a signed PING and refuses to save
unless it gets a valid PONG back — so if this fails, the Worker is not
deployed (step 2) or the secret is missing or wrong (step 3).

`npm run endpoint -- --clear` removes it again.

### If step 4 says the endpoint could not be verified

Discord does not say *why*. Narrow it down from the outside:

```bash
curl https://<worker>.workers.dev                  # expect 200 and the notation page
curl -X POST https://<worker>.workers.dev          # expect 401, missing headers

# expect 401 — a garbage signature that is REJECTED proves the check ran.
# A 500 here means verification threw rather than returned false.
curl -X POST https://<worker>.workers.dev \
  -H "x-signature-ed25519: $(printf 'a%.0s' {1..128})" \
  -H "x-signature-timestamp: 1700000000" \
  -d '{"type":1}'
```

If all three behave and Discord still refuses, the deployed key does not match
the application's. Compare `npx wrangler secret list` against the portal's
Public Key, and re-read the newline warning in step 3 — that is what bit us the
first time.

**5. Register the slash commands.** Guild-scoped, so they appear instantly.
Re-run after any edit to `src/commands.ts` — code and commands are uploaded
separately.

```bash
npm run register
```

Then type `/roll 2d6+3` in the server.

## Deploying from GitHub Actions

`.github/workflows/deploy.yml` runs the same steps, but **manual dispatch
only** — nothing deploys on push. Actions tab → Deploy → Run workflow. It
typechecks and tests first, and can optionally re-register the commands.

It needs these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Where it comes from |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | see below |
| `CLOUDFLARE_ACCOUNT_ID` | `npx wrangler whoami` |
| `DISCORD_TOKEN` | only needed if registering commands |
| `DISCORD_APPLICATION_ID` | only needed if registering commands |
| `DISCORD_GUILD_ID` | only needed if registering commands |

The first two are enough to deploy. Add the Discord three only if you want CI
to register commands as well.

### The Cloudflare token needs exactly one permission

Dashboard → Manage account → Account API tokens → Create token → custom policy:

> **Workers Scripts → Edit**, scoped to the one account.

That is the whole list, and it is confirmed working — not a guess. `Account
Settings: Read` is **not** required, because the workflow passes
`CLOUDFLARE_ACCOUNT_ID` explicitly rather than enumerating accounts.

The prebuilt "Edit Cloudflare Workers" template also works but grants KV,
Routes and Tail, none of which this Worker uses — it has no bindings at all.

Nothing else under a `worker` search applies: Workers CI is Cloudflare's own
build system, Observability and Tail are for reading logs, and the storage
permissions are for bindings this project does not have.

Secrets are safe in a public repository: they are encrypted, are never exposed
to pull requests from forks, and `workflow_dispatch` can only be triggered by
someone with write access.

**The bot token now exists in two places**, `.env` and GitHub. If it is ever
rotated, both need updating, or the workflow will keep using the dead one:

```bash
printf '%s' "<new token>" | gh secret set DISCORD_TOKEN
```

Use `printf`, not `echo` — a trailing newline becomes part of the stored value,
the same way it did with `DISCORD_PUBLIC_KEY`.

## Command scope, and why this stays guild-scoped

This bot is deliberately **not public**: `bot_public` is off, so only the
application owner can add it to a server. Anyone who wants their own copy is
expected to deploy this repository themselves, which is why the notation page
is served by the Worker rather than linked to a central one.

Commands are registered **per guild**, and should stay that way. Guild
registration is not a development-only compromise — for a bot living in one
server it is strictly better, because changes appear instantly where global
registration takes up to an hour to propagate.

```bash
npm run register          # guild-scoped: instant
npm run register:global   # every server the bot is in: up to ~1h
```

Global registration is only worth it if the bot joins several servers and you
tire of registering per guild. It has nothing to do with making the bot public
— that is the `bot_public` switch in the Developer Portal, and it is off.

To add the bot to another of your own servers, put that server's ID in
`DISCORD_GUILD_ID` and run `npm run register` again.

## Redeploying

Code change → `npm run deploy`.
Change to `src/commands.ts` (names, options, descriptions) → also
`npm run register`.

## Local loop (no deploy, no Discord)

```bash
npm run roll -- "2d6+3"                    # the parser and evaluator, straight
npm run dryh -- --pain 4 --exhaustion 2    # Don't Rest Your Head
npm test
npm run typecheck
npm run dev                                # wrangler dev, http://localhost:8787
```

`wrangler dev` runs the real Worker, but Discord cannot reach localhost and
every request must carry a valid Discord signature — so `curl` against it gets
`401`. To test against real Discord without deploying, tunnel it:

```bash
npx cloudflared tunnel --url http://localhost:8787
npm run endpoint -- https://<tunnel>.trycloudflare.com
```

Remember to point the endpoint back at the Worker afterwards.
