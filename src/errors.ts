// Errors the app's interfaces throw. Tests check the type and the fields, so a
// refusal always says what was refused (TF-8).

/** Thrown by every stub until its milestone implements it (TF-2). */
export class NotImplementedError extends Error {
  override readonly name = "NotImplementedError";
  constructor(
    readonly what: string,
    readonly milestone: string,
  ) {
    super(`${what} is not implemented yet (${milestone})`);
  }
}

/** Base class for refusals the user sees. */
export abstract class AppError extends Error {
  abstract readonly code: string;
}

/** Another user's record, or no signed-in user (PV-1). */
export class AccessDeniedError extends AppError {
  override readonly name = "AccessDeniedError";
  readonly code = "access-denied";
}

/** A record that doesn't exist (or no longer exists). */
export class NotFoundError extends AppError {
  override readonly name = "NotFoundError";
  readonly code = "not-found";
  constructor(
    readonly kind: string,
    readonly id: string,
  ) {
    super(`${kind} ${id} not found`);
  }
}

/** A field's value isn't allowed: `field` names it. */
export class ValidationError extends AppError {
  override readonly name = "ValidationError";
  readonly code = "invalid";
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

/** Typed confirmation (a name to type, a box to tick) didn't match (CH-2a, CH-6, AC-5). */
export class ConfirmationError extends AppError {
  override readonly name = "ConfirmationError";
  readonly code = "confirmation";
  constructor(
    readonly expected: string,
    message: string,
  ) {
    super(message);
  }
}

/** A limit on how often something can be done was reached (SP-1). */
export class RateLimitError extends AppError {
  override readonly name = "RateLimitError";
  readonly code = "rate-limit";
  constructor(
    readonly limit: number,
    message: string,
  ) {
    super(message);
  }
}
