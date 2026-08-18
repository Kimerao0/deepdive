import { getNeighbors, toKey } from "#coordinates/index";
import type { Coordinates, RoomShape, Size, TileSet } from "#dungeon/types";

export interface Tile {
  position: Coordinates;
  isEntrance: boolean;
}

export interface Room {
  tileSet: TileSet;
  tiles: Tile[];
}

export const generateRoom = (entrances: Coordinates[], tileSet: TileSet, size: Size, shape: RoomShape, alreadyOccupiedCoordinates: Coordinates[]): Room => {
  if (entrances.length === 0) {
    throw new Error("At least one entrance is required to generate a room.");
  }

  const occupied = new Set(alreadyOccupiedCoordinates.map(toKey));
  const entranceKeys = new Set(entrances.map(toKey));

  const spine = buildSpine(entrances, occupied);
  const grown = growToSize(spine, occupied, getTotalTiles(size), shape);
  const positions = fillEnclosedCells(grown, occupied);

  return {
    tileSet,
    tiles: positions.map((position) => ({ position, isEntrance: entranceKeys.has(toKey(position)) })),
  };
};

// Spine: connect every entrance, even when that exceeds the size budget —
// a room with an unreachable entrance is broken no matter its size.
const buildSpine = (entrances: Coordinates[], occupied: Set<string>): Coordinates[] => {
  const startingEntrance = entrances[Math.floor(Math.random() * entrances.length)]!;
  const positions: Coordinates[] = [startingEntrance];
  const keys = new Set([toKey(startingEntrance)]);

  for (const entrance of entrances) {
    if (keys.has(toKey(entrance))) continue;

    for (const position of findPath(positions, entrance, occupied)) {
      const key = toKey(position);
      if (keys.has(key)) continue;
      keys.add(key);
      positions.push(position);
    }
  }

  return positions;
};

// The exponent applied to a frontier cell's room-neighbor count (1..4) when
// weighting the growth pick: 0 is uniform, higher values fill concave pockets
// before extending fingers, which straightens walls.
const SHAPE_EXPONENTS: Record<RoomShape, number> = {
  chaotic: 0,
  organic: 1,
  compact: 3,
  blocky: 8,
};

// Flesh: spend whatever budget the spine left by growing the frontier — the
// free cells touching the room — one weighted pick at a time.
const growToSize = (spine: Coordinates[], occupied: Set<string>, tilesTotal: number, shape: RoomShape): Coordinates[] => {
  const positions = [...spine];
  const keys = new Set(positions.map(toKey));
  const exponent = SHAPE_EXPONENTS[shape];

  const frontier = new Map<string, Coordinates>();
  const addFreeNeighborsToFrontier = (position: Coordinates) => {
    for (const neighbor of getNeighbors(position)) {
      const key = toKey(neighbor);
      if (!keys.has(key) && !occupied.has(key)) frontier.set(key, neighbor);
    }
  };
  for (const position of positions) addFreeNeighborsToFrontier(position);

  while (positions.length < tilesTotal && frontier.size > 0) {
    const newPosition = pickWeighted([...frontier.values()], (cell) => countRoomNeighbors(cell, keys) ** exponent);
    frontier.delete(toKey(newPosition));
    keys.add(toKey(newPosition));
    positions.push(newPosition);
    addFreeNeighborsToFrontier(newPosition);
  }

  return positions;
};

const countRoomNeighbors = (cell: Coordinates, keys: Set<string>): number => {
  return getNeighbors(cell).filter((neighbor) => keys.has(toKey(neighbor))).length;
};

const pickWeighted = <T>(items: T[], getWeight: (item: T) => number): T => {
  const weights = items.map(getWeight);
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  let remaining = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    remaining -= weights[i]!;
    if (remaining <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
};

// A hole is an empty cell that cannot reach the outside of the room. Flood
// the outside first (from a ring around the bounding box), then claim every
// cell the flood never touched. Occupied cells block nothing on the way in
// and stay unclaimed: an enclosed one is a wall inside the room, not a hole.
const fillEnclosedCells = (positions: Coordinates[], occupied: Set<string>): Coordinates[] => {
  const keys = new Set(positions.map(toKey));

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { x, y } of positions) {
    minX = Math.min(minX, x - 1);
    maxX = Math.max(maxX, x + 1);
    minY = Math.min(minY, y - 1);
    maxY = Math.max(maxY, y + 1);
  }

  const outside = new Set<string>();
  const queue: Coordinates[] = [];
  const visit = (cell: Coordinates) => {
    const key = toKey(cell);
    if (outside.has(key) || keys.has(key)) return;
    outside.add(key);
    queue.push(cell);
  };

  for (let x = minX; x <= maxX; x++) {
    visit({ x, y: minY });
    visit({ x, y: maxY });
  }
  for (let y = minY; y <= maxY; y++) {
    visit({ x: minX, y });
    visit({ x: maxX, y });
  }

  for (let head = 0; head < queue.length; head++) {
    for (const neighbor of getNeighbors(queue[head]!)) {
      if (neighbor.x < minX || neighbor.x > maxX || neighbor.y < minY || neighbor.y > maxY) continue;
      visit(neighbor);
    }
  }

  const filled = [...positions];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const key = toKey({ x, y });
      if (!keys.has(key) && !outside.has(key) && !occupied.has(key)) filled.push({ x, y });
    }
  }

  return filled;
};

const getTotalTiles = (size: Size): number => {
  const sizeMapping: Record<Size, number> = {
    small: 16,
    medium: 32,
    large: 64,
    huge: 128,
  };

  return sizeMapping[size];
};

// The grid is unbounded, so a BFS toward an entrance walled in by occupied
// tiles would flood forever; the cap turns that into an error instead.
const MAX_VISITED_CELLS = 10_000;

// BFS seeded with every room tile at once: the first time the target is
// reached, the reconstructed path starts from the nearest room tile and is
// the shortest one. Returns only the positions not already part of the room.
const findPath = (from: Coordinates[], target: Coordinates, occupied: Set<string>): Coordinates[] => {
  const targetKey = toKey(target);
  const cameFrom = new Map<string, Coordinates | null>();
  const queue: Coordinates[] = [];

  for (const position of from) {
    cameFrom.set(toKey(position), null);
    queue.push(position);
  }

  const seedCount = queue.length;

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;

    if (toKey(current) === targetKey) {
      const path: Coordinates[] = [];
      let step: Coordinates | null = current;
      while (step !== null) {
        path.push(step);
        step = cameFrom.get(toKey(step)) ?? null;
      }
      return path.reverse().slice(1);
    }

    if (cameFrom.size - seedCount > MAX_VISITED_CELLS) break;

    for (const neighbor of getNeighbors(current)) {
      const key = toKey(neighbor);
      if (cameFrom.has(key) || occupied.has(key)) continue;
      cameFrom.set(key, current);
      queue.push(neighbor);
    }
  }

  throw new Error(`Entrance at ${targetKey} is unreachable from the room.`);
};
