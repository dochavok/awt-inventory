// Error reports to the maintainer (NF-12). Every event passes through
// scrubEvent before it's sent. It keeps only what's needed to find and fix the
// error (its type, message, stack trace and tags) and drops everything that
// could hold game records or personal details.

import { AppError } from "../errors";
import { EMAIL_PATTERN, escapeRegExp } from "./text";

/**
 * Whether an error is reported at all (NF-12). Refusals the app shows the user
 * (AppError: a name in use, a full slot…) aren't errors, and their messages
 * name the user's records, so they're never sent.
 */
export function shouldReport(error: unknown): boolean {
  return !(error instanceof AppError);
}

/** The parts of an error event the app sends (a subset of Sentry's event). */
export interface ErrorEvent {
  message?: string;
  exception?: { values?: { type?: string; value?: string; stacktrace?: unknown }[] };
  user?: Record<string, unknown>;
  request?: { url?: string; data?: unknown; headers?: Record<string, string> };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
  tags?: Record<string, string>;
}

/** Fields of an event that describe the app and the error, never the user or their records. */
const KEPT = ["event_id", "timestamp", "platform", "level", "release", "environment", "sdk", "fingerprint"];

/** Contexts that describe the phone and browser. Any other context (such as app state) is dropped. */
const SAFE_CONTEXTS = ["browser", "os", "device", "runtime", "culture"];

/** What a stack frame may keep: where the code is, never its variables or source lines. */
const FRAME_FIELDS = ["filename", "abs_path", "function", "module", "lineno", "colno", "in_app"];

/**
 * A code file's address without its query or fragment. Anything else (code run
 * inline has the page's address, which can name a character or an entry) keeps
 * only the app's address, or nothing if it has none.
 */
function codeFile(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const bare = value.split(/[?#]/)[0]!;
  if (/\.[cm]?[jt]sx?$/.test(bare)) return bare;
  return /^[a-z][\w+.-]*:\/\/[^/?#]*/i.exec(value)?.[0];
}

function whereOnly(stacktrace: unknown): { frames: Record<string, unknown>[] } {
  const frames = (stacktrace as { frames?: unknown } | null)?.frames;
  return {
    frames: (Array.isArray(frames) ? frames : [])
      .filter((frame): frame is Record<string, unknown> => typeof frame === "object" && frame !== null)
      .map((frame) =>
        Object.fromEntries(
          FRAME_FIELDS.map((k) => [k, k === "filename" || k === "abs_path" ? codeFile(frame[k]) : frame[k]]).filter(
            ([, v]) => v !== undefined,
          ),
        ),
      ),
  };
}

/**
 * Removes game records, display names and email addresses (NF-12). `known`
 * holds the signed-in user's display name and email, to strip wherever they
 * appear in text.
 */
export function scrubEvent(event: ErrorEvent, known: { displayName?: string; email?: string }): ErrorEvent {
  const text = (value: string): string => {
    let out = value;
    if (known.email) out = out.replace(new RegExp(escapeRegExp(known.email), "gi"), "[email]");
    out = out.replace(EMAIL_PATTERN, "[email]");
    if (known.displayName) out = out.replace(new RegExp(escapeRegExp(known.displayName), "gi"), "[name]");
    return out;
  };
  const source = event as ErrorEvent & Record<string, unknown>;
  const out: ErrorEvent & Record<string, unknown> = {};
  for (const key of KEPT) if (source[key] !== undefined) out[key] = source[key];
  if (event.message !== undefined) out.message = text(event.message);
  if (event.exception?.values) {
    out.exception = {
      values: event.exception.values.map((v) => {
        const value: { type?: string; value?: string; stacktrace?: unknown } = {};
        if (v.type !== undefined) value.type = v.type;
        if (v.value !== undefined) value.value = text(v.value);
        if (v.stacktrace !== undefined) value.stacktrace = whereOnly(v.stacktrace);
        return value;
      }),
    };
  }
  if (event.tags) out.tags = Object.fromEntries(Object.entries(event.tags).map(([k, v]) => [k, text(String(v))]));
  if (event.contexts) {
    const contexts = Object.fromEntries(Object.entries(event.contexts).filter(([k]) => SAFE_CONTEXTS.includes(k)));
    if (Object.keys(contexts).length > 0) out.contexts = contexts;
  }
  // Only the app's address: the path and query can name a character or an entry.
  if (event.request?.url) {
    try {
      out.request = { url: new URL(event.request.url).origin };
    } catch {
      // Not a URL: leave it out.
    }
  }
  // Breadcrumbs (what happened before the error) keep their kind and time, never their text or data.
  if (event.breadcrumbs) {
    out.breadcrumbs = event.breadcrumbs.map((b) => {
      const { message: _m, data: _d, ...rest } = b as Record<string, unknown>;
      return rest;
    });
  }
  return out;
}
