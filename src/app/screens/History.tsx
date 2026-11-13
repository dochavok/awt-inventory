// A character's history (section 7): newest first (HI-1), with each record's
// date in the user's own time (HI-3), where it came from and its link (IN-11),
// filters by event and category (HI-5), and Restore on a use (IN-13). Records
// can't be edited or removed here (HI-4).

import { useEffect, useState } from "react";
import type { HistoryEvent, HistoryFilter, HistoryRecord } from "../../data/types";
import { categoryName } from "../../data/validate";
import type { Category } from "../../rules/types";
import type { Services } from "../services";
import { Feedback, useAction } from "../useAction";
import { BackTo, CharacterNotFound, Loading, shownDate, useScreenData } from "./common";

const EVENTS: [HistoryEvent, string][] = [
  ["acquired", "Acquired"],
  ["used", "Used"],
  ["restored", "Restored"],
  ["traded", "Traded"],
  ["given-away", "Given away"],
  ["level-changed", "Level changed"],
  ["class-corrected", "Class corrected"],
];

const CATEGORIES: Category[] = ["weapons", "armor", "skills", "allies", "consumables", "items", "components"];

/** Only web addresses are shown as links (IN-11); anything else stays text. */
const webLink = (link: string) => /^https?:\/\//i.test(link);

export function History({ services, id }: { services: Services; id: string }) {
  const { store } = services;
  // The whole history, for which uses are already restored, whatever the filters show.
  const screen = useScreenData(async () => {
    const [character, all] = await Promise.all([store.character(id), store.history(id)]);
    return { character, all };
  });
  const [event, setEvent] = useState<HistoryEvent | "">("");
  const [category, setCategory] = useState<Category | "">("");
  const [filtered, setFiltered] = useState<HistoryRecord[] | null>(null);
  const filter = useAction();
  const action = useAction();

  useEffect(() => {
    if (event === "" && category === "") {
      setFiltered(null);
      return;
    }
    // Only the latest choice of filters is shown, however the replies arrive.
    let current = true;
    const chosen: HistoryFilter = {
      ...(event ? { events: [event] } : {}),
      ...(category ? { categories: [category] } : {}),
    };
    void filter.run(async () => {
      const found = await store.history(id, chosen);
      if (current) setFiltered(found);
    });
    return () => {
      current = false;
    };
  }, [event, category, screen.data]);

  if (screen.missing) return <CharacterNotFound />;
  if (!screen.data) return <Loading error={screen.error} />;
  const { character, all } = screen.data;
  const restored = new Set(all.flatMap((r) => (r.restores ? [r.restores] : [])));
  const shown = event === "" && category === "" ? all : filtered;

  return (
    <>
      <BackTo character={character} />
      <h1>History</h1>
      <div className="filters">
        <label>
          Event
          <select value={event} onChange={(e) => setEvent(e.target.value as HistoryEvent | "")}>
            <option value="">All events</option>
            {EVENTS.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as Category | "")}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryName(c)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Feedback error={action.error ?? filter.error} notice={action.notice} />
      {shown && shown.length === 0 && <p className="hint">No records.</p>}
      {shown && shown.length > 0 && (
        <ul className="cards" aria-label="History records">
          {shown.map((r) => (
            <li key={r.id} className="card">
              <span className="hint">{shownDate(r.date)}</span>
              <p>
                <strong className="name">{r.summary}</strong>
              </p>
              {r.note && <p className="notes">{r.note}</p>}
              {r.source && <p className="hint">From: {r.source}</p>}
              {r.link &&
                (webLink(r.link) ? (
                  <p>
                    <a href={r.link} target="_blank" rel="noopener noreferrer">
                      Link
                    </a>
                  </p>
                ) : (
                  <p className="hint">{r.link}</p>
                ))}
              {r.event === "used" && !restored.has(r.id) && (
                <button
                  type="button"
                  className="secondary"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await store.restoreUsed(r.id);
                      await screen.refresh();
                      return `Restored one ${r.entryName ?? "entry"}.`;
                    })
                  }
                >
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
