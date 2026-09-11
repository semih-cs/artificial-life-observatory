/**
 * Deterministic JSON: object keys sorted recursively, arrays in order, no
 * whitespace. Numbers use JavaScript's shortest round-trip representation, so
 * every finite double survives stringify → parse exactly.
 *
 * Non-finite numbers and non-plain values are rejected rather than silently
 * converted (JSON.stringify would turn NaN/Infinity into null).
 */
export function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value)) throw new Error(`stableStringify: non-finite number ${value}`);
      return JSON.stringify(value);
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
      return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
    }
    default:
      throw new Error(`stableStringify: unsupported value of type ${typeof value}`);
  }
}
