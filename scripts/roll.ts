/**
 * Local dice CLI — drives the parser and evaluator with no Discord involved.
 * The fastest iteration loop while designing notation.
 *
 *   npm run roll -- "2d6+3"
 *   npm run roll -- "2d6+3" --times 5
 */
import { formatResult } from '../src/dice/format.ts';
import { parse } from '../src/dice/parser.ts';
import { evaluate } from '../src/dice/roller.ts';
import { DiceError } from '../src/dice/types.ts';

const args = process.argv.slice(2);
const timesFlag = args.indexOf('--times');
const times = timesFlag === -1 ? 1 : Number(args[timesFlag + 1] ?? 1);
const notation = args
  .filter((a, i) => !a.startsWith('--') && (timesFlag === -1 || i !== timesFlag + 1))
  .join(' ');

if (!notation) {
  console.error('Usage: npm run roll -- "2d6+3" [--times N]');
  process.exit(1);
}

try {
  const node = parse(notation);
  if (args.includes('--ast')) console.log(JSON.stringify(node, null, 2));
  for (let i = 0; i < times; i++) {
    console.log(formatResult(notation, evaluate(node)));
  }
} catch (error) {
  if (error instanceof DiceError) {
    console.error(`DiceError: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
