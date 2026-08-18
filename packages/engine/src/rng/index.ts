import type { Seed } from "../brands.js";

export const generateNextRndInt = (seed: Seed, cursor: number, min: number, max: number): { rndInt: number; advancedCursor: number } => {
  const { rndNumber, advancedCursor } = generateNextRndNumber(seed, cursor);
  return { rndInt: min + Math.floor(rndNumber * (max - min + 1)), advancedCursor };
};

export const generateNextRndNumber = (seed: Seed, cursor: number): { rndNumber: number; advancedCursor: number } => {
  let t = (seed + Math.imul(cursor + 1, 0x6d2b79f5)) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const rndNumber = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { rndNumber, advancedCursor: cursor + 1 };
};
