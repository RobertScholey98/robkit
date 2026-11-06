import {
  isDomain,
  isProblem,
  isRecord,
  type InputProblem,
} from "@robkit/session/input";
import type { TrustedProxy } from "./deployment.ts";

/** Where the install deploys: `coolify.json` at its root. */
export interface CoolifyConfig {
  project: string;
  environment: string;
  server: string;
  /** The GitHub App Coolify builds the repository through. */
  githubApp: string;
  /** The install's repository, such as `owner/name`. */
  repository: string;
  branch: string;
  /** The domain the install answers on, such as `robkit.dev`. */
  domain: string;
  /** `cloudflare` when only a Cloudflare tunnel reaches the host. */
  trustedProxy?: TrustedProxy;
}

/** What each of coolify.json's settings holds, for a problem to name. */
const settings = {
  project: "the Coolify project's name",
  environment: "the project's environment, such as production",
  server: "the Coolify server's name, such as localhost",
  githubApp: "the GitHub App Coolify builds the repository through",
  repository: "the install's repository, such as owner/name",
  branch: "the branch to deploy, such as main",
  domain: "the domain the install answers on, such as robkit.dev",
} as const;

/** `coolify.json`, read from its parsed JSON. */
export function readCoolifyConfig(
  value: unknown,
): CoolifyConfig | InputProblem {
  if (!isRecord(value)) {
    return {
      error:
        "coolify.json must be a JSON object with project, environment, server, githubApp, repository, branch and domain. See docs/deploy.md.",
    };
  }
  const text = (key: keyof typeof settings): string | InputProblem => {
    const found = value[key];
    return typeof found === "string" && found !== ""
      ? found
      : {
          error: `coolify.json: ${key} must be a non-empty string: ${settings[key]}.`,
        };
  };
  const project = text("project");
  const environment = text("environment");
  const server = text("server");
  const githubApp = text("githubApp");
  const repository = text("repository");
  const branch = text("branch");
  const domain = text("domain");
  if (isProblem(project)) return project;
  if (isProblem(environment)) return environment;
  if (isProblem(server)) return server;
  if (isProblem(githubApp)) return githubApp;
  if (isProblem(repository)) return repository;
  if (isProblem(branch)) return branch;
  if (isProblem(domain)) return domain;
  if (!isDomain(domain)) {
    return {
      error: `coolify.json: domain is "${domain}", which isn't a domain. Set it to the domain the install answers on alone, such as robkit.dev.`,
    };
  }
  const { trustedProxy } = value;
  if (trustedProxy !== undefined && trustedProxy !== "cloudflare") {
    return {
      error:
        'coolify.json: trustedProxy must be "cloudflare", when only a Cloudflare tunnel reaches the host, or left out.',
    };
  }
  return {
    project,
    environment,
    server,
    githubApp,
    repository,
    branch,
    domain,
    ...(trustedProxy && { trustedProxy }),
  };
}
