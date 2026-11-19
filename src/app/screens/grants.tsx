// Grants and equipping, as the screens edit them: the form for a grant (GR-1,
// GR-4), the list of a source's grants with Remove, the editor that adds them
// to an entry or a title (GR-2, TI-5), and equipping where an entry fits
// (EQ-2, EQ-3, EQ-7).

import { useId, useState, type FormEvent, type ReactNode } from "react";
import type { GrantTarget } from "../../data/types";
import { LIMITS } from "../../data/validate";
import {
  PERMISSIONS,
  type EquipCheck,
  type Entry,
  type Grant,
  type NewGrant,
  type Permission,
  type ReferenceData,
  type SlotTarget,
} from "../../rules/types";
import { grantText, PERMISSION_NAMES } from "../grant-text";
import type { Services } from "../services";
import { Feedback, useAction } from "../useAction";

type Kind = Exclude<NewGrant["kind"], "effect">;

/** GR-1's kinds, in its order. Effects (GR-6) come in M5. */
const KIND_NAMES: Record<Kind, string> = {
  cm: "CM",
  mitigation: "Mitigation",
  hearts: "Max hearts",
  die: "Extra die",
  slots: "Slots",
  "arcane-slots": "Arcane slots",
  allowance: "Rarity allowance",
  permission: "Permission",
};

interface Fields {
  kind: Kind;
  amount: string;
  die: string;
  slotKind: string;
  rarity: string;
  permission: Permission;
  condition: string;
}

const chooseable = <T extends { retired?: boolean }>(list: T[]) => list.filter((x) => !x.retired);

function emptyFields(ref: ReferenceData): Fields {
  return {
    kind: "cm",
    amount: "1",
    die: "",
    slotKind: chooseable(ref.slotKinds)[0]?.id ?? "",
    rarity: chooseable(ref.rarities)[0]?.id ?? "",
    permission: "weapon-use",
    condition: "",
  };
}

/** The grant the form holds, as the store takes it; the store checks it (validate.ts). */
function grantFrom(f: Fields): NewGrant {
  const amount = Number(f.amount);
  const condition = f.condition.trim() ? { condition: f.condition } : {};
  switch (f.kind) {
    case "cm":
    case "mitigation":
    case "hearts":
    case "arcane-slots":
      return { kind: f.kind, amount, ...condition };
    case "die":
      return { kind: "die", die: f.die.trim(), ...condition };
    case "slots":
      return { kind: "slots", slotKind: f.slotKind, amount, ...condition };
    case "allowance":
      return { kind: "allowance", rarity: f.rarity, amount, ...condition };
    case "permission":
      return { kind: "permission", permission: f.permission, ...condition };
  }
}

/**
 * A form for one grant. `before` holds fields of the form's own (a manual grant's reason);
 * `onAdd` saves the grant and returns what to tell the user.
 */
export function GrantForm({
  services,
  label = "Add a grant",
  button = "Add grant",
  before,
  onAdd,
}: {
  services: Services;
  label?: string;
  button?: string;
  before?: ReactNode;
  onAdd: (grant: NewGrant) => Promise<string | void>;
}) {
  const { ref } = services;
  const [f, setF] = useState(() => emptyFields(ref));
  const kindId = useId();
  const add = useAction();
  const set =
    <K extends keyof Fields>(key: K) =>
    (value: Fields[K]) =>
      setF((old) => ({ ...old, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // The form starts afresh as soon as a grant is sent, so the next can be typed while it saves.
    // If it's refused, what was sent comes back, unless something new has been typed meanwhile.
    const sent = f;
    const fresh = { ...emptyFields(ref), kind: f.kind };
    setF(fresh);
    void add.run(async () => {
      try {
        return await onAdd(grantFrom(sent));
      } catch (error) {
        setF((now) => (now === fresh ? sent : now));
        throw error;
      }
    });
  };

  const amount = (max: number) => (
    <label>
      Amount
      <input
        type="number"
        inputMode="numeric"
        required
        min={1}
        max={max}
        step={1}
        value={f.amount}
        onChange={(e) => set("amount")(e.target.value)}
      />
    </label>
  );

  return (
    <form className="grant-form" aria-label={label} onSubmit={submit}>
      {before}
      {/* Labelled apart, so the label's name is "Kind" alone, not its options' ("Extra die", "Permission"). */}
      <div className="field">
        <label htmlFor={kindId}>Kind</label>
        <select id={kindId} value={f.kind} onChange={(e) => set("kind")(e.target.value as Kind)}>
          {Object.entries(KIND_NAMES).map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {(f.kind === "cm" || f.kind === "mitigation" || f.kind === "hearts" || f.kind === "allowance") &&
        amount(LIMITS.grantAmount)}
      {(f.kind === "slots" || f.kind === "arcane-slots") && amount(LIMITS.slotGrant)}
      {f.kind === "die" && (
        <label>
          Die
          <input required maxLength={10} placeholder="1d6" value={f.die} onChange={(e) => set("die")(e.target.value)} />
        </label>
      )}
      {f.kind === "slots" && (
        <label>
          Slot kind
          <select value={f.slotKind} onChange={(e) => set("slotKind")(e.target.value)}>
            {chooseable(ref.slotKinds).map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {f.kind === "allowance" && (
        <label>
          Rarity
          <select value={f.rarity} onChange={(e) => set("rarity")(e.target.value)}>
            {chooseable(ref.rarities).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {f.kind === "permission" && (
        <label>
          Permission
          <select value={f.permission} onChange={(e) => set("permission")(e.target.value as Permission)}>
            {PERMISSIONS.map((p) => (
              <option key={p} value={p}>
                {PERMISSION_NAMES[p]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Condition
        <input maxLength={LIMITS.shortText} value={f.condition} onChange={(e) => set("condition")(e.target.value)} />
        <span className="hint">Such as &quot;vs Evil&quot;. A grant with a condition is listed, but not added in.</span>
      </label>
      <Feedback error={add.error} notice={add.notice} />
      <button type="submit" disabled={add.busy}>
        {button}
      </button>
    </form>
  );
}

/** A source's grants, each with Remove (GR-2). */
export function GrantList({
  grants,
  ref,
  busy,
  onRemove,
}: {
  grants: Grant[];
  ref: ReferenceData;
  busy: boolean;
  onRemove: (grant: Grant) => void;
}) {
  if (grants.length === 0) return <p className="hint">No grants.</p>;
  return (
    <ul className="grant-list" aria-label="Grants">
      {grants.map((g) => {
        const text = grantText(g, ref);
        return (
          <li key={g.id}>
            <span>{text}</span>
            <button
              type="button"
              className="secondary"
              aria-label={`Remove ${text}`}
              disabled={busy}
              onClick={() => onRemove(g)}
            >
              Remove
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** An entry's or a title's grants, with the form to add more (GR-2, TI-5). `onChanged` reads them again. */
export function GrantsEditor({
  services,
  target,
  grants,
  onChanged,
}: {
  services: Services;
  target: GrantTarget;
  grants: Grant[];
  onChanged: () => Promise<void>;
}) {
  const { store, ref } = services;
  const remove = useAction();
  return (
    <>
      <GrantList
        grants={grants}
        ref={ref}
        busy={remove.busy}
        onRemove={(g) =>
          void remove.run(async () => {
            await store.removeGrant(g.id);
            await onChanged();
          })
        }
      />
      <Feedback error={remove.error} notice={null} />
      <GrantForm
        services={services}
        onAdd={async (grant) => {
          await store.addGrant(target, grant);
          await onChanged();
        }}
      />
    </>
  );
}

/**
 * Where an entry can be equipped, in the order the app tries them (EQ-2, EQ-3, EQ-7):
 * a one-handed weapon in either hand, Main hand first. None for what can't be equipped.
 */
export function equipTargets(entry: Entry): SlotTarget[] {
  switch (entry.category) {
    case "weapons":
      return entry.hands === 2 ? ["both-hands"] : ["main-hand", "off-hand"];
    case "armor":
      return [entry.slotKind];
    case "items":
      return entry.arcane ? ["arcane"] : [];
    default:
      return [];
  }
}

/**
 * Equips an entry in the first place it fits that's free, in one tap (NF-1). If none is,
 * nothing changes, and the first place's block says why (EQ-2).
 */
export async function equipWherever(services: Services, entry: Entry): Promise<EquipCheck> {
  let first: EquipCheck | undefined;
  for (const target of equipTargets(entry)) {
    const check = await services.store.equip(entry.id, target);
    if (check.outcome === "allowed") return check;
    first ??= check;
  }
  return first ?? (await services.store.equip(entry.id, "none"));
}
