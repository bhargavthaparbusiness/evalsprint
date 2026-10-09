/** Returns `base`, or `base-2`, `base-3`, … — whichever is not already taken. */
export function uniqueId(base: string, existing: string[]): string {
  const clean = base.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 56) || "item";
  if (!existing.includes(clean)) return clean;
  let n = 2;
  while (existing.includes(`${clean}-${n}`)) n++;
  return `${clean}-${n}`;
}
