import { describe, expectTypeOf, it } from "vitest";
import {
  readCoreUrl,
  readDevServerEnv,
  readDomain,
  readGuardEnv,
  type CoreOrigin,
  type Domain,
  type InputProblem,
  type Slug,
} from "./index.ts";

const origin = (value: CoreOrigin) => value;
const domain = (value: Domain) => value;

describe("the checked addresses", () => {
  it("are made only by their readers", () => {
    expectTypeOf(readCoreUrl).returns.toEqualTypeOf<
      CoreOrigin | InputProblem
    >();
    expectTypeOf(readDomain).returns.toEqualTypeOf<Domain | InputProblem>();
    // @ts-expect-error A plain string hasn't been read as core's origin.
    origin("https://core.robkit.dev");
    // @ts-expect-error Nor as a domain.
    domain("robkit.dev");
  });

  it("are still strings", () => {
    expectTypeOf<CoreOrigin>().toExtend<string>();
    expectTypeOf<Domain>().toExtend<string>();
  });

  it("come checked from the app's environment", () => {
    expectTypeOf(readGuardEnv).returns.toEqualTypeOf<
      { app: Slug; core: CoreOrigin } | InputProblem
    >();
    expectTypeOf(readDevServerEnv).returns.toEqualTypeOf<
      { port?: number; domain?: Domain } | InputProblem
    >();
  });
});
