// Print and export (section 10.2): the printable sheet as a PDF, for one
// character or every one that isn't retired (EX-1), saved to the phone's files
// (EX-2) and dated on every page (EX-3); and one JSON file with everything in
// the account (EX-4). Both are made on the phone, so they work without signal
// (NF-3).
//
// Making a file and saving it are two taps: the Save link is a real link the
// user taps, which phones save reliably, where a download started after the
// file is made might be blocked.

import { useEffect, useState, type FormEvent } from "react";
import type { PrintOptions } from "../../data/types";
import { localDay } from "../../platform/time";
import type { Character } from "../../rules/types";
import { href } from "../router";
import type { Services } from "../services";
import { Feedback, useAction } from "../useAction";
import { Loading, useScreenData } from "./common";

/** A file made on the phone, ready to save. */
interface Made {
  name: string;
  url: string;
}

/** Keeps a made file's address while it's offered, and lets it go when replaced or left. */
function useMadeFile() {
  const [made, setMade] = useState<Made | null>(null);
  useEffect(
    () => () => {
      if (made) URL.revokeObjectURL(made.url);
    },
    [made],
  );
  return {
    made,
    offer: (name: string, blob: Blob) => setMade({ name, url: URL.createObjectURL(blob) }),
    clear: () => setMade(null),
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
  // A character named in the address is chosen; any other address starts with all of them.
  const [which, setWhich] = useState(() => characters.find((c) => c.id === chosen)?.id ?? "all");
  const [paper, setPaper] = useState<PrintOptions["paper"]>("letter");
  const [skillText, setSkillText] = useState(false);
  const file = useMadeFile();
  const make = useAction();
  // Changing what's asked for takes away a file made for something else.
  useEffect(file.clear, [which, paper, skillText]);

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
        <select value={which} onChange={(e) => setWhich(e.target.value)}>
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
        <select value={paper} onChange={(e) => setPaper(e.target.value as PrintOptions["paper"])}>
          <option value="letter">Letter</option>
          <option value="a4">A4</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={skillText} onChange={(e) => setSkillText(e.target.checked)} />
        Include skill text
      </label>
      {/* The sheet has card text only where the app may show it (SK-2) and the skill list has it. */}
      {!(settings.showSkillText && ref.skills.some((s) => s.text !== undefined)) && (
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
