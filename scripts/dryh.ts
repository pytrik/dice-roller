/**
 * Local Don't Rest Your Head CLI. Mirrors the /dryh option names so what you
 * try here is what you type in Discord.
 *
 *   npm run dryh -- --pain 4 --exhaustion 2
 *   npm run dryh -- --pain 4 --exhaustion 2 --madness 1 --comment "escape the ward"
 */
import { rollDryh } from '../src/dice/dryh.ts';
import { formatDryh } from '../src/dice/format.ts';
import { normalizeComment } from '../src/dice/sanitize.ts';
import { DiceError } from '../src/dice/types.ts';

const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
}

function pool(name: string, fallback?: number): number {
  const raw = flag(name);
  if (raw === undefined) {
    if (fallback !== undefined) return fallback;
    console.error(`Missing --${name}. Usage: npm run dryh -- --pain 4 --exhaustion 2`);
    process.exit(1);
  }
  return Number(raw);
}

try {
  console.log(
    formatDryh(
      rollDryh({
        pain: pool('pain'),
        exhaustion: pool('exhaustion'),
        madness: pool('madness', 0),
        discipline: pool('discipline', 3),
        comment: normalizeComment(flag('comment') ?? ''),
      }),
    ),
  );
} catch (error) {
  if (error instanceof DiceError) {
    console.error(`DiceError: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
