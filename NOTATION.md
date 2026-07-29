# Dice notation

Everything on this page works. `src/dice/spec.test.ts` rolls every example
below, so the page and the parser cannot drift apart without failing the test
suite.

This is also the specification: it is what the parser is written against, and
what to change first when adding notation.

## Quick tour

```
1d20+5                     ordinary roll
3d12 + 1d10 + 5(d5+2)kh2   mixed terms
4d6kh3                     keep the highest 3 of 4
5d10>=7f1                  success pool with botches
4dF                        Fudge dice
d[sword,shield,blank]      symbol dice
3x 1d20+5                  roll it three times, three results
1d20+5, 2d6+3              two independent rolls
1d20+5 # perception        labelled roll
```

## Dice terms

`NdS` — roll `N` dice of `S` sides. `N` defaults to 1, so `d20` == `1d20`.

A die is a uniform pick from a contiguous range. A negative side count mirrors
the positive range. Sides must be whole numbers — no fractional dice.

| Term | Yields |
| --- | --- |
| `d0` | `0`, always |
| `d1` | `1` |
| `d6` | `1..6` |
| `d-6` | `-6..-1` |
| `d-100` | `-100..-1` |
| `d%` | `1..100` (shorthand for `d100`) |
| `dF` | `-1`, `0`, `+1` (Fudge/FATE) |
| `d[1,1,2,3]` | one of the listed numbers |
| `d[sword,shield,blank]` | one of the listed symbols |

### Custom faces

`d[...]` takes a comma-separated face list. Repeated entries are how you weight
a die — `d[1,1,2,3]` rolls 1 twice as often as 2. Face names may use letters,
numbers, spaces and `-_'+`; see "Untrusted text" below for why.

- **All faces numeric** → behaves like any other die. Sums, and accepts every
  modifier.
- **Any face non-numeric** → symbolic. Results are tallied by symbol, not
  summed. Arithmetic and modifiers on a symbolic die are a `DiceError`.

```
4dF                   -> 4dF [+, -, 0, +] = **+1**
4d[sword,shield,blank]
                      -> sword x2, blank x1, shield x1
```

## Arithmetic

```
+   -   *   /   //   /~
```

| Operator | Meaning |
| --- | --- |
| `/` | divide, round **down** |
| `//` | divide, round **up** |
| `/~` | divide, round to **nearest** (halves round up) |

Division by zero is a `DiceError`. Totals are always integers.

Precedence, loosest to tightest: `+ -` → `* / // /~` → unary `-` → modifiers.
Parentheses override it.

## Repetition vs multiplication

These are **different operations**:

```
5(d4+1)     roll d4+1 five times and sum      == 5d4+5
5*(d4+1)    roll d4+1 once, multiply by 5
```

An integer directly against `(` is repetition. An explicit `*` is arithmetic.

Repetition produces a **list of group results**, which is why modifiers work on
it the same way they work on dice faces:

```
5d4kh2        keep the highest 2 faces
5(d4)kh2      keep the highest 2 group results
5(d5+2)kh2    roll d5+2 five times, keep the best two, sum them
```

This is the core idea of the AST: a dice term and a repetition group both
produce a list of values, and every modifier consumes a list.

## Modifiers

Modifiers attach to any list-producing term and **stack left to right** —
`4d6r1kh3` rerolls the 1s first, then keeps the highest 3 of the result.

### Keep and drop

| Syntax | Meaning |
| --- | --- |
| `kh N` | keep the highest `N` |
| `kl N` | keep the lowest `N` |
| `dh N` | drop the highest `N` |
| `dl N` | drop the lowest `N` |

`N` defaults to 1, so `2d20kh` is advantage. Dropped values still show in the
breakdown, struck through.

### Exploding

A die at its trigger value rolls again.

| Syntax | Meaning |
| --- | --- |
| `!` | standard — the extra die is added as its own die |
| `!!` | compounding — extras merge into the triggering die |
| `!p` | penetrating — each extra die takes a `-1` |

The trigger defaults to the die's maximum, or set it with a comparison:
`d6!>4` explodes on 5 and 6, `d6!=1` explodes on 1.

### Rerolls

| Syntax | Meaning |
| --- | --- |
| `r C` | reroll while the condition holds (capped) |
| `ro C` | reroll **once** |

`C` is a bare number or a comparison: `r1`, `ro<3`, `r<=2`.

### Success pools

A comparison turns a term into a **success count** instead of a sum.

| Syntax | Meaning |
| --- | --- |
| `>N` `>=N` `<N` `<=N` `=N` | each matching die is one success |
| `fC` | each die matching `C` **subtracts** a success |

```
5d10>=7      successes at 7 or higher
5d10>=7f1    ... and each 1 cancels a success (World of Darkness)
```

## Command-level syntax

| Syntax | Meaning |
| --- | --- |
| `3x <expr>` | roll `<expr>` three times, report each separately |
| `<expr>, <expr>` | independent expressions in one message |
| `<expr> # text` | trailing label, echoed in the output |

A `3x` prefix applies only to the expression it precedes. The comment runs to
the end of the input.

```
3x 1d20+5 # initiative
1d20+7, 2d6+4 # attack and damage
```

## Limits

Rolls are bounded so a runaway expression cannot hang the Worker or blow past
Discord's 2000-character message limit.

| Limit | Value | On breach |
| --- | --- | --- |
| Input length | 500 characters | `DiceError` |
| Dice rolled per request | 1000 | `DiceError` |
| Evaluation steps per request | 100,000 | `DiceError` |
| Bracket / repetition nesting | 16 levels | `DiceError` |
| Sides per die | 1,000,000 | `DiceError` |
| Faces in a `d[...]` list | 100 | `DiceError` |
| Length of one face name | 24 characters | `DiceError` |
| Expressions per request | 20 | `DiceError` |
| Comment length | 200 characters | truncated |

Explosions and rerolls draw from the same 1000-dice budget, which is what stops
`d1!` from looping forever:

```
d1!  ->  ❌ Roll exceeded 1000 dice
```

Hitting a cap always errors. A roll is never silently truncated to a wrong
total.

The **step** limit exists because the dice budget cannot see every kind of
expensive roll. `100(100(100(100(1))))` rolls no dice whatsoever, yet costs
around 10^8 evaluations — roughly ninety times the Worker's CPU allowance.
Counting evaluation work, not just dice, is what bounds it.

The **nesting** limit exists because the parser and the evaluator both recurse
once per level. Without it a long run of `(` overflows the stack, and a
`RangeError` is not a `DiceError`, so it would reach the user as "something
went wrong" rather than as advice.

## Don't Rest Your Head (`/dryh`)

Its own command rather than notation — the pools are system-specific and would
be clutter in a general parser.

```
/dryh pain:4 exhaustion:2 madness:1 discipline:3 comment:"escape the ward"
```

| Option | Required | Default |
| --- | --- | --- |
| `pain` | yes | — |
| `exhaustion` | yes | — |
| `madness` | no | 0 |
| `discipline` | no | 3 |
| `comment` | no | — |
| `private` | no | false |

Each pool is 0–6 d6. `discipline` defaults to 3 because the rules fix it there,
and `madness` to 0 because not spending is the safe default. `exhaustion` is
required despite having an obvious default: it changes constantly in play, and
a forgotten value that silently rolls 1 produces a wrong answer that looks
right.

**Rules.** Every die showing **1–3** is a success. Discipline, Exhaustion and
Madness are counted together and compared against Pain. The **dominant** pool
is the one holding the highest single *successful* die.

**Two tie-breaks are ours, not the book's**, and are open to correction:

- **Successes tie → Pain wins.** The player must exceed Pain, not match it.
- **Dominance tie → the more dangerous pool wins**, in the order
  Pain > Madness > Exhaustion > Discipline. Domination is meant to cost
  something, so this errs towards consequence.

If nothing succeeded anywhere, no pool dominates and the output says so.

```
**escape the ward**
Discipline [2, ~~5~~, 1] → **2 successes**
Exhaustion [3, ~~6~~] → **1 success**
Madness [1] → **1 success**
Pain [2, ~~4~~, 3, ~~6~~] → **2 successes**

**Success** — you 4, Pain 2 · dominant: **Pain**
```

Struck-through dice are the ones that missed, matching how `/roll` marks dice
that did not count. Pools with no dice are left out of the breakdown; the
summary line still accounts for them.

## Untrusted text

Face names and comments are the only free text in the notation, and both are
echoed back into a message the bot sends.

- **Face names** accept letters, numbers, spaces, and `-`, `_`, `'`, `+`.
  Anything else is rejected. This is the one place a character allowlist is
  worth more than the grammar, because the grammar has no opinion about what
  makes a good face name.
- **Comments** stay free-form, but markdown characters in them are escaped so a
  comment renders as text rather than as formatting.
- **Invisible characters** — C0/C1 controls, zero-width characters and the bidi
  overrides — are stripped from all input. A right-to-left override could
  otherwise make a roll display as something it is not.
- **Mentions never ping.** Every response sets `allowed_mentions` to an empty
  parse list, so `@everyone` in a comment is inert text. This is enforced on the
  response rather than by filtering the text, which is why no mention-stripping
  appears in the notation rules.

## Output

Plain text with a full breakdown. No embeds.

```
`4d6kh3` → 4d6 [5, 4, 3, ~~1~~] = **12**
`5d10>=7f1` → 5d10 [9, 7, 4, 1, 2] = **1 success**
`4dF` → 4dF [+, -, 0, +] = **+1**
```

When a breakdown would exceed the message limit, the breakdown is dropped and
the total is kept.

## Errors

Anything the user can fix by retyping is a `DiceError`, and its message is
shown to them in an ephemeral reply. Everything else is logged and becomes a
generic message.
