import { generateFloor, type Floor } from "#floor/index";
import type { Difficulty, FloorDensity, Size, TileSet } from "#dungeon/types";

// Points at one entry of one floor: indices into dungeon.levels[level][floor].entries[entry].
export interface EntryRef {
  level: number;
  floor: number;
  entry: number;
}

// Stairs between two floors: `from` sits on the shallower level, `to` on the deeper one.
export interface Connection {
  from: EntryRef;
  to: EntryRef;
}

export interface Dungeon {
  difficulty: Difficulty;
  levels: Floor[][];
  connections: Connection[];
  // The door from the surface: the one entry no staircase consumes, on the
  // first floor. A run starts here — without it, a first floor with a single
  // entry would make the way in and the stairs down the same tile.
  entrance: EntryRef;
}

// Depth is relative to the dungeon's total levels (0 = first, 1 = last).
// Each difficulty has its own progression: easy never reaches huge and caps
// how many rooms a floor can hold; medium ends on two single-floor huge
// levels that are never dense; hard ends on six huge levels, dense from
// depth 0.9 down.
interface DifficultyProfile {
  levelCount: number;
  sizeAt: (depth: number) => Size;
  densityAt: (depth: number, size: Size) => FloorDensity;
  singleFloorHuge: boolean;
}

const PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    levelCount: 10,
    sizeAt: (depth) => (depth < 1 / 3 ? "small" : depth < 2 / 3 ? "medium" : "large"),
    densityAt: (depth) => (depth < 0.5 ? "sparse" : "normal"),
    singleFloorHuge: false,
  },
  medium: {
    levelCount: 20,
    sizeAt: (depth) => (depth < 0.25 ? "small" : depth < 0.5 ? "medium" : depth < 0.9 ? "large" : "huge"),
    densityAt: (depth, size) => {
      if (depth < 1 / 3) return "sparse";
      if (depth < 2 / 3 || size === "huge") return "normal";
      return "dense";
    },
    singleFloorHuge: true,
  },
  hard: {
    levelCount: 30,
    sizeAt: (depth) => (depth < 0.2 ? "small" : depth < 0.45 ? "medium" : depth < 0.8 ? "large" : "huge"),
    densityAt: (depth) => (depth < 1 / 3 ? "sparse" : depth < 0.9 ? "normal" : "dense"),
    singleFloorHuge: false,
  },
};

const MAX_FLOORS_PER_LEVEL = 3;

export const generateDungeon = (difficulty: Difficulty, tileSet: TileSet): Dungeon => {
  const profile = PROFILES[difficulty];
  const levelCount = profile.levelCount;
  const lastLevel = levelCount - 1;

  const depths = Array.from({ length: levelCount }, (_, level) => level / lastLevel);
  const sizes = depths.map((depth) => profile.sizeAt(depth));

  // Single-floor bookends; every level in between holds 1 to 3 floors —
  // except huge levels when the profile keeps them single-floor.
  const floorCounts = Array.from({ length: levelCount }, (_, level) => {
    if (level === 0 || level === lastLevel) return 1;
    if (profile.singleFloorHuge && sizes[level] === "huge") return 1;
    return 1 + Math.floor(Math.random() * MAX_FLOORS_PER_LEVEL);
  });

  // Topology before generation: every floor below the first level gets one
  // staircase up to a random floor of the previous level. That makes the
  // dungeon a tree — every floor reachable — and fixes each floor's entry
  // count, so floors are generated with exactly as many entries as stairs.
  const entryCounts = floorCounts.map((count) => new Array<number>(count).fill(0));
  entryCounts[0]![0]! += 1; // the surface door — see Dungeon.entrance

  const stairs: { upper: FloorIndex; lower: FloorIndex }[] = [];

  for (let level = 1; level < levelCount; level++) {
    for (let floor = 0; floor < floorCounts[level]!; floor++) {
      const target = Math.floor(Math.random() * floorCounts[level - 1]!);
      stairs.push({ upper: { level: level - 1, floor: target }, lower: { level, floor } });
      entryCounts[level - 1]![target]!++;
      entryCounts[level]![floor]!++;
    }
  }

  const levels = floorCounts.map((count, level) => {
    const size = sizes[level]!;
    const density = profile.densityAt(depths[level]!, size);
    return Array.from({ length: count }, (_, floor) => generateFloor(size, tileSet, density, entryCounts[level]![floor]!));
  });

  // Hand out each floor's entries to its stairs in order, so every entry of
  // every floor belongs to exactly one connection.
  const nextEntry = floorCounts.map((count) => new Array<number>(count).fill(0));
  const takeEntry = ({ level, floor }: FloorIndex): EntryRef => {
    const entry = nextEntry[level]![floor]!;
    nextEntry[level]![floor]! += 1;
    return { level, floor, entry };
  };

  const connections = stairs.map(({ upper, lower }) => ({ from: takeEntry(upper), to: takeEntry(lower) }));
  const entrance = takeEntry({ level: 0, floor: 0 });

  return { difficulty, levels, connections, entrance };
};

interface FloorIndex {
  level: number;
  floor: number;
}
