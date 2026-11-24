export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type JsonObject = { readonly [key: string]: JsonValue };

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }
  if (typeof value === "object") {
    return Object.values(value).every((item) => isJsonValue(item));
  }
  return false;
}

/** Copies enumerable string keys. Symbol brands used by the check result type are dropped. */
export function plainObject(value: object): JsonObject {
  const plain: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isJsonValue(entry)) {
      throw new Error(`evidence field ${key} is not JSON`);
    }
    plain[key] = entry;
  }
  return plain;
}
