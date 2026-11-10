// Runs a form's action, tracking whether it's busy and what went wrong.

import { useState } from "react";
import { messageFor } from "./messages";

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<string | void>): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const done = await action();
      if (done) setNotice(done);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, notice, run };
}

export function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
