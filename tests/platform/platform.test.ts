// Times (NF-8) and error reports (NF-12).

import { expect } from "vitest";
import { scrubEvent, type ErrorEvent } from "../../src/platform/error-reports";
import { formatLocal, toStoredTime } from "../../src/platform/time";
import { rule } from "../support/rule";

rule({ req: ["NF-8"], m: "M2" }, "a time is stored in UTC, whatever zone it was given in", () => {
  expect(toStoredTime(new Date("2026-06-13T14:00:00-05:00")), "2 pm in Chicago, stored").toBe(
    "2026-06-13T19:00:00.000Z",
  );
});

rule({ req: ["NF-8"], m: "M2" }, "a stored UTC time is shown in the user's local time", () => {
  const stored = "2026-06-13T19:00:00.000Z";
  const chicago = formatLocal(stored, "America/Chicago");
  expect(chicago, "the time in Chicago").toMatch(/2:00\s?PM/);
  expect(chicago, "the date in Chicago").toMatch(/Jun(e)? 13/);
  const london = formatLocal(stored, "Europe/London");
  expect(london, "the time in London").toMatch(/8:00\s?PM/);
  const tokyo = formatLocal(stored, "Asia/Tokyo");
  expect(tokyo, "the date in Tokyo, the next day").toMatch(/Jun(e)? 14/);
});

const known = { displayName: "Bramblewick", email: "bram@example.test" };

function event(): ErrorEvent {
  return {
    message: "Couldn't save Bramblewick's entry for bram@example.test",
    exception: {
      values: [{ type: "TypeError", value: "x is undefined (bram@example.test)", stacktrace: { frames: [] } }],
    },
    user: { id: "uid-bram", email: "bram@example.test", username: "Bramblewick" },
    request: { url: "https://app.example.test/characters/aldric", data: { name: "Duskfang", notes: "secret note" } },
    extra: { entry: { name: "Duskfang", notes: "secret note" }, character: "Aldric" },
    contexts: { state: { characters: [{ name: "Aldric" }] } },
    breadcrumbs: [{ message: "Saved Ironclad Plate", data: { entry: "Ironclad Plate" } }],
    tags: { screen: "inventory" },
  };
}

rule({ req: ["NF-12"], m: "M3" }, "an error report never includes the display name or an email address", () => {
  const scrubbed = JSON.stringify(scrubEvent(event(), known));
  expect(scrubbed, "the scrubbed report").not.toContain("Bramblewick");
  expect(scrubbed, "the scrubbed report").not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
});

rule({ req: ["NF-12"], m: "M3" }, "an error report never includes game records", () => {
  const scrubbed = JSON.stringify(scrubEvent(event(), known));
  for (const record of ["Duskfang", "secret note", "Aldric", "Ironclad Plate"]) {
    expect(scrubbed, `the scrubbed report mentioning ${record}`).not.toContain(record);
  }
});

rule({ req: ["NF-12"], m: "M3" }, "the error itself is kept, so the maintainer can still fix it", () => {
  const scrubbed = scrubEvent(event(), known);
  expect(scrubbed.exception?.values?.[0]?.type, "the error type").toBe("TypeError");
  expect(scrubbed.exception?.values?.[0]?.value, "the error message").toContain("x is undefined");
  expect(scrubbed.tags, "the tags").toEqual({ screen: "inventory" });
});

rule(
  { req: ["NF-12"], m: "M3" },
  "an error report never includes an email address, even one that isn't the signed-in user's",
  () => {
    const report: ErrorEvent = {
      message: "Lookup failed for wren.g@example.test",
      exception: { values: [{ type: "Error", value: "no account for cass@example.test" }] },
      tags: { screen: "account", typed: "someone@example.test" },
    };
    const scrubbed = JSON.stringify(scrubEvent(report, known));
    expect(scrubbed, "the scrubbed report").not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(scrubbed, "the scrubbed report").toContain("Lookup failed for");
  },
);

rule(
  { req: ["NF-12"], m: "M3" },
  "an error report's stack trace keeps where the error happened, never variables or source lines",
  () => {
    const report: ErrorEvent = {
      exception: {
        values: [
          {
            type: "TypeError",
            stacktrace: {
              frames: [
                {
                  filename: "https://app.example.test/assets/index.js",
                  function: "saveEntry",
                  lineno: 12,
                  colno: 34,
                  vars: { entry: { name: "Duskfang", notes: "secret note" } },
                  context_line: 'save({ name: "Ironclad Plate" })',
                  pre_context: ["// Aldric"],
                  post_context: ["// Bramblewick"],
                },
              ],
            },
          },
        ],
      },
    };
    const scrubbed = scrubEvent(report, known);
    const text = JSON.stringify(scrubbed);
    for (const record of ["Duskfang", "secret note", "Ironclad Plate", "Aldric", "Bramblewick"]) {
      expect(text, `the scrubbed stack trace mentioning ${record}`).not.toContain(record);
    }
    expect(scrubbed.exception?.values?.[0]?.stacktrace, "where the error happened").toEqual({
      frames: [{ filename: "https://app.example.test/assets/index.js", function: "saveEntry", lineno: 12, colno: 34 }],
    });
  },
);

rule(
  { req: ["NF-12"], m: "M3" },
  "a stack frame's file is the code file without its query, or only the app's address for code on the page",
  () => {
    const report: ErrorEvent = {
      exception: {
        values: [
          {
            type: "TypeError",
            stacktrace: {
              frames: [
                null,
                { filename: "https://app.example.test/assets/index.js?v=3#x", function: "save", lineno: 1 },
                { filename: "https://app.example.test/#/characters/c123/entries/e456?q=Duskfang", lineno: 2 },
              ],
            },
          },
        ],
      },
    };
    expect(scrubEvent(report, known).exception?.values?.[0]?.stacktrace, "the scrubbed frames").toEqual({
      frames: [
        { filename: "https://app.example.test/assets/index.js", function: "save", lineno: 1 },
        { filename: "https://app.example.test", lineno: 2 },
      ],
    });
  },
);

rule({ req: ["NF-12"], m: "M3" }, "an error report's address is only the app's, never the screen it was on", () => {
  const report: ErrorEvent = { request: { url: "https://app.example.test/#/characters/c123/entries/e456?q=Duskfang" } };
  expect(scrubEvent(report, known).request, "the scrubbed address").toEqual({ url: "https://app.example.test" });
});
