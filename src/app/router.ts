// A small hash router: each screen has an address like #/sign-up, so links,
// the back button and home-screen launches all work without a server.

import { useEffect, useState } from "react";

export type Route = "sign-in" | "sign-up" | "privacy" | "account";

const ROUTES: readonly Route[] = ["sign-in", "sign-up", "privacy", "account"];

export const href = (route: Route): string => `#/${route}`;

function current(): Route | null {
  const path = window.location.hash.replace(/^#\/?/, "");
  return ROUTES.includes(path as Route) ? (path as Route) : null;
}

/** The screen the address names, or null for the start screen. */
export function useRoute(): Route | null {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const update = () => {
      setRoute(current());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}

export function go(route: Route): void {
  window.location.hash = href(route);
}
