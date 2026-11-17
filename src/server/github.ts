// SP-2: issues in the private reports repository, created by a GitHub App
// installed only on that repository, with permission only for issues. The app
// signs a short-lived token with its private key, swaps it for an installation
// token, then creates the issue.

import { createSign } from "node:crypto";
import type { IssueTracker } from "./reports";

/** The GitHub App "AWT Inventory Reports" and the one repository it's installed on. */
export const REPORTS_APP = {
  appId: "5749200",
  installationId: "181702223",
  owner: "dochavok",
  repo: "awt-inventory-reports",
} as const;

export interface GitHubDeps {
  fetch: typeof fetch;
  now: () => Date;
}

const API = "https://api.github.com";

const base64Url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/** The app's own token (a JWT): backdated a minute for clock drift, valid for 9 (GitHub allows 10). */
function appToken(privateKey: string, now: Date): string {
  const seconds = Math.floor(now.getTime() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: seconds - 60, exp: seconds + 540, iss: REPORTS_APP.appId }));
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(privateKey);
  return `${header}.${payload}.${base64Url(signature)}`;
}

/** An issue tracker that creates issues as the GitHub App; `privateKey` is its PEM key, from the secret store. */
export function gitHubIssues(privateKey: string, deps: GitHubDeps): IssueTracker {
  /** The reply, or undefined if GitHub accepted the request but its reply can't be read. */
  async function post<T>(path: string, token: string, body?: unknown): Promise<T | undefined> {
    const response = await deps.fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "awt-inventory",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // The status only: GitHub's reply could quote the issue.
    if (!response.ok) throw new Error(`GitHub refused POST ${path}: ${response.status}`);
    // The parser's own error would quote part of the reply, so it's never passed on.
    return (await response.json().catch(() => undefined)) as T | undefined;
  }

  return {
    async createIssue(issue) {
      const reply = await post<{ token?: unknown }>(
        `/app/installations/${REPORTS_APP.installationId}/access_tokens`,
        appToken(privateKey, deps.now()),
      );
      if (typeof reply?.token !== "string") throw new Error("GitHub's installation token reply couldn't be read");
      const created = await post<{ number?: unknown }>(
        `/repos/${REPORTS_APP.owner}/${REPORTS_APP.repo}/issues`,
        reply.token,
        issue,
      );
      // The issue exists once GitHub accepted it, even if its number can't be read:
      // it counts as delivered, so a retry doesn't make it twice.
      return typeof created?.number === "number" ? { number: created.number } : {};
    },
  };
}
