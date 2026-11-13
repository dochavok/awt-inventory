// A small hash router: each screen has an address like #/sign-up or
// #/characters/{id}, so links, the back button and home-screen launches all
// work without a server, offline too.

import { useEffect, useState } from "react";
import { REPORT_KINDS, type ReportKind } from "../data/types";
import { ITEM_CATEGORIES, type ItemCategory } from "../rules/types";

/** Screens whose address is just their name, e.g. #/titles. */
const SIMPLE = ["sign-in", "sign-up", "privacy", "account", "characters", "titles"] as const;

export type Route =
  | { screen: (typeof SIMPLE)[number] | "new-character" }
  | { screen: "character" | "skills" | "history"; id: string }
  | { screen: "category"; id: string; category: ItemCategory }
  | { screen: "entry"; id: string; entryId: string }
  | { screen: "help"; page?: string }
  /** Search one character (SE-1), or all of them when there's no `id` (SE-2). */
  | { screen: "search"; id?: string }
  /** The printable sheet and the JSON export (EX), with `id` as the character chosen. */
  | { screen: "export"; id?: string }
  | { screen: "report"; kind?: ReportKind };

/** The address of a screen: href("characters/abc") is "#/characters/abc". */
export const href = (path: string): string => `#/${path}`;

/**
 * A part of an address, decoded. One with a broken "%" escape, or that would
 * decode to a "/" (which would split an ID), is kept as written.
 */
function decodePart(part: string): string {
  try {
    const decoded = decodeURIComponent(part);
    return decoded.includes("/") ? part : decoded;
  } catch {
    return part;
  }
}

/** The screen an address names, or null for the start screen. */
export function parseRoute(hash: string): Route | null {
  const parts = hash.replace(/^#\/?/, "").split("/").map(decodePart);
  const [first, second, third, fourth, ...rest] = parts;
  if (rest.length > 0) return null;
  if (first === "characters" && second) return characterRoute(second, third, fourth);
  if (third !== undefined) return null;
  if (first === "help") return second ? { screen: "help", page: second } : { screen: "help" };
  if (first === "export") return second ? { screen: "export", id: second } : { screen: "export" };
  if (first === "search" && second === undefined) return { screen: "search" };
  if (first === "report") {
    if (second === undefined) return { screen: "report" };
    return (REPORT_KINDS as readonly string[]).includes(second)
      ? { screen: "report", kind: second as ReportKind }
      : null;
  }
  if (second === undefined && (SIMPLE as readonly string[]).includes(first ?? "")) {
    return { screen: first as (typeof SIMPLE)[number] };
  }
  return null;
}

/** #/characters/{id}, and a character's own screens under it. */
function characterRoute(id: string, part?: string, entryId?: string): Route | null {
  if (part === undefined) return id === "new" ? { screen: "new-character" } : { screen: "character", id };
  if (id === "new") return null;
  if (part === "entries") return entryId ? { screen: "entry", id, entryId } : null;
  if (entryId !== undefined) return null;
  if (part === "skills" || part === "history" || part === "search") return { screen: part, id };
  if ((ITEM_CATEGORIES as readonly string[]).includes(part)) {
    return { screen: "category", id, category: part as ItemCategory };
  }
  return null;
}

export function useRoute(): Route | null {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const update = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}

export function go(path: string): void {
  window.location.hash = href(path);
}
