/**
 * Character-level cursor over the input.
 *
 * The grammar is context-sensitive — `d` starts a dice term but `dl` is the
 * drop-lowest modifier, and `>` is a success test unless it directly follows
 * `!`, where it is an explosion trigger. A separate token stream would have to
 * guess; letting the parser ask "is a modifier next?" at each point does not.
 */
export class Scanner {
  pos = 0;
  readonly text: string;

  // Written out rather than as a parameter property: Node strips types without
  // transforming, so `constructor(readonly text: string)` will not run.
  constructor(text: string) {
    this.text = text;
  }

  /** Skips whitespace. Called before every token match. */
  skipSpace(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos]!)) this.pos++;
  }

  atEnd(): boolean {
    this.skipSpace();
    return this.pos >= this.text.length;
  }

  /** Consumes `literal` if it is next (after whitespace). */
  eat(literal: string): boolean {
    this.skipSpace();
    if (!this.text.startsWith(literal, this.pos)) return false;
    this.pos += literal.length;
    return true;
  }

  /** Consumes `literal` only if it is next with NO whitespace in between. */
  eatTight(literal: string): boolean {
    if (!this.text.startsWith(literal, this.pos)) return false;
    this.pos += literal.length;
    return true;
  }

  /** Consumes the first of `literals` that matches. Order matters: pass
   *  longer alternatives first so `//` is not read as `/` followed by `/`. */
  eatAny<T extends string>(literals: readonly T[]): T | null {
    this.skipSpace();
    for (const literal of literals) {
      if (this.text.startsWith(literal, this.pos)) {
        this.pos += literal.length;
        return literal;
      }
    }
    return null;
  }

  /** Looks ahead without consuming. */
  peek(literal: string): boolean {
    this.skipSpace();
    return this.text.startsWith(literal, this.pos);
  }

  /** Matches a sticky regex at the cursor and consumes what it matched. */
  match(pattern: RegExp): string | null {
    this.skipSpace();
    const sticky = new RegExp(pattern.source, pattern.flags.includes('y') ? pattern.flags : `${pattern.flags}y`);
    sticky.lastIndex = this.pos;
    const found = sticky.exec(this.text);
    if (!found) return null;
    this.pos = sticky.lastIndex;
    return found[0];
  }

  /** A run of digits. */
  integer(): number | null {
    const digits = this.match(/\d+/);
    return digits === null ? null : Number(digits);
  }

  /** Everything consumed between `start` and the cursor, trimmed. */
  since(start: number): string {
    return this.text.slice(start, this.pos).trim();
  }

  /** What is left, for error messages. */
  rest(): string {
    return this.text.slice(this.pos).trim();
  }
}
