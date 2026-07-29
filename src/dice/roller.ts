import {
  DiceError,
  defaultRng,
  type DieGroup,
  type Node,
  type Rng,
  type RollResult,
} from './types.ts';

/**
 * Walks the AST, rolling dice as it goes, and returns the total plus every
 * group that was rolled so the reply can show a breakdown.
 */
export function evaluate(node: Node, rng: Rng = defaultRng): RollResult {
  const groups: DieGroup[] = [];
  const total = walk(node, rng, groups);
  return { total, groups };
}

function walk(node: Node, rng: Rng, groups: DieGroup[]): number {
  switch (node.kind) {
    case 'number':
      return node.value;

    case 'dice': {
      const faces: number[] = [];
      for (let i = 0; i < node.count; i++) faces.push(rollDie(node.sides, rng));
      groups.push({ notation: `${node.count}d${node.sides}`, faces });
      return faces.reduce((sum, face) => sum + face, 0);
    }

    case 'negate':
      return -walk(node.operand, rng, groups);

    case 'binary': {
      const left = walk(node.left, rng, groups);
      const right = walk(node.right, rng, groups);
      switch (node.op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          if (right === 0) throw new DiceError('Division by zero.');
          return left / right;
      }
    }
  }
}

/** Uniform integer in [1, sides]. */
function rollDie(sides: number, rng: Rng): number {
  return Math.floor(rng() * sides) + 1;
}
