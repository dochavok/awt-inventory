// SP-2: issues in the private reports repository, created by a GitHub App
// installed only on that repository, with permission only for issues. The app
// signs a short-lived token with its private key, swaps it for an installation
// token, then creates the issue.

import { NotImplementedError } from "../errors";
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

/** An issue tracker that creates issues as the GitHub App; `privateKey` is its PEM key, from the secret store. */
export function gitHubIssues(_privateKey: string, _deps: GitHubDeps): IssueTracker {
  throw NotImplementedError.stub("gitHubIssues", "M3");
}
