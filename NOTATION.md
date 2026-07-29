# Dice notation spec

The contract the parser implements. Settled with the user on 2026-07-29.
Everything here is decided; anything not here is still open.

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
a die — `d[1,1,2,3]` rolls 1 twice as often as 2.

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
| Dice rolled per request | 1000 | `DiceError` |
| Sides per die | 1,000,000 | `DiceError` |
| Faces in a `d[...]` list | 100 | `DiceError` |
| Expressions per request | 20 | `DiceError` |

Explosions and rerolls draw from the same 1000-dice budget, which is what stops
`d1!` from looping forever:

```
d1!  ->  ❌ Roll exceeded 1000 dice
```

Hitting a cap always errors. A roll is never silently truncated to a wrong
total.

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
