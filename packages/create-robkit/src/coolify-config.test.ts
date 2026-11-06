import { describe, expect, it } from "vitest";
import { readCoolifyConfig, type CoolifyConfig } from "./coolify-config.ts";

const config: CoolifyConfig = {
  project: "robkit",
  environment: "production",
  server: "localhost",
  githubApp: "robkit-coolify",
  repository: "RobertScholey98/robkit-dev",
  branch: "main",
  domain: "robkit.dev",
};

describe("readCoolifyConfig", () => {
  it("reads where the install deploys", () => {
    expect(readCoolifyConfig(config)).toEqual(config);
  });

  it("reads a trusted proxy when the install sits behind Cloudflare", () => {
    expect(
      readCoolifyConfig({ ...config, trustedProxy: "cloudflare" }),
    ).toEqual({ ...config, trustedProxy: "cloudflare" });
  });

  it.each([null, [], "robkit"])("refuses %j", (value) => {
    expect(readCoolifyConfig(value)).toEqual({
      error:
        "coolify.json must be a JSON object with project, environment, server, githubApp, repository, branch and domain. See docs/deploy.md.",
    });
  });

  it.each([
    [
      "githubApp",
      undefined,
      "the GitHub App Coolify builds the repository through",
    ],
    ["githubApp", "", "the GitHub App Coolify builds the repository through"],
    ["branch", 1, "the branch to deploy, such as main"],
    ["project", null, "the Coolify project's name"],
    ["environment", "", "the project's environment, such as production"],
    ["server", "", "the Coolify server's name, such as localhost"],
    ["repository", "", "the install's repository, such as owner/name"],
    ["domain", "", "the domain the install answers on, such as robkit.dev"],
  ])("names %s when it is %j", (key, value, what) => {
    expect(readCoolifyConfig({ ...config, [key]: value })).toEqual({
      error: `coolify.json: ${key} must be a non-empty string: ${what}.`,
    });
  });

  it("refuses a domain with a scheme", () => {
    expect(
      readCoolifyConfig({ ...config, domain: "https://robkit.dev" }),
    ).toEqual({
      error: `coolify.json: domain is "https://robkit.dev", which isn't a domain. Set it to the domain the install answers on alone, such as robkit.dev.`,
    });
  });

  it("refuses a trusted proxy it doesn't know", () => {
    expect(readCoolifyConfig({ ...config, trustedProxy: "traefik" })).toEqual({
      error:
        'coolify.json: trustedProxy must be "cloudflare", when only a Cloudflare tunnel reaches the host, or left out.',
    });
  });
});
