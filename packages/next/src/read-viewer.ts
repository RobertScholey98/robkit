import { readCodeId, readRoleIds, type Viewer } from "@robkit/guard";
import { isProblem, isRecord, problem, type InputProblem } from "@robkit/input";

/** `value` as a viewer: the owner, a guest with role ids, or nobody. */
export function readViewer(value: unknown): Viewer | InputProblem {
  const wrong = problem(
    `${value === undefined ? "Nothing" : JSON.stringify(value)} isn't a viewer, such as {"kind": "nobody"}.`,
  );
  if (!isRecord(value)) return wrong;
  switch (value.kind) {
    case "nobody":
      return { kind: "nobody" };
    case "owner":
      return typeof value.id === "string" && value.id !== ""
        ? { kind: "owner", id: value.id }
        : wrong;
    case "guest": {
      const id = readCodeId(value.id);
      const roles = readRoleIds(value.roles);
      return isProblem(id) || isProblem(roles)
        ? wrong
        : { kind: "guest", id, roles };
    }
    default:
      return wrong;
  }
}
