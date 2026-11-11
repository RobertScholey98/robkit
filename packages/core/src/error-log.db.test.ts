import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { claim, freshCore, postJson, withSession } from "./test/fresh-app.ts";
import { printedLog } from "./test/printed-log.ts";

// Each test makes core's own database fail inside Postgres, then reads
// core's log as the console prints it, stack and causes included.

const typedCode = "SECRETCODE42";

describe("core's log of a database fault", () => {
  it("holds the query and its SQLSTATE but not the code a guest typed at /login/code", async () => {
    const log = printedLog();
    const { app, db } = await freshCore();
    await claim(app);
    // Postgres's own message for this fault quotes the value it was sent.
    await db.execute(sql`
      alter table core.access_codes drop constraint access_codes_code_shape
    `);
    await db.execute(sql`
      alter table core.access_codes
        alter column code type uuid using gen_random_uuid()
    `);

    const res = await postJson(app, "/login/code", {
      code: typedCode.toLowerCase(),
    });

    expect(res.status).toBe(500);
    const printed = log();
    expect(printed).toMatch(
      /^POST \/login\/code failed \(request [0-9a-f-]{36}\)\.$/m,
    );
    expect(printed).toContain('"access_codes"."code" = $1');
    expect(printed).toContain("code: '22P02'");
    expect(printed.toUpperCase()).not.toContain(typedCode);
  });

  it("holds the constraint's name but none of the row a new code broke it with at POST /codes", async () => {
    const log = printedLog();
    const { app, db } = await freshCore();
    const owner = await claim(app);
    await db.execute(sql`
      alter table core.access_codes
        add constraint no_new_codes check (false) not valid
    `);

    const res = await postJson(
      app,
      "/codes",
      { name: "Grandma Moss", code: typedCode },
      withSession(owner),
    );

    expect(res.status).toBe(500);
    const printed = log();
    expect(printed).toContain('insert into "core"."access_codes"');
    expect(printed).toContain("code: '23514'");
    expect(printed).toContain("constraint_name: 'no_new_codes'");
    expect(printed).not.toContain(typedCode);
    expect(printed).not.toContain("Grandma Moss");
    expect(printed).not.toContain("Failing row");
  });

  it("holds no password hash from a fault at /setup", async () => {
    const log = printedLog();
    const { app, db } = await freshCore();
    await db.execute(sql`
      alter table core.owner add constraint no_owner check (false) not valid
    `);

    const res = await postJson(app, "/setup", {
      username: "rob",
      password: "correct horse battery",
    });

    expect(res.status).toBe(500);
    const printed = log();
    expect(printed).toContain('insert into "core"."owner"');
    expect(printed).toContain("constraint_name: 'no_owner'");
    expect(printed).not.toContain("scrypt$");
    expect(printed).not.toContain("correct horse battery");
  });
});
