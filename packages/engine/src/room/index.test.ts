import { describe, expect, it } from "vitest";
import { generateRoom } from "#room/index";
import type { Coordinates, RoomShape } from "#dungeon/types";

const SHAPES: RoomShape[] = ["chaotic", "organic", "compact", "blocky"];

const toKey = ({ x, y }: Coordinates): string => `${x},${y}`;

const getNeighbors = ({ x, y }: Coordinates): Coordinates[] => [
  { x: x + 1, y },
  { x: x - 1, y },
  { x, y: y + 1 },
  { x, y: y - 1 },
];

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

// Flood the empty cells from outside the bounding box; any empty, unoccupied
// cell the flood never reaches is a hole enclosed by the room.
const countHoles = (positions: Coordinates[], occupied: Coordinates[]): number => {
  const keys = new Set(positions.map(toKey));
  const occupiedKeys = new Set(occupied.map(toKey));
  const xs = positions.map(({ x }) => x);
  const ys = positions.map(({ y }) => y);
  const minX = Math.min(...xs) - 1;
  const maxX = Math.max(...xs) + 1;
  const minY = Math.min(...ys) - 1;
  const maxY = Math.max(...ys) + 1;

  const outside = new Set([toKey({ x: minX, y: minY })]);
  const queue: Coordinates[] = [{ x: minX, y: minY }];
  for (let head = 0; head < queue.length; head++) {
    for (const neighbor of getNeighbors(queue[head]!)) {
      if (neighbor.x < minX || neighbor.x > maxX || neighbor.y < minY || neighbor.y > maxY) continue;
      if (keys.has(toKey(neighbor)) || outside.has(toKey(neighbor))) continue;
      outside.add(toKey(neighbor));
      queue.push(neighbor);
    }
  }

  let holes = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const key = toKey({ x, y });
      if (!keys.has(key) && !outside.has(key) && !occupiedKeys.has(key)) holes++;
    }
  }
  return holes;
};

const boundingBoxFillRatio = (positions: Coordinates[]): number => {
  const xs = positions.map(({ x }) => x);
  const ys = positions.map(({ y }) => y);
  const area = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
  return positions.length / area;
};

describe("generateRoom", () => {
  it("should throw when no entrance is given", () => {
    expect(() => generateRoom([], "castle", "small", "organic", [])).toThrow(/entrance/);
  });

  it("should include every entrance and flag exactly the entrance tiles", () => {
    const entrances = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8 },
    ];
    const room = generateRoom(entrances, "castle", "small", "organic", []);
    const entranceKeys = new Set(entrances.map(toKey));

    for (const entrance of entrances) {
      expect(room.tiles.some((tile) => toKey(tile.position) === toKey(entrance))).toBe(true);
    }
    for (const tile of room.tiles) {
      expect(tile.isEntrance).toBe(entranceKeys.has(toKey(tile.position)));
    }
  });

  it("should route around occupied tiles and never claim them", () => {
    const wall: Coordinates[] = [];
    for (let y = -10; y <= 10; y++) wall.push({ x: 5, y });
    const entrances = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];

    for (let run = 0; run < 20; run++) {
      const room = generateRoom(entrances, "castle", "small", "chaotic", wall);
      const keys = new Set(room.tiles.map((tile) => toKey(tile.position)));

      for (const cell of wall) expect(keys.has(toKey(cell))).toBe(false);
      for (const entrance of entrances) expect(keys.has(toKey(entrance))).toBe(true);
    }
  });

  it("should produce a 4-connected room without duplicates or holes, for every shape", () => {
    const entrances = [
      { x: 0, y: 0 },
      { x: 12, y: 12 },
    ];

    for (const shape of SHAPES) {
      for (let run = 0; run < 15; run++) {
        const room = generateRoom(entrances, "castle", "huge", shape, []);
        const positions = room.tiles.map((tile) => tile.position);
        const keys = new Set(positions.map(toKey));

        expect(keys.size).toBe(positions.length);
        expect(isConnected(positions)).toBe(true);
        expect(countHoles(positions, [])).toBe(0);
      }
    }
  });

  it("should reach at least the size target when space allows", () => {
    const room = generateRoom([{ x: 0, y: 0 }], "castle", "medium", "organic", []);
    expect(room.tiles.length).toBeGreaterThanOrEqual(32);
  });

  it("should exceed the size target when connecting the entrances requires it", () => {
    const room = generateRoom(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
      "castle",
      "small",
      "organic",
      [],
    );
    expect(room.tiles.length).toBeGreaterThanOrEqual(41);
  });

  it("should stop below the size target when the room is boxed in", () => {
    const box = [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
    ];
    const room = generateRoom([{ x: 0, y: 0 }], "castle", "small", "organic", box);
    expect(room.tiles.length).toBe(1);
  });

  it("should throw when an entrance cannot be reached", () => {
    const target = { x: 50, y: 50 };
    const box = [
      { x: 49, y: 50 },
      { x: 51, y: 50 },
      { x: 50, y: 49 },
      { x: 50, y: 51 },
    ];
    expect(() => generateRoom([{ x: 0, y: 0 }, target], "castle", "small", "organic", box)).toThrow(/unreachable/);
  });

  it("should grow blockier rooms more compact than chaotic ones", () => {
    const averageFillRatio = (shape: RoomShape): number => {
      let sum = 0;
      for (let run = 0; run < 20; run++) {
        const room = generateRoom([{ x: 0, y: 0 }], "castle", "huge", shape, []);
        sum += boundingBoxFillRatio(room.tiles.map((tile) => tile.position));
      }
      return sum / 20;
    };

    expect(averageFillRatio("blocky")).toBeGreaterThan(averageFillRatio("chaotic"));
  });
});
