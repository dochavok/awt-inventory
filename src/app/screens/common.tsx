// Parts shared by a character's screens: loading what a screen shows, the page
// for a character that isn't there, the link back to the character, and dates.

import { useEffect, useState } from "react";
import { NotFoundError } from "../../errors";
import type { Character } from "../../rules/types";
import { href } from "../router";
import { Feedback, useAction } from "../useAction";

/** How long a search waits after the last key before looking anything up: each look-up reads entries (NF-5). */
export const SEARCH_PAUSE_MS = 300;

/**
 * Reads what a screen shows when it opens; `refresh` reads it again. A record
 * that isn't there (deleted on another phone, or a wrong address) sets `missing`.
 */
export function useScreenData<T>(read: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [missing, setMissing] = useState(false);
  const load = useAction();
  const refresh = async () => setData(await read());

  useEffect(() => {
    void load.run(async () => {
      try {
        await refresh();
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
        setMissing(true);
      }
    });
    // Read once when the screen opens; App gives each screen its own key.
  }, []);

  /** Changes what's shown in place, once it has loaded, after a change the screen made itself. */
  const set = (change: (data: T) => T) => setData((old) => (old === null ? old : change(old)));

  return { data, missing, error: load.error, refresh, set };
}

/** Shown while a screen loads, or why it couldn't. */
export function Loading({ error }: { error: string | null }) {
  return (
    <>
      <Feedback error={error} notice={null} />
      {!error && <p className="hint">Loading…</p>}
    </>
  );
}

export function CharacterNotFound() {
  return (
    <>
      <h1>Character not found</h1>
      <p>
        This character isn&apos;t in your account. It may have been deleted on another phone.{" "}
        <a href={href("characters")}>See your characters</a>.
      </p>
    </>
  );
}

/** The link from one of a character's screens back to its page. */
export function BackTo({ character }: { character: Character }) {
  return (
    <p className="back">
      <a href={href(`characters/${character.id}`)}>
        ← <span className="name">{character.name}</span>
      </a>
    </p>
  );
}

/**
 * A day picked in a date field, as the time the store keeps (HI-3): midday in the
 * user's own time, so it shows as that day wherever they are. Empty or today means now.
 */
export function pickedDate(day: string): string | undefined {
  // Today is now, so a record dated today never sorts after one made later today.
  return day && day !== today() ? new Date(`${day}T12:00`).toISOString() : undefined;
}

/** A stored time as a day in the user's own time (HI-3). */
export function shownDate(stored: string): string {
  return new Date(stored).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Today in the user's own time, as a date field's highest choice (events can't be in the future). */
function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** When an event happened (HI-3): today unless an earlier day is chosen. Use pickedDate on the value. */
export function DayField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (day: string) => void;
}) {
  return (
    <label>
      {label}
      <input type="date" max={today()} value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="hint">Leave empty for today.</span>
    </label>
  );
}

/** A character's level, or the level a skill was gained at: from 1 to the level chart's highest (RD-5). */
export function LevelInput({
  label = "Level",
  value,
  onChange,
  max,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        inputMode="numeric"
        required
        min={1}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="hint">From 1 to {max}.</span>
    </label>
  );
}
