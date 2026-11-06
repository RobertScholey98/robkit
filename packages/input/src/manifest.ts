// The manifest format: what an app declares about itself in its
// package.json's `robkit` field, and how the install hands that to core in
// `ROBKIT_APPS`. See docs/conventions/input.md.

import { readSlug, type Slug } from "./slug.ts";
import { isProblem, isRecord, type InputProblem } from "./problem.ts";

/**
 * Who may open an app, as its manifest declares it. A rule's roles are
 * named, not ids, so this isn't the guard's `AccessRule`: core finds or
 * creates each role by name when it adds the app.
 */
export type DeclaredAccess =
  { kind: "open" } | { kind: "owner" } | { kind: "roles"; roleNames: string[] };

/** What an app's manifest declares in its `robkit` field, for core's catalog. */
export interface AppDeclaration {
  /** Who may open the app once core adds it. Owner-only if left out. */
  access?: DeclaredAccess;
  /** An emoji the launcher shows. */
  icon?: string;
}

/** An app as the install declares it to core, in `ROBKIT_APPS`. */
export interface DeclaredApp extends AppDeclaration {
  slug: Slug;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
// A whole emoji: one code point, or a sequence such as a flag, a keycap or
// a family joined with zero-width joiners, as Unicode lists them.
const emoji = /^\p{RGI_Emoji}$/v;

/** Whether `text` is one emoji: one grapheme, and that grapheme an emoji. */
function isOneEmoji(text: string): boolean {
  const [first, ...rest] = graphemes.segment(text);
  return first !== undefined && rest.length === 0 && emoji.test(first.segment);
}

function readDeclaredAccess(value: unknown): DeclaredAccess | undefined {
  if (!isRecord(value)) return undefined;
  const { kind, roles } = value;
  if (kind === "open" || kind === "owner") return { kind };
  if (kind !== "roles" || !Array.isArray(roles)) return undefined;
  const roleNames = roles.filter(
    (name): name is string => typeof name === "string" && name !== "",
  );
  return roleNames.length > 0 && roleNames.length === roles.length
    ? { kind: "roles", roleNames }
    : undefined;
}

/**
 * What an app declares, from its manifest's `robkit` field. `field` is
 * where the value sits, which each problem names.
 */
export function readAppDeclaration(
  value: unknown,
  field = "robkit",
): AppDeclaration | InputProblem {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    return {
      error: `${field} must be an object, such as {"access": {"kind": "open"}, "icon": "📝"}, or left out.`,
    };
  }
  const declares: AppDeclaration = {};
  if (value.access !== undefined) {
    const access = readDeclaredAccess(value.access);
    if (!access) {
      return {
        error: `${field}.access must be {"kind": "open"}, {"kind": "owner"}, or {"kind": "roles", "roles": ["Family"]} naming at least one role.`,
      };
    }
    declares.access = access;
  }
  if (value.icon !== undefined) {
    const { icon } = value;
    if (typeof icon !== "string" || !isOneEmoji(icon)) {
      return { error: `${field}.icon must be one emoji, such as "📝".` };
    }
    declares.icon = icon;
  }
  return declares;
}

/** What an app declares, as its manifest and `ROBKIT_APPS` write it. */
export function appDeclarationJson({
  access,
  icon,
}: AppDeclaration): Record<string, unknown> {
  return {
    ...(access && {
      access:
        access.kind === "roles"
          ? { kind: "roles", roles: access.roleNames }
          : { kind: access.kind },
    }),
    ...(icon !== undefined && { icon }),
  };
}

/** One app in `ROBKIT_APPS`, whose place `field` names. */
export function readDeclaredApp(
  value: unknown,
  field: string,
): DeclaredApp | InputProblem {
  if (!isRecord(value)) {
    return {
      error: `${field} must be an object with the app's slug, such as {"slug": "notes"}.`,
    };
  }
  const slug = readSlug(value.slug);
  if (isProblem(slug)) {
    return { error: `${field}.slug: ${slug.error}` };
  }
  const declares = readAppDeclaration(value, field);
  return isProblem(declares) ? declares : { slug, ...declares };
}
