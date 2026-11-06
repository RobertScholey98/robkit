import { orThrow, readCoreUrl, type CoreOrigin } from "@robkit/input";

/** `url` read as core's origin, for a test that names one. */
export function coreOrigin(url: string): CoreOrigin {
  return orThrow(readCoreUrl({ ROBKIT_CORE_URL: url }));
}
