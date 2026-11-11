import { describe, expect, it } from "vitest";
import { scramVerifier } from "./scram.ts";

describe("scramVerifier", () => {
  // Postgres 18 stored this for `create role pencil password 'pencil'`.
  // scram.db.test.ts checks the same against a live Postgres.
  it("is the verifier Postgres makes from the same password, salt and iteration count", () => {
    expect(
      scramVerifier(
        "pencil",
        Buffer.from("AfzI/MaEt5hM5c/jIQXOxg==", "base64"),
        4096,
      ),
    ).toBe(
      "SCRAM-SHA-256$4096:AfzI/MaEt5hM5c/jIQXOxg==$nx3CA2lTlpSrh8yZJVA0XT9cGkN51glPLtVW9PLm5b0=:kJQqCmM166CmMxbMK2rNytr6/it+L1OYMu6AFaeb89s=",
    );
  });

  it("salts with a fresh 16 bytes over 4096 iterations unless told otherwise", () => {
    const first = scramVerifier("pencil");
    const second = scramVerifier("pencil");

    expect(first).toMatch(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$/);
    expect(first.split("$")[1]).not.toBe(second.split("$")[1]);
  });
});
