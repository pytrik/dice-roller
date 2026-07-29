/**
 * Points the Discord application at the deployed Worker.
 *
 *   npm run endpoint -- https://dice-roller.<subdomain>.workers.dev
 *   npm run endpoint -- --clear
 *
 * This is the API equivalent of setting "Interactions Endpoint URL" in the
 * Developer Portal. Discord validates the URL by sending it a signed PING and
 * refuses to save if it does not get a valid PONG back, so the Worker must
 * already be deployed with DISCORD_PUBLIC_KEY set.
 */
// Structured as a function rather than top-level statements so failures can
// return: calling process.exit() while a fetch socket is still closing trips a
// libuv assertion on Windows.
async function main(): Promise<number> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.');
    return 1;
  }

  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npm run endpoint -- https://your-worker.workers.dev');
    return 1;
  }

  const url = arg === '--clear' ? null : arg;
  if (url !== null && !URL.canParse(url)) {
    console.error(`Not a valid URL: ${url}`);
    return 1;
  }

  const response = await fetch('https://discord.com/api/v10/applications/@me', {
    method: 'PATCH',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ interactions_endpoint_url: url }),
  });

  if (!response.ok) {
    console.error(`Failed: ${response.status} ${response.statusText}`);
    console.error(await response.text());
    console.error(
      '\nDiscord rejects the URL unless it answers its PING, and does not say why.\n' +
        'Check that the Worker is deployed, that DISCORD_PUBLIC_KEY is set on it,\n' +
        'and that the stored key has no trailing newline. See DEPLOY.md.',
    );
    return 1;
  }

  const app = (await response.json()) as { interactions_endpoint_url: string | null };
  console.log(`Interactions endpoint is now: ${app.interactions_endpoint_url ?? '(cleared)'}`);
  return 0;
}

process.exitCode = await main();

export {}; // top-level await needs this file to be a module
