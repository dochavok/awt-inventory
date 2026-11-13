// Print and export (section 10.2): the printable sheet as a PDF, for one
// character or every one that isn't retired (EX-1), saved to the phone's files
// (EX-2) and dated on every page (EX-3); and one JSON file with everything in
// the account (EX-4). Both are made on the phone, so they work without signal
// (NF-3).
//
// Making a file and saving it are two taps: the Save link is a real link the
// user taps, which phones save reliably, where a download started after the
// file is made might be blocked.

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { PrintOptions } from "../../data/types";
import { localDay } from "../../platform/time";
import type { Character } from "../../rules/types";
import { href } from "../router";
import type { Services } from "../services";
import { Feedback, useAction } from "../useAction";
import { CharacterNotFound, Loading, useScreenData } from "./common";

/** A file made on the phone, ready to save. */
interface Made {
  name: string;
  url: string;
}

/**
 * Keeps a made file's address while it's offered, and lets it go when replaced or left. A file
 * finished after the screen was left is never given an address, so it can't be kept by mistake.
 */
function useMadeFile() {
  const [made, setMade] = useState<Made | null>(null);
  const open = useRef(true);
  const clear = useCallback(() => setMade(null), []);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (made) URL.revokeObjectURL(made.url);
    },
    [made],
  );
  return {
    made,
    offer: (name: string, blob: Blob) => {
      if (open.current) setMade({ name, url: URL.createObjectURL(blob) });
    },
    clear,
  };
}

function SaveLink({ made }: { made: Made | null }) {
  if (!made) return null;
  return (
    <p className="save">
      <a className="button" href={made.url} download={made.name}>
        Save <span className="name">{made.name}</span>
      </a>
    </p>
  );
}

export function Export({ services, id }: { services: Services; id?: string | undefined }) {
  const { store } = services;
  // The main characters, then the retired ones.
  const screen = useScreenData(async () =>
    (await Promise.all([store.listCharacters("main"), store.listCharacters("retired")])).flat(),
  );
  if (!screen.data) return <Loading error={screen.error} />;
  // An address naming a character that isn't there (deleted on another phone, or a wrong
  // link) says so, rather than quietly offering every character instead.
  if (id !== undefined && !screen.data.some((c) => c.id === id)) return <CharacterNotFound />;
  return (
    <>
      <h1>Print and export</h1>
      <PrintableSheet services={services} characters={screen.data} chosen={id} />
      <JsonExport services={services} />
    </>
  );
}

function PrintableSheet({
  services,
  characters,
  chosen,
}: {
  services: Services;
  characters: Character[];
  chosen: string | undefined;
}) {
  const { store, ref, settings } = services;
  // The character named in the address is chosen; otherwise all of them.
  const [which, setWhich] = useState(chosen ?? "all");
  const [paper, setPaper] = useState<PrintOptions["paper"]>("letter");
  const [skillText, setSkillText] = useState(false);
  const file = useMadeFile();
  const make = useAction();
  // Changing what's asked for takes away a file made for something else. While one is being
  // made, the choices are locked, so the file offered is always for what the form shows.
  const { clear } = file;
  useEffect(() => clear(), [clear, which, paper, skillText]);
  // The sheet has card text only where the app may show it (SK-2) and the skill list has it.
  const textAvailable = settings.showSkillText && ref.skills.some((s) => s.text !== undefined);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void make.run(async () => {
      const pdf = await store.printablePdf({
        characterIds: which === "all" ? "all" : [which],
        includeSkillText: skillText,
        paper,
      });
      file.offer(pdf.fileName, new Blob([pdf.bytes as BlobPart], { type: pdf.mimeType }));
    });
  };

  return (
    <form className="card" aria-labelledby="sheet-title" onSubmit={submit}>
      <h2 id="sheet-title">Printable sheet</h2>
      <label>
        Characters
        <select value={which} disabled={make.busy} onChange={(e) => setWhich(e.target.value)}>
          <option value="all">All characters (not retired)</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.retired && " (retired)"}
            </option>
          ))}
        </select>
      </label>
      <label>
        Paper
        <select value={paper} disabled={make.busy} onChange={(e) => setPaper(e.target.value as PrintOptions["paper"])}>
          <option value="letter">Letter</option>
          <option value="a4">A4</option>
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={skillText}
          disabled={make.busy || !textAvailable}
          onChange={(e) => setSkillText(e.target.checked)}
        />
        Include skill text
      </label>
      {!textAvailable && (
        <p className="hint">The skill list has no card text yet, so the sheet shows skill names only.</p>
      )}
      <Feedback error={make.error} notice={null} />
      <button type="submit" disabled={make.busy}>
        Create PDF
      </button>
      <SaveLink made={file.made} />
    </form>
  );
}

function JsonExport({ services }: { services: Services }) {
  const file = useMadeFile();
  const make = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void make.run(async () => {
      const data = await services.store.exportJson();
      file.offer(
        `AWT inventory ${localDay(data.exportedAt)}.json`,
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
    });
  };

  return (
    <form className="card" aria-labelledby="json-title" onSubmit={submit}>
      <h2 id="json-title">JSON export</h2>
      <p>
        One file with everything in your account: characters, entries, titles and history. Keep a copy, or load it into
        a spreadsheet. The guide&apos;s <a href={href("help/search-and-export")}>Search and export</a> page describes
        the format.
      </p>
      <Feedback error={make.error} notice={null} />
      <button type="submit" disabled={make.busy}>
        Create JSON file
      </button>
      <SaveLink made={file.made} />
    </form>
  );
}
