export type Seed = number & { readonly __brand: "Seed" };

export function toSeed(n: number): Seed {
  if (!Number.isInteger(n) || n < 0) throw new Error("seed not valid");
  return n as Seed;
}
