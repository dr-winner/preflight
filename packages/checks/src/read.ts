export class CheckSourceError extends Error {
  readonly code: "not_found" | "unavailable";

  constructor(code: "not_found" | "unavailable", message: string) {
    super(message);
    this.name = "CheckSourceError";
    this.code = code;
  }
}

export type ReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: "not_found" | "unavailable"; readonly message: string };

/** Any thrown error other than `not_found` becomes `unavailable`, which checks map to `unknown`. */
export async function tryRead<T>(run: () => Promise<T>): Promise<ReadResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof CheckSourceError) {
      return { ok: false, code: error.code, message: error.message };
    }
    const message = error instanceof Error ? error.message : "source failed";
    return { ok: false, code: "unavailable", message };
  }
}
