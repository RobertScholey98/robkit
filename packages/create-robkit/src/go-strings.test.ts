import { describe, expect, it } from "vitest";
import { goStringsIn } from "./go-strings.ts";

const values = (text: string) => goStringsIn(text).map((found) => found.value);

describe("goStringsIn", () => {
  it.each([
    [
      "one-letter escapes",
      String.raw`"\a\b\f\n\r\t\v\\\'\""`,
      "\x07\b\f\n\r\t\v\\'\"",
    ],
    ["hex escapes", String.raw`"\x72\u` + String.raw`006f\U0001F600"`, "ro😀"],
    ["octal escapes", String.raw`"\162\157"`, "ro"],
    [
      "an escape Go refuses, as written",
      String.raw`"\q\xZZ\U00110000"`,
      String.raw`\q\xZZ\U00110000`,
    ],
  ])("decodes %s", (_, text, value) => {
    expect(values(text)).toEqual([value]);
  });

  it("keeps a raw string as written, but its carriage returns", () => {
    expect(values("`a\\n\r\nb`")).toEqual(["a\\n\nb"]);
  });

  it("places each string by the line and column it starts at", () => {
    expect(goStringsIn('x := "a"\n/* "no"\n*/ y := `b\nc` + "d"\n')).toEqual([
      { value: "a", line: 1, column: 6 },
      { value: "b\nc", line: 3, column: 9 },
      { value: "d", line: 4, column: 6 },
    ]);
  });

  it("ends a string the file leaves open at its line or the file's end", () => {
    expect(values('"open\n"next"\n`raw')).toEqual(["open", "next", "raw"]);
  });

  it("finds nothing in a comment, even one the file leaves open", () => {
    expect(values('// "a line"\n/* "never closed')).toEqual([]);
  });
});
