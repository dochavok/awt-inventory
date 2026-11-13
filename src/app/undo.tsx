// IN-15: after a delete, Undo is offered for about 10 seconds. An entry is
// deleted on its own page and the offer shows on the list it was in, so the
// offer is kept here, with that list's address, for the bar on that list.

import { useEffect, useState } from "react";
import { UNDO_SECONDS } from "../data/records";
import { Feedback, useAction } from "./useAction";

/** How long Undo is offered: as long as the store allows it (IN-15). */
const UNDO_MS = UNDO_SECONDS * 1000;

interface Offer {
  message: string;
  undo: () => Promise<void>;
  /** The address of the list the deleted record was in, where the offer shows. */
  at: string;
  /** When the offer ends (Date.now() time). */
  until: number;
}

let pending: Offer | undefined;
const listeners = new Set<(offer: Offer) => void>();

/** Offers Undo for a delete just made, on the list at the address `at`. */
export function offerUndo(message: string, undo: () => Promise<void>, at: string): void {
  pending = { message, undo, at, until: Date.now() + UNDO_MS };
  for (const listener of listeners) listener(pending);
}

/** The offer still open for the list at `at`, if any; one that has ended is let go, with what it holds. */
function open(at: string): Offer | undefined {
  if (pending && pending.until <= Date.now()) pending = undefined;
  return pending?.at === at ? pending : undefined;
}

/** Shows the Undo offer for the list at `at` while it's open; `onUndone` reloads the list once it's undone. */
export function UndoBar({ at, onUndone }: { at: string; onUndone: () => void }) {
  const [offer, setOffer] = useState(() => open(at));
  const act = useAction();

  useEffect(() => {
    const listener = (o: Offer) => setOffer(o.at === at ? o : undefined);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [at]);

  useEffect(() => {
    if (!offer) return;
    const timer = setTimeout(() => {
      if (pending === offer) pending = undefined;
      setOffer(undefined);
    }, offer.until - Date.now());
    return () => clearTimeout(timer);
  }, [offer]);

  return (
    <>
      {offer && (
        <div className="card undo" role="status" aria-label="Undo">
          <span>{offer.message}</span>
          <button
            type="button"
            className="secondary"
            disabled={act.busy}
            onClick={() =>
              void act.run(async () => {
                await offer.undo();
                if (pending === offer) pending = undefined;
                setOffer(undefined);
                onUndone();
                return "Undone.";
              })
            }
          >
            Undo
          </button>
        </div>
      )}
      <Feedback error={act.error} notice={act.notice} />
    </>
  );
}
