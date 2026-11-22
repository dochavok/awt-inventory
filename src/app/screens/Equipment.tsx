// A character's equipment (section 9): the paper doll with both hands, every
// slot with what's in it or Empty, extra slots marked with where they come from
// (EQ-1, EQ-5), the arcane slots and their count (EQ-6, EQ-7), and over-limit
// alerts (EQ-8). Anything equipped can be unequipped here (EQ-4).

import { sourceLabel } from "../../data/totals-text";
import { slotState } from "../../rules/equipping";
import type { OverLimitAlert, Occupant } from "../../rules/types";
import { arcaneCount, slotParts } from "../grant-text";
import type { Services } from "../services";
import { Feedback, useAction } from "../useAction";
import { BackTo, CharacterNotFound, Loading, useScreenData } from "./common";

/** EQ-8's alerts; nothing when there are none. */
export function Alerts({ alerts }: { alerts: OverLimitAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <section className="card note" aria-labelledby="alerts-title">
      <h2 id="alerts-title">Over the limit</h2>
      <ul aria-label="Over-limit alerts">
        {alerts.map((a) => (
          <li key={JSON.stringify(a.scope)}>{a.message}</li>
        ))}
      </ul>
      <p className="hint">The app unequips nothing itself. Nothing more fits there until you unequip enough.</p>
    </section>
  );
}

export function Equipment({ services, id }: { services: Services; id: string }) {
  const { store, ref } = services;
  // The sheet with its alerts, so the page never shows without them (EQ-8), from one read of the sheet (NF-5).
  const screen = useScreenData(() => store.sheetWithAlerts(id));
  const action = useAction();

  if (screen.missing) return <CharacterNotFound />;
  if (!screen.data) return <Loading error={screen.error} />;
  const { sheet, alerts } = screen.data;
  const state = slotState(sheet, ref);

  const unequip = (occupant: Occupant) =>
    void action.run(async () => {
      await store.unequip(occupant.entryId);
      await screen.refresh();
      return `${occupant.name} unequipped.`;
    });

  const unequipButton = (occupant: Occupant) => (
    <button
      type="button"
      className="secondary"
      aria-label={`Unequip ${occupant.name}`}
      disabled={action.busy}
      onClick={() => unequip(occupant)}
    >
      Unequip
    </button>
  );

  const { arcane } = state;
  return (
    <>
      <BackTo character={sheet.character} />
      <h1>Equipment</h1>
      <Feedback error={action.error} notice={action.notice} />
      <Alerts alerts={alerts} />
      <section className="card" aria-labelledby="doll-title">
        <h2 id="doll-title">Paper doll</h2>
        <ul className="slots" aria-label="Paper doll">
          {state.kinds.flatMap((kind) =>
            kind.slots.map((slot, i) => {
              // The same words the guide's example uses (slotLine, DOC-4); the layout is the page's own.
              const { label, from, holds } = slotParts(slot);
              return (
                <li key={label}>
                  <span className="slot-name">{label}</span>
                  {from && <span className="hint">{from}</span>}
                  {i >= kind.allowed && <span className="tag">Over the limit</span>}
                  <span className={slot.occupant ? "name" : "hint"}>{holds}</span>
                  {slot.occupant && unequipButton(slot.occupant)}
                </li>
              );
            }),
          )}
        </ul>
      </section>
      <section className="card" aria-labelledby="arcane-title">
        <h2 id="arcane-title">Arcane items</h2>
        <p>{arcaneCount(arcane)}</p>
        <p className="hint">
          {[
            `${arcane.starting} to start`,
            `${arcane.fromLevels} from the level chart`,
            ...arcane.grants.map((g) => `${g.amount} from ${sourceLabel(g.source)}`),
          ].join(", ")}
          .
        </p>
        {arcane.occupants.length > 0 && (
          <ul className="slots" aria-label="Arcane slots">
            {arcane.occupants.map((o) => (
              <li key={o.entryId}>
                <span className="name">{o.name}</span>
                {unequipButton(o)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
