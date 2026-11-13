// Reports to the maintainer (SP-1): a kind, a subject and a message, optionally
// naming a character, at most 5 a day. Written offline, a report is sent when
// signal returns (NF-3). The skill picker opens it as a missing skill (SK-5).

import { useEffect, useState, type FormEvent } from "react";
import type { ReportKind } from "../../data/types";
import { LIMITS } from "../../data/validate";
import type { Character } from "../../rules/types";
import type { Services } from "../services";
import { Feedback, useAction } from "../useAction";

const KINDS: [ReportKind, string][] = [
  ["missing-skill", "Missing or wrong skill"],
  ["bug", "Bug"],
  ["idea", "Idea"],
  ["account-problem", "Account problem"],
];

export function ReportForm({ services, kind: chosen }: { services: Services; kind?: ReportKind | undefined }) {
  const { store } = services;
  const [kind, setKind] = useState<ReportKind>(chosen ?? "bug");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const send = useAction();

  useEffect(() => {
    // The characters to choose from; without them, a report can still be sent.
    void Promise.all([store.listCharacters("main"), store.listCharacters("retired")]).then(
      ([main, retired]) => setCharacters([...main, ...retired]),
      () => undefined,
    );
  }, [store]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send.run(async () => {
      const report = await store.sendReport({ kind, subject, message, ...(characterId ? { characterId } : {}) });
      setSubject("");
      setMessage("");
      return `Report ${report.number} sent. Thank you: the maintainer will look at it.`;
    });
  };

  return (
    <>
      <h1>Send a report</h1>
      <p className="hint">
        Tell the maintainer about a skill missing from the list or wrong in it, a bug, an idea, or a problem with your
        account. You can send up to 5 a day. Without signal, it&apos;s sent when signal returns.
      </p>
      <form className="card" aria-label="Report" onSubmit={submit}>
        <label>
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
            {KINDS.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Subject
          <input
            required
            maxLength={LIMITS.reportSubject}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
        <label>
          Message
          <textarea
            required
            maxLength={LIMITS.reportMessage}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <label>
          Character
          <select value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
            <option value="">None</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="hint">Optional: the character the report is about.</span>
        </label>
        {kind === "account-problem" && (
          <p className="hint">
            Account problems aren&apos;t posted anywhere: the maintainer is told only the report&apos;s number, and
            reads it in the app&apos;s database.
          </p>
        )}
        <Feedback error={send.error} notice={send.notice} />
        <button type="submit" disabled={send.busy}>
          Send report
        </button>
      </form>
    </>
  );
}
