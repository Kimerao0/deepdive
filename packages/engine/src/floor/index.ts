import { getNeighbors, getSurroundingCells, toKey } from "#coordinates/index";
import { generateRoom, type Room } from "#room/index";
import type { Coordinates, FloorDensity, RoomShape, Size, TileSet } from "#dungeon/types";

export interface Floor {
  gridSize: number;
  rooms: Room[];
  corridors: Coordinates[];
  entries: Coordinates[];
}

const FLOOR_SIZES: Record<Size, number> = {
  small: 50,
  medium: 100,
  large: 150,
  huge: 200,
};

// Density divides the floor area into placement attempts; attempts landing on
// or next to an existing room are discarded, so the fill self-limits.
const DENSITY_DIVISORS: Record<FloorDensity, number> = {
  sparse: 1000,
  normal: 400,
  dense: 150,
};

const ROOM_SIZES: Size[] = ["small", "medium", "large", "huge"];
const ROOM_SHAPES: RoomShape[] = ["chaotic", "organic", "compact", "blocky"];

const MAX_ENTRY_ATTEMPTS = 50;

export const generateFloor = (size: Size, tileSet: TileSet, density: FloorDensity, entryCount: number): Floor => {
  if (entryCount < 1) {
    throw new Error("At least one entry is required to generate a floor.");
  }

  const gridSize = FLOOR_SIZES[size];
  const placed = placeRooms(gridSize, tileSet, density);
  const { rooms, roomKeys, corridors, corridorKeys } = connectRooms(placed, gridSize);
  const entries = placeEntries(corridors, corridorKeys, roomKeys, gridSize, entryCount);

  return { gridSize, rooms, corridors, entries };
};

interface PlacedRoom {
  room: Room;
  keys: Set<string>;
}

// Rooms grow from a random seed cell; everything already placed plus a one-cell
// pad around it is handed to generateRoom as occupied, so rooms never touch.
// A ring just outside the floor keeps growth inside the square.
const placeRooms = (gridSize: number, tileSet: TileSet, density: FloorDensity): PlacedRoom[] => {
  const blockedKeys = new Set<string>();
  const blockedList: Coordinates[] = [];
  const block = (cell: Coordinates) => {
    const key = toKey(cell);
    if (blockedKeys.has(key)) return;
    blockedKeys.add(key);
    blockedList.push(cell);
  };

  for (let i = -1; i <= gridSize; i++) {
    block({ x: i, y: -1 });
    block({ x: i, y: gridSize });
    block({ x: -1, y: i });
    block({ x: gridSize, y: i });
  }

  const placed: PlacedRoom[] = [];
  const attempts = Math.max(1, Math.round((gridSize * gridSize) / DENSITY_DIVISORS[density]));

  for (let attempt = 0; attempt < attempts; attempt++) {
    const seed = { x: randomInt(gridSize), y: randomInt(gridSize) };
    if (blockedKeys.has(toKey(seed))) continue;

    const room = generateRoom([seed], tileSet, pickRandom(ROOM_SIZES), pickRandom(ROOM_SHAPES), blockedList);

    for (const tile of room.tiles) {
      block(tile.position);
      for (const cell of getSurroundingCells(tile.position)) block(cell);
    }

    placed.push({ room, keys: new Set(room.tiles.map((tile) => toKey(tile.position))) });
  }

  return placed;
};

// Corridors form one network grown room by room: each room is reached by the
// shortest path from the existing network, and the room tile where the path
// lands becomes that room's entrance. A room no path can reach sits in a
// pocket sealed by other rooms: it is dropped and its cells are freed.
const connectRooms = (placed: PlacedRoom[], gridSize: number) => {
  const roomKeys = new Set(placed.flatMap(({ keys }) => [...keys]));
  const corridorKeys = new Set<string>();
  const corridors: Coordinates[] = [];
  const addCorridor = (cell: Coordinates) => {
    const key = toKey(cell);
    if (corridorKeys.has(key)) return;
    corridorKeys.add(key);
    corridors.push(cell);
  };

  const rooms: Room[] = [];
  const [first, ...rest] = placed;
  if (!first) throw new Error("A floor needs at least one room.");

  // Bootstrap the network with the first room's doorstep: any free in-bounds
  // cell next to one of its tiles.
  let doorstep: { cell: Coordinates; doorKey: string } | undefined;
  for (const tile of first.room.tiles) {
    const free = getNeighbors(tile.position).find((cell) => isInBounds(cell, gridSize) && !roomKeys.has(toKey(cell)));
    if (free) {
      doorstep = { cell: free, doorKey: toKey(tile.position) };
      break;
    }
  }
  if (!doorstep) throw new Error("The first room has no free cell around it.");

  addCorridor(doorstep.cell);
  rooms.push(withDoor(first.room, doorstep.doorKey));

  for (const { room, keys } of rest) {
    const found = findCorridorPath(corridors, (cell) => getNeighbors(cell).some((neighbor) => keys.has(toKey(neighbor))), roomKeys, gridSize);

    if (!found) {
      for (const key of keys) roomKeys.delete(key);
      continue;
    }

    for (const cell of found.path) addCorridor(cell);
    const door = getNeighbors(found.landing).find((neighbor) => keys.has(toKey(neighbor)))!;
    rooms.push(withDoor(room, toKey(door)));
  }

  return { rooms, roomKeys, corridors, corridorKeys };
};

// Entries are random free cells wired into the network by a corridor path, so
// an entry always sits on a corridor tile. A cell in a sealed pocket is
// unreachable: re-roll, and after too many misses reuse a network tile.
const placeEntries = (corridors: Coordinates[], corridorKeys: Set<string>, roomKeys: Set<string>, gridSize: number, entryCount: number): Coordinates[] => {
  const entries: Coordinates[] = [];
  const entryKeys = new Set<string>();
  const addCorridor = (cell: Coordinates) => {
    const key = toKey(cell);
    if (corridorKeys.has(key)) return;
    corridorKeys.add(key);
    corridors.push(cell);
  };

  for (let i = 0; i < entryCount; i++) {
    let entry: Coordinates | undefined;

    for (let attempt = 0; attempt < MAX_ENTRY_ATTEMPTS && !entry; attempt++) {
      const cell = { x: randomInt(gridSize), y: randomInt(gridSize) };
      const key = toKey(cell);
      if (roomKeys.has(key) || entryKeys.has(key)) continue;

      const found = findCorridorPath(corridors, (candidate) => toKey(candidate) === key, roomKeys, gridSize);
      if (!found) continue;

      for (const pathCell of found.path) addCorridor(pathCell);
      entry = cell;
    }

    if (!entry) {
      entry = corridors.find((cell) => !entryKeys.has(toKey(cell)));
      if (!entry) throw new Error("Not enough corridor space to place all floor entries.");
    }

    entryKeys.add(toKey(entry));
    entries.push(entry);
  }

  return entries;
};

// BFS from the whole network at once over non-room, in-bounds cells; returns
// the landing (the first matching cell, which may be a seed) and the shortest
// path to it (seeds excluded), or null if unreachable.
const findCorridorPath = (seeds: Coordinates[], isTarget: (cell: Coordinates) => boolean, roomKeys: Set<string>, gridSize: number): { path: Coordinates[]; landing: Coordinates } | null => {
  const cameFrom = new Map<string, Coordinates | null>();
  const queue: Coordinates[] = [];
  for (const cell of seeds) {
    cameFrom.set(toKey(cell), null);
    queue.push(cell);
  }

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;

    if (isTarget(current)) {
      const path: Coordinates[] = [];
      let step: Coordinates | null = current;
      while (step !== null) {
        path.push(step);
        step = cameFrom.get(toKey(step)) ?? null;
      }
      return { path: path.reverse().slice(1), landing: current };
    }

    for (const neighbor of getNeighbors(current)) {
      const key = toKey(neighbor);
      if (cameFrom.has(key) || roomKeys.has(key) || !isInBounds(neighbor, gridSize)) continue;
      cameFrom.set(key, current);
      queue.push(neighbor);
    }
  }

  return null;
};

// On a floor, a room's entrance is the tile its corridor lands on — the seed
// used during generation loses the flag.
const withDoor = (room: Room, doorKey: string): Room => ({
  tileSet: room.tileSet,
  tiles: room.tiles.map((tile) => ({ position: tile.position, isEntrance: toKey(tile.position) === doorKey })),
});

const isInBounds = ({ x, y }: Coordinates, gridSize: number): boolean => x >= 0 && x < gridSize && y >= 0 && y < gridSize;

const randomInt = (max: number): number => Math.floor(Math.random() * max);

const pickRandom = <T>(items: T[]): T => items[randomInt(items.length)]!;
