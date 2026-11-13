// A character's history (section 7): newest first (HI-1), with each record's
// date in the user's own time (HI-3), where it came from and its link (IN-11),
// filters by event and category (HI-5), and Restore on a use (IN-13). Records
// can't be edited or removed here (HI-4).

import { useState } from "react";
import { HISTORY_EVENT_NAMES, type HistoryEvent } from "../../data/types";
import { categoryName, isWebLink } from "../../data/validate";
import { CATEGORIES, type Category } from "../../rules/types";
import type { Services } from "../services";
import { Feedback, useAction } from "../useAction";
import { BackTo, CharacterNotFound, Loading, shownDate, useScreenData } from "./common";

/** The events a filter offers: those the app records so far (received comes with trading, section 18). */
const EVENTS = (Object.keys(HISTORY_EVENT_NAMES) as HistoryEvent[]).filter((e) => e !== "received");

export function History({ services, id }: { services: Services; id: string }) {
  const { store } = services;
  const screen = useScreenData(async () => {
    const [character, records] = await Promise.all([store.character(id), store.history(id)]);
    return { character, records };
  });
  const [event, setEvent] = useState<HistoryEvent | "">("");
  const [category, setCategory] = useState<Category | "">("");
  const action = useAction();

  if (screen.missing) return <CharacterNotFound />;
  if (!screen.data) return <Loading error={screen.error} />;
  const { character, records } = screen.data;
  // HI-5: the whole history is here already, so the filters choose from it, as the store's own filter does.
  const shown = records.filter((r) => (!event || r.event === event) && (!category || r.category === category));
  const restored = new Set(records.flatMap((r) => (r.restores ? [r.restores] : [])));

  return (
    <>
      <BackTo character={character} />
      <h1>History</h1>
      <div className="filters">
        <label>
          Event
          <select value={event} onChange={(e) => setEvent(e.target.value as HistoryEvent | "")}>
            <option value="">All events</option>
            {EVENTS.map((value) => (
              <option key={value} value={value}>
                {HISTORY_EVENT_NAMES[value]}
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
      <Feedback error={action.error} notice={action.notice} />
      {shown.length === 0 ? (
        <p className="hint">No records.</p>
      ) : (
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
                // Only web addresses are links (IN-11); anything else stays text.
                (isWebLink(r.link) ? (
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
