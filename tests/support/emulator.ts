// Firestore emulator helpers for the access rule tests (TF-11, NF-7). Run with
// `npm run test:access`, which starts the emulator, never production. The rules
// tested are the repository's firestore.rules.
//
// Each check reports "allowed" or "refused" as an assertion, so the stub rules
// (which refuse everything) fail the owner's half as an expected failure, and
// rules that allow everything fail the other user's half.

import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, expect } from "vitest";
import { testUsers } from "./fixtures";

export const PROJECT_ID = "demo-awt-inventory";

let env: RulesTestEnvironment | undefined;

/** Call once at the top of an access test file. */
export function useEmulator(): void {
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
  });
  beforeEach(async () => {
    await env!.clearFirestore();
  });
  afterAll(async () => {
    await env?.cleanup();
  });
}

function environment(): RulesTestEnvironment {
  if (!env) throw new Error("useEmulator() wasn't called in this file");
  return env;
}

/** A fixture user ("bram", "cass") signed in, with a verified email. */
export function signedIn(user: string): RulesTestContext {
  const u = testUsers()[user];
  if (!u) throw new Error(`No fixture user "${user}"`);
  return environment().authenticatedContext(u.uid, { email: u.email, email_verified: true });
}

/** One phone signed in as a fixture user: its own Firestore instance and offline cache. */
export function device(user: string): ReturnType<RulesTestContext["firestore"]> {
  return signedIn(user).firestore();
}

export function signedOut(): RulesTestContext {
  return environment().unauthenticatedContext();
}

export function uid(user: string): string {
  const u = testUsers()[user];
  if (!u) throw new Error(`No fixture user "${user}"`);
  return u.uid;
}

/** Writes documents with the rules switched off, as setup. */
export async function seed(docs: Record<string, Record<string, unknown>>): Promise<void> {
  await environment().withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [path, data] of Object.entries(docs)) await db.doc(path).set(data);
  });
}

async function outcome(attempt: Promise<unknown>): Promise<"allowed" | "refused"> {
  try {
    await attempt;
    return "allowed";
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "permission-denied" || code === "PERMISSION_DENIED") return "refused";
    throw error;
  }
}

export async function expectAllowed(attempt: Promise<unknown>, what: string): Promise<void> {
  expect(await outcome(attempt), what).toBe("allowed");
}

export async function expectRefused(attempt: Promise<unknown>, what: string): Promise<void> {
  expect(await outcome(attempt), what).toBe("refused");
}
