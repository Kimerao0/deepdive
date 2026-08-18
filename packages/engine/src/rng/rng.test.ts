import { describe, expect, it } from "vitest";
import { generateNextRndInt, generateNextRndNumber } from "./index.js";
import { toSeed } from "../brands.js";

describe("rng", () => {
  const value1 = generateNextRndNumber(toSeed(123), 0);
  const value2 = generateNextRndNumber(toSeed(123), 0);
  it("should generate two identical values with the same seed", () => {
    expect(value1.rndNumber).toEqual(value2.rndNumber);
  });
  it("should generate two different values with advanced cursor", () => {
    const value3 = generateNextRndNumber(toSeed(123), value2.advancedCursor);
    expect(value2.rndNumber).not.toEqual(value3.rndNumber);
  });
  it("should stay in bounds and reach both ends", () => {
    let cursor = 0;
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const float = generateNextRndNumber(toSeed(123), cursor);
      expect(float.rndNumber).toBeGreaterThanOrEqual(0);
      expect(float.rndNumber).toBeLessThan(1);
      const int = generateNextRndInt(toSeed(123), cursor, 3, 7);
      expect(int.rndInt).toBeGreaterThanOrEqual(3);
      expect(int.rndInt).toBeLessThanOrEqual(7);
      seen.add(int.rndInt);
      cursor = float.advancedCursor;
    }
    expect(seen.has(3)).toBe(true);
    expect(seen.has(7)).toBe(true);
  });
});
