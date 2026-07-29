import type { DieGroup, Entry, ProgramResult, RollResult } from './types.ts';

/** Discord hard-caps message content at 2000 characters. */
const MAX_CONTENT = 1900;

/**
 * Renders results as plain Discord markdown — no embeds.
 *
 *   `4d6kh3` → 4d6 [5, 4, 3, ~~1~~] = **12**
 */
export function formatProgram(result: ProgramResult): string {
  const header = result.comment ? [`**${result.comment}**`] : [];

  const full = [...header, ...result.rolls.map((roll) => formatRoll(roll, true))];
  if (length(full) <= MAX_CONTENT) return full.join('\n');

  // Too long: the answer matters more than the breakdown.
  const compact = [...header, ...result.rolls.map((roll) => formatRoll(roll, false))];
  if (length(compact) <= MAX_CONTENT) return compact.join('\n');

  return clip(compact);
}

/** Renders a single roll. Exported for tests and the local CLI. */
export function formatRoll(roll: RollResult, breakdown = true): string {
  const parts = [`\`${roll.notation}\``];

  if (breakdown && roll.groups.length > 0) {
    parts.push('→', roll.groups.map(formatGroup).join('  '));
  }
  parts.push('=', `**${formatTotal(roll)}**`);

  return parts.join(' ');
}

function formatTotal(roll: RollResult): string {
  switch (roll.kind) {
    case 'successes':
      return `${roll.total} ${roll.total === 1 ? 'success' : 'successes'}`;
    case 'symbols':
      return formatSymbols(roll.symbols ?? {});
    case 'number':
      // Fudge rolls read better signed: a +1 is not the same as a 1.
      // Zero stays bare — `+0` reads as a typo.
      return isFudgeOnly(roll) && roll.total > 0 ? `+${roll.total}` : String(roll.total);
  }
}

function formatSymbols(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'nothing';
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([symbol, count]) => `${symbol} ×${count}`)
    .join(', ');
}

function formatGroup(group: DieGroup): string {
  const faces = group.entries.map((entry, i) => {
    const face = renderFace(group, entry, i);
    const noted = entry.note ? `${face}${entry.note}` : face;
    return entry.kept ? noted : `~~${noted}~~`;
  });

  return `${group.notation} [${faces.join(', ')}]`;
}

function renderFace(group: DieGroup, entry: Entry, index: number): string {
  if (group.display === 'symbol') return group.symbols?.[index] ?? '?';
  if (group.display === 'fudge') return entry.value > 0 ? '+' : entry.value < 0 ? '-' : '0';
  return String(entry.value);
}

function isFudgeOnly(roll: RollResult): boolean {
  return roll.groups.length > 0 && roll.groups.every((group) => group.display === 'fudge');
}

function length(lines: string[]): number {
  return lines.join('\n').length;
}

/** Last resort: keep as many results as fit and say how many were cut. */
function clip(lines: string[]): string {
  const kept: string[] = [];
  let used = 0;

  for (const line of lines) {
    const notice = `\n_… ${lines.length - kept.length} more not shown_`;
    if (used + line.length + notice.length > MAX_CONTENT) break;
    kept.push(line);
    used += line.length + 1;
  }

  const dropped = lines.length - kept.length;
  return dropped === 0 ? kept.join('\n') : `${kept.join('\n')}\n_… ${dropped} more not shown_`;
}
