// IN-15: after a delete, Undo is offered for about 10 seconds. An entry is
// deleted on its own page and the offer shows on the list it was in, so the
// offer is kept here, for whichever screen shows an UndoBar next or now.

import { useEffect, useState } from "react";
import { Feedback, useAction } from "./useAction";

/** How long Undo is offered (IN-15: about 10 seconds). */
export const UNDO_MS = 10_000;

interface Offer {
  message: string;
  undo: () => Promise<void>;
  /** When the offer ends (Date.now() time). */
  until: number;
}

let pending: Offer | undefined;
const listeners = new Set<(offer: Offer) => void>();

/** Offers Undo for a delete just made, on the screen showing an UndoBar now or next. */
export function offerUndo(message: string, undo: () => Promise<void>): void {
  pending = { message, undo, until: Date.now() + UNDO_MS };
  for (const listener of listeners) listener(pending);
}

const open = () => (pending && pending.until > Date.now() ? pending : undefined);

/** Shows the Undo offer while it's open; `onUndone` reloads the screen once it's undone. */
export function UndoBar({ onUndone }: { onUndone: () => void }) {
  const [offer, setOffer] = useState(open);
  const act = useAction();

  useEffect(() => {
    listeners.add(setOffer);
    return () => {
      listeners.delete(setOffer);
    };
  }, []);

  useEffect(() => {
    if (!offer) return;
    const timer = setTimeout(() => setOffer(undefined), offer.until - Date.now());
    return () => clearTimeout(timer);
  }, [offer]);

  if (!offer) return <Feedback error={act.error} notice={act.notice} />;
  return (
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
  );
}
