// When the app looks for a new version of itself (NF-14): as it opens, each time
// it's brought back from the background, and every hour while it stays open,
// but only with signal. Finding and offering the new version is the browser
// test's (tests/browser/phone.spec.ts).

import { afterEach, expect, vi } from "vitest";
import { CHECK_EVERY_MS, checkForNewVersions } from "../../src/app/version-checks";
import { rule } from "../support/rule";

/** A page the test controls: signal, whether it's in view, and its visibility events. */
function fakePage() {
  const listeners = new Set<() => void>();
  const page = {
    signal: true,
    inView: true,
    online: () => page.signal,
    visible: () => page.inView,
    onVisibilityChange(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** The app goes to the background, or comes back. */
    show(inView: boolean) {
      page.inView = inView;
      listeners.forEach((l) => l());
    },
    listening: () => listeners.size,
  };
  return page;
}

afterEach(() => {
  vi.useRealTimers();
});

rule({ req: ["NF-14"], m: "M4" }, "the app looks for a new version as it opens", () => {
  const check = vi.fn();
  checkForNewVersions(check, fakePage());
  expect(check, "checks as the app opens").toHaveBeenCalledTimes(1);
});

rule({ req: ["NF-14"], m: "M4" }, "each time the app is brought back from the background, it looks again", () => {
  const page = fakePage();
  const check = vi.fn();
  checkForNewVersions(check, page);
  page.show(false);
  expect(check, "checks after going to the background: only the one as it opened").toHaveBeenCalledTimes(1);
  page.show(true);
  expect(check, "checks after coming back once").toHaveBeenCalledTimes(2);
  page.show(false);
  page.show(true);
  expect(check, "checks after coming back twice").toHaveBeenCalledTimes(3);
});

rule({ req: ["NF-14"], m: "M4" }, "while the app stays open, it looks again every hour", () => {
  vi.useFakeTimers();
  const check = vi.fn();
  checkForNewVersions(check, fakePage());
  expect(CHECK_EVERY_MS, "how often, at most an hour").toBeLessThanOrEqual(60 * 60 * 1000);
  vi.advanceTimersByTime(CHECK_EVERY_MS - 1);
  expect(check, "checks just before the first hourly one").toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  expect(check, "checks after one interval").toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(2 * CHECK_EVERY_MS);
  expect(check, "checks after three intervals").toHaveBeenCalledTimes(4);
});

rule(
  { req: ["NF-14"], m: "M4" },
  "without signal the app doesn't look, and looks again once it's back in view with signal",
  () => {
    vi.useFakeTimers();
    const page = fakePage();
    page.signal = false;
    const check = vi.fn();
    checkForNewVersions(check, page);
    vi.advanceTimersByTime(CHECK_EVERY_MS);
    page.show(false);
    page.show(true);
    expect(check, "checks without signal").not.toHaveBeenCalled();
    page.signal = true;
    page.show(false);
    page.show(true);
    expect(check, "checks once signal is back and the app comes back").toHaveBeenCalledTimes(1);
  },
);

rule({ req: ["NF-14"], m: "M4" }, "once stopped, the app no longer looks", () => {
  vi.useFakeTimers();
  const page = fakePage();
  const check = vi.fn();
  const stop = checkForNewVersions(check, page);
  stop();
  expect(page.listening(), "visibility listeners left").toBe(0);
  vi.advanceTimersByTime(3 * CHECK_EVERY_MS);
  page.show(false);
  page.show(true);
  expect(check, "checks after stopping: only the one as it opened").toHaveBeenCalledTimes(1);
});
