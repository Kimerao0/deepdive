import { describe, expect, it } from "vitest";
import { generateDungeon, type Dungeon } from "#dungeon/index";

// Generated once and shared: dungeon generation is expensive (hard takes
// several seconds), and every assertion below is read-only.
const easy = generateDungeon("easy", "castle");
const medium = generateDungeon("medium", "castle");
const hard = generateDungeon("hard", "castle");

const hugeLevelsOf = (dungeon: Dungeon) => dungeon.levels.filter((level) => level.some((floor) => floor.gridSize === 200));

describe("generateDungeon", () => {
  it("should build 10/20/30 levels for easy/medium/hard", () => {
    expect(easy.levels.length).toBe(10);
    expect(medium.levels.length).toBe(20);
    expect(hard.levels.length).toBe(30);
    expect(easy.difficulty).toBe("easy");
  });

  it("should hold 1 to 3 floors per level, with single-floor bookends", () => {
    for (const dungeon of [easy, medium, hard]) {
      for (const level of dungeon.levels) {
        expect(level.length).toBeGreaterThanOrEqual(1);
        expect(level.length).toBeLessThanOrEqual(3);
      }
      expect(dungeon.levels[0]!.length).toBe(1);
      expect(dungeon.levels[dungeon.levels.length - 1]!.length).toBe(1);
    }
  });

  it("should always start on a small floor", () => {
    for (const dungeon of [easy, medium, hard]) {
      expect(dungeon.levels[0]![0]!.gridSize).toBe(50);
    }
  });

  it("should never shrink floor sizes with depth", () => {
    for (const dungeon of [easy, medium, hard]) {
      let previous = 0;
      for (const level of dungeon.levels) {
        for (const floor of level) {
          expect(floor.gridSize).toBeGreaterThanOrEqual(previous);
        }
        previous = Math.max(previous, ...level.map((floor) => floor.gridSize));
      }
    }
  });

  it("easy: should never reach huge and end on a large floor", () => {
    expect(hugeLevelsOf(easy).length).toBe(0);
    expect(easy.levels[9]![0]!.gridSize).toBe(150);
  });

  it("medium: should end with exactly two single-floor huge levels", () => {
    const hugeLevels = hugeLevelsOf(medium);
    expect(hugeLevels.length).toBe(2);
    for (const level of hugeLevels) {
      expect(level.length).toBe(1);
    }
    expect(medium.levels[19]![0]!.gridSize).toBe(200);
  });

  it("hard: should have at least five huge levels and end huge", () => {
    expect(hugeLevelsOf(hard).length).toBeGreaterThanOrEqual(5);
    expect(hard.levels[29]![0]!.gridSize).toBe(200);
  });

  it("should use every entry except the entrance in exactly one connection, between adjacent levels", () => {
    for (const dungeon of [easy, medium, hard]) {
      const used = new Set<string>();
      const refKey = (ref: { level: number; floor: number; entry: number }) => `${ref.level}/${ref.floor}/${ref.entry}`;

      for (const { from, to } of dungeon.connections) {
        expect(to.level).toBe(from.level + 1);
        for (const ref of [from, to]) {
          expect(used.has(refKey(ref))).toBe(false);
          used.add(refKey(ref));
          expect(dungeon.levels[ref.level]?.[ref.floor]?.entries[ref.entry]).toBeDefined();
        }
      }

      const totalEntries = dungeon.levels.flat().reduce((sum, floor) => sum + floor.entries.length, 0);
      expect(used.size).toBe(totalEntries - 1);
      expect(used.has(refKey(dungeon.entrance))).toBe(false);
    }
  });

  it("should reserve the entrance on the first floor, separate from the stairs down", () => {
    for (const dungeon of [easy, medium, hard]) {
      expect(dungeon.entrance.level).toBe(0);
      expect(dungeon.entrance.floor).toBe(0);
      expect(dungeon.levels[0]![0]!.entries[dungeon.entrance.entry]).toBeDefined();
      // entrance plus at least one staircase down
      expect(dungeon.levels[0]![0]!.entries.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("should never make a single-floor level a dead end, except the last", () => {
    for (const dungeon of [easy, medium, hard]) {
      const lastLevel = dungeon.levels.length - 1;

      for (let level = 1; level < lastLevel; level++) {
        const floors = dungeon.levels[level]!;
        const hasDown = (floor: number) => dungeon.connections.some(({ from }) => from.level === level && from.floor === floor);

        // every floor already has stairs up by construction; a dead end is a
        // floor without stairs down, allowed only next to a through floor
        const throughFloors = floors.filter((_, floor) => hasDown(floor));
        expect(throughFloors.length).toBeGreaterThanOrEqual(1);
        if (floors.length === 1) {
          expect(hasDown(0)).toBe(true);
        }
      }
    }
  });

  it("should make every floor reachable from the first through connections", () => {
    for (const dungeon of [easy, medium, hard]) {
      const floorKey = (level: number, floor: number) => `${level}/${floor}`;
      const reached = new Set([floorKey(0, 0)]);

      let grew = true;
      while (grew) {
        grew = false;
        for (const { from, to } of dungeon.connections) {
          const upper = floorKey(from.level, from.floor);
          const lower = floorKey(to.level, to.floor);
          if (reached.has(upper) && !reached.has(lower)) {
            reached.add(lower);
            grew = true;
          }
        }
      }

      expect(reached.size).toBe(dungeon.levels.flat().length);
    }
  });
});
