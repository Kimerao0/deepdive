import { describe, expect, it } from "vitest";
import { getNeighbors, toKey } from "#coordinates/index";
import { generateFloor } from "#floor/index";
import type { Coordinates, FloorDensity, Size } from "#dungeon/types";

const isConnected = (positions: Coordinates[]): boolean => {
  const keys = new Set(positions.map(toKey));
  const seen = new Set([toKey(positions[0]!)]);
  const queue = [positions[0]!];

  for (let head = 0; head < queue.length; head++) {
    for (const neighbor of getNeighbors(queue[head]!)) {
      if (keys.has(toKey(neighbor)) && !seen.has(toKey(neighbor))) {
        seen.add(toKey(neighbor));
        queue.push(neighbor);
      }
    }
  }

  return seen.size === positions.length;
};

describe("generateFloor", () => {
  it("should throw when fewer than one entry is requested", () => {
    expect(() => generateFloor("small", "castle", "normal", 0)).toThrow(/entry/);
  });

  it("should map every floor size to its square grid", () => {
    const expected: Record<Size, number> = { small: 50, medium: 100, large: 150, huge: 200 };
    for (const [size, gridSize] of Object.entries(expected) as [Size, number][]) {
      expect(generateFloor(size, "castle", "sparse", 1).gridSize).toBe(gridSize);
    }
  });

  it("should keep every tile inside the floor bounds", () => {
    for (let run = 0; run < 5; run++) {
      const floor = generateFloor("small", "castle", "dense", 2);
      const roomTiles = floor.rooms.flatMap((room) => room.tiles.map((tile) => tile.position));

      for (const cell of [...roomTiles, ...floor.corridors, ...floor.entries]) {
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.x).toBeLessThan(floor.gridSize);
        expect(cell.y).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeLessThan(floor.gridSize);
      }
    }
  });

  it("should never overlap rooms with each other or with corridors", () => {
    for (let run = 0; run < 5; run++) {
      const floor = generateFloor("medium", "castle", "dense", 2);
      const roomTiles = floor.rooms.flatMap((room) => room.tiles.map((tile) => tile.position));
      const roomKeys = new Set(roomTiles.map(toKey));

      expect(roomKeys.size).toBe(roomTiles.length);
      for (const cell of floor.corridors) {
        expect(roomKeys.has(toKey(cell))).toBe(false);
      }
    }
  });

  it("should place the requested number of distinct entries, each on a corridor tile", () => {
    for (const entryCount of [1, 3]) {
      const floor = generateFloor("medium", "castle", "normal", entryCount);
      const corridorKeys = new Set(floor.corridors.map(toKey));
      const entryKeys = new Set(floor.entries.map(toKey));
      const roomKeys = new Set(floor.rooms.flatMap((room) => room.tiles.map((tile) => toKey(tile.position))));

      expect(floor.entries.length).toBe(entryCount);
      expect(entryKeys.size).toBe(entryCount);
      for (const entry of floor.entries) {
        expect(corridorKeys.has(toKey(entry))).toBe(true);
        expect(roomKeys.has(toKey(entry))).toBe(false);
      }
    }
  });

  it("should give every room exactly one entrance, adjacent to a corridor", () => {
    for (let run = 0; run < 5; run++) {
      const floor = generateFloor("medium", "castle", "normal", 1);
      const corridorKeys = new Set(floor.corridors.map(toKey));

      expect(floor.rooms.length).toBeGreaterThanOrEqual(1);
      for (const room of floor.rooms) {
        const doors = room.tiles.filter((tile) => tile.isEntrance);
        expect(doors.length).toBe(1);
        expect(getNeighbors(doors[0]!.position).some((neighbor) => corridorKeys.has(toKey(neighbor)))).toBe(true);
      }
    }
  });

  it("should connect the whole floor into a single component", () => {
    for (let run = 0; run < 5; run++) {
      const floor = generateFloor("medium", "castle", "dense", 3);
      const roomTiles = floor.rooms.flatMap((room) => room.tiles.map((tile) => tile.position));

      expect(isConnected([...roomTiles, ...floor.corridors])).toBe(true);
    }
  });

  it("should fill dense floors with more room tiles than sparse ones on average", () => {
    const averageTiles = (density: FloorDensity): number => {
      let sum = 0;
      for (let run = 0; run < 5; run++) {
        sum += generateFloor("medium", "castle", density, 1).rooms.flatMap((room) => room.tiles).length;
      }
      return sum / 5;
    };

    expect(averageTiles("dense")).toBeGreaterThan(averageTiles("sparse"));
  });
});
