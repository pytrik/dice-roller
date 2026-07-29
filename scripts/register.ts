/**
 * Uploads the slash-command definitions to Discord.
 *
 *   npm run register            → guild-scoped, updates instantly (development)
 *   npm run register:global     → global, up to ~1h to propagate (production)
 *
 * Reads DISCORD_TOKEN / DISCORD_APPLICATION_ID / DISCORD_GUILD_ID from .env.
 */
import { COMMANDS } from '../src/commands.ts';

const token = requireEnv('DISCORD_TOKEN');
const applicationId = requireEnv('DISCORD_APPLICATION_ID');
const global = process.argv.includes('--global');

const url = global
  ? `https://discord.com/api/v10/applications/${applicationId}/commands`
  : `https://discord.com/api/v10/applications/${applicationId}/guilds/${requireEnv('DISCORD_GUILD_ID')}/commands`;

const response = await fetch(url, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(COMMANDS),
});

if (!response.ok) {
  console.error(`Registration failed: ${response.status} ${response.statusText}`);
  console.error(await response.text());
  process.exit(1);
}

const registered = (await response.json()) as Array<{ name: string }>;
console.log(
  `Registered ${registered.length} ${global ? 'global' : 'guild'} command(s): ` +
    registered.map((c) => `/${c.name}`).join(', '),
);
if (global) console.log('Global commands can take up to an hour to appear.');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}
