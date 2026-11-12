// A small hash router: each screen has an address like #/sign-up or
// #/characters/{id}, so links, the back button and home-screen launches all
// work without a server, offline too.

import { useEffect, useState } from "react";

/** Screens whose address is just their name, e.g. #/titles. */
const SIMPLE = ["sign-in", "sign-up", "privacy", "account", "characters", "titles"] as const;

export type Route =
  | { screen: (typeof SIMPLE)[number] | "new-character" }
  | { screen: "character"; id: string }
  | { screen: "help"; page?: string };

/** The address of a screen: href("characters/abc") is "#/characters/abc". */
export const href = (path: string): string => `#/${path}`;

/** The screen an address names, or null for the start screen. */
export function parseRoute(hash: string): Route | null {
  const parts = hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const [first, second, ...rest] = parts;
  if (rest.length > 0) return null;
  if (first === "characters" && second === "new") return { screen: "new-character" };
  if (first === "characters" && second) return { screen: "character", id: second };
  if (first === "help") return second ? { screen: "help", page: second } : { screen: "help" };
  if (second === undefined && (SIMPLE as readonly string[]).includes(first ?? "")) {
    return { screen: first as (typeof SIMPLE)[number] };
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
