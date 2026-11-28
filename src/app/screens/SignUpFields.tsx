// What creating an account asks for, on the sign-up screen and when finishing
// an account on another phone (AC-1): the display name (AC-2) and the terms of
// use, accepted (AC-4).

import { LIMITS } from "../../data/validate";
import { Hinted } from "./common";
import { Terms } from "./Terms";

export function DisplayNameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Hinted
      label="Display name"
      hint="Other players see only this, if you list something for trade. No real name needed."
    >
      {(hint) => (
        <input
          autoComplete="nickname"
          required
          maxLength={LIMITS.displayName}
          value={value}
          aria-describedby={hint}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Hinted>
  );
}

export function AcceptTerms({ accepted, onChange }: { accepted: boolean; onChange: (accepted: boolean) => void }) {
  return (
    <>
      <Terms />
      <label className="check">
        <input type="checkbox" checked={accepted} onChange={(e) => onChange(e.target.checked)} />I accept the terms of
        use
      </label>
    </>
  );
}
