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
