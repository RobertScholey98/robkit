import postgres from "postgres";
import { afterAll, describe, expect, inject, it } from "vitest";
import { scramVerifier } from "./scram.ts";

const adminUrl = inject("adminUrl");
const admin = postgres(adminUrl, { max: 1, onnotice: () => undefined });

afterAll(async () => {
  await admin.end();
});

describe("scramVerifier", () => {
  it.each([
    ["scramhex", "5c693a1b5df2ff9abbcbe9142b079cd6e490c362f4f7876c"],
    ["scramwords", "correct horse battery staple"],
  ])(
    "is what Postgres stores for %s's password, from its salt and iteration count",
    async (role, password) => {
      // Postgres works the verifier out itself from a password in plain text.
      await admin.unsafe(`create role ${role} login password '${password}'`);
      const [{ stored } = { stored: "" }] = await admin<{ stored: string }[]>`
        select rolpassword as stored from pg_authid where rolname = ${role}`;
      const [, iterations, salt] =
        /^SCRAM-SHA-256\$(\d+):([^$]+)\$/.exec(stored) ?? [];

      expect(
        scramVerifier(
          password,
          Buffer.from(salt ?? "", "base64"),
          Number(iterations),
        ),
      ).toBe(stored);
    },
  );

  it("gives a role a password it signs in with", async () => {
    await admin.unsafe(
      `create role scramlogin login password '${scramVerifier("pencil")}'`,
    );
    const url = new URL(adminUrl);
    url.username = "scramlogin";
    url.password = "pencil";
    const app = postgres(url.href, { max: 1 });
    try {
      expect(await app`select current_user as role`).toEqual([
        { role: "scramlogin" },
      ]);
    } finally {
      await app.end();
    }
  });
});
