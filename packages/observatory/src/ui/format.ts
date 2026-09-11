const intFormatter = new Intl.NumberFormat('en-US');

export function formatInt(v: number): string {
  return intFormatter.format(Math.round(v));
}

export function shortHash(hash: string, length = 8): string {
  return hash.length > length ? hash.slice(0, length) : hash;
}
