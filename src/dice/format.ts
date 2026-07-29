import type { RollResult } from './types.ts';

/** Discord hard-caps message content at 2000 characters. */
const MAX_CONTENT = 1900;

/**
 * Renders a result as Discord markdown, e.g.
 *   `2d6+3` → 2d6 [4, 6] = **13**
 */
export function formatResult(notation: string, result: RollResult): string {
  const breakdown = result.groups
    .map((g) => {
      const kept = g.faces.join(', ');
      const dropped = g.discarded?.length ? ` ~~${g.discarded.join(', ')}~~` : '';
      return `${g.notation} [${kept}${dropped}]`;
    })
    .join('  ');

  const total = formatNumber(result.total);
  const line = breakdown
    ? `\`${notation}\` → ${breakdown} = **${total}**`
    : `\`${notation}\` = **${total}**`;

  return truncate(line, total);
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Drops the breakdown rather than the answer when a roll gets huge. */
function truncate(line: string, total: string): string {
  if (line.length <= MAX_CONTENT) return line;
  return `Result: **${total}**\n_(breakdown too long to display)_`;
}
