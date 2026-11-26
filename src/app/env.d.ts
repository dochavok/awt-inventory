/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

/** The app's version from package.json, set by vite.config.ts (SP-2 records it on reports). */
declare const __APP_VERSION__: string;

/** The help pages built from docs/ (build/help-pages.ts, DOC-1). */
declare module "virtual:help-pages" {
  const pages: import("../../build/help-pages").HelpPage[];
  export default pages;
}

/** The reference data from data/, read and checked at build time (build/reference-data.ts, RD-4). */
declare module "virtual:reference-data" {
  const ref: import("../rules/types").ReferenceData;
  export default ref;
}

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** Sentry's address for error reports (NF-12); only the production build has one. */
  readonly VITE_SENTRY_DSN?: string;
}
