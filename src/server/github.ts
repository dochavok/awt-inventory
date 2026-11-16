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
  async function post<T>(path: string, token: string, body?: unknown): Promise<T> {
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
    try {
      return (await response.json()) as T;
    } catch {
      // Not the parser's message: it would quote part of the reply.
      throw new Error(`GitHub's reply to POST ${path} couldn't be read: ${response.status}`);
    }
  }

  return {
    async createIssue(issue) {
      const { token } = await post<{ token: string }>(
        `/app/installations/${REPORTS_APP.installationId}/access_tokens`,
        appToken(privateKey, deps.now()),
      );
      const created = await post<{ number: number }>(
        `/repos/${REPORTS_APP.owner}/${REPORTS_APP.repo}/issues`,
        token,
        issue,
      );
      return { number: created.number };
    },
  };
}
