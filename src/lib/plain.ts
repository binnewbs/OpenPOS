type AnyRecord = Record<string, unknown>;

export function plain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => plain(item)) as T;

  if (value && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto === null || proto === Object.prototype) {
      const output: AnyRecord = {};
      for (const [key, item] of Object.entries(value as AnyRecord)) {
        output[key] = plain(item);
      }
      return output as T;
    }
  }

  return value;
}
