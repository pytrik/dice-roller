/**
 * Local dice CLI — drives the parser and evaluator with no Discord involved.
 * The fastest iteration loop while working on notation.
 *
 *   npm run roll -- "2d6+3"
 *   npm run roll -- "3x 4d6kh3 # stats"
 *   npm run roll -- "5(d5+2)kh2" --ast
 */
import { formatProgram } from '../src/dice/format.ts';
import { parseProgram } from '../src/dice/parser.ts';
import { rollProgram } from '../src/dice/roller.ts';
import { DiceError } from '../src/dice/types.ts';

const args = process.argv.slice(2);
const showAst = args.includes('--ast');
const input = args.filter((arg) => !arg.startsWith('--')).join(' ');

if (!input) {
  console.error('Usage: npm run roll -- "2d6+3" [--ast]');
  process.exit(1);
}

try {
  const program = parseProgram(input);
  if (showAst) console.log(JSON.stringify(program, null, 2));
  console.log(formatProgram(rollProgram(program)));
} catch (error) {
  if (error instanceof DiceError) {
    console.error(`DiceError: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
