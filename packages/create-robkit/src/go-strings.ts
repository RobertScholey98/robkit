// The string literals in a Go file, for robkit check. It reads comments,
// rune literals and both kinds of string as Go does, so a quote inside one
// of them doesn't start a string. It doesn't check the file is valid Go:
// go vet does that.

/** A string literal's value, and the line and column, from 1, where it starts. */
export interface GoString {
  value: string;
  line: number;
  column: number;
}

/** What each one-letter escape in an interpreted string stands for. */
const simpleEscapes: Record<string, string> = {
  a: "\x07",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
  "\\": "\\",
  "'": "'",
  '"': '"',
};

/** How many hex digits follow each hex escape's letter. */
const hexDigits: Record<string, number> = { x: 2, u: 4, U: 8 };

/**
 * What the escape at `at` in `text` stands for, and how many characters
 * it takes. An escape Go would refuse stands for itself.
 */
function escapeAt(text: string, at: number): [string, number] {
  const letter = text.charAt(at + 1);
  const simple = simpleEscapes[letter];
  if (simple !== undefined) return [simple, 2];
  const digits = hexDigits[letter];
  if (digits !== undefined) {
    const hex = text.slice(at + 2, at + 2 + digits);
    if (/^[\da-f]+$/i.test(hex) && hex.length === digits) {
      const code = Number.parseInt(hex, 16);
      if (code <= 0x10ffff) return [String.fromCodePoint(code), 2 + digits];
    }
  }
  const octal = text.slice(at + 1, at + 4);
  if (/^[0-7]{3}$/.test(octal)) {
    return [String.fromCharCode(Number.parseInt(octal, 8)), 4];
  }
  return [text.slice(at, at + 2), 2];
}

/** Every string literal in `text`, a Go file, in order. */
export function goStringsIn(text: string): GoString[] {
  const found: GoString[] = [];
  let line = 1;
  let lineStart = 0;
  /** Moves past `text[from, to)`, counting the lines it ends. */
  const pass = (from: number, to: number): number => {
    for (let at = from; at < to; at++) {
      if (text[at] === "\n") {
        line++;
        lineStart = at + 1;
      }
    }
    return to;
  };
  /** Where `token` next occurs from `from`, or the end of the file. */
  const until = (token: string, from: number): number => {
    const at = text.indexOf(token, from);
    return at === -1 ? text.length : at;
  };

  let at = 0;
  while (at < text.length) {
    const char = text[at];
    const start = { line, column: at - lineStart + 1 };
    if (text.startsWith("//", at)) {
      at = until("\n", at);
    } else if (text.startsWith("/*", at)) {
      at = pass(at, Math.min(until("*/", at + 2) + 2, text.length));
    } else if (char === "`") {
      const end = until("`", at + 1);
      const value = text.slice(at + 1, end).replaceAll("\r", "");
      found.push({ value, ...start });
      at = pass(at, end + 1);
    } else if (char === '"' || char === "'") {
      // Neither kind ends past its line.
      let value = "";
      at++;
      while (at < text.length && text[at] !== char && text[at] !== "\n") {
        if (text[at] === "\\") {
          const [decoded, length] = escapeAt(text, at);
          value += decoded;
          at += length;
        } else {
          value += text.charAt(at);
          at++;
        }
      }
      if (char === '"') found.push({ value, ...start });
      if (text[at] === char) at++;
    } else {
      at = pass(at, at + 1);
    }
  }
  return found;
}
