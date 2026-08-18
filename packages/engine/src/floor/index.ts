import { getSurroundingCells } from "#coordinates/index";
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

// Internally the floor works on a numeric lattice of (gridSize + 2)² cells —
// the grid plus a one-cell ring outside it — so the padding of edge rooms
// stays representable and the hot BFS loops avoid string keys.
const latticeWidth = (gridSize: number): number => gridSize + 2;
const toIndex = ({ x, y }: Coordinates, width: number): number => x + 1 + (y + 1) * width;
const toCell = (index: number, width: number): Coordinates => ({ x: (index % width) - 1, y: Math.floor(index / width) - 1 });
const deltasOf = (width: number): number[] => [1, -1, width, -width];

export const generateFloor = (size: Size, tileSet: TileSet, density: FloorDensity, entryCount: number): Floor => {
  if (entryCount < 1) {
    throw new Error("At least one entry is required to generate a floor.");
  }

  const gridSize = FLOOR_SIZES[size];
  const width = latticeWidth(gridSize);

  const { placed, roomGrid } = placeRooms(gridSize, tileSet, density);
  const { labels, mainLabel, mainCells } = labelFreePockets(roomGrid, placed, gridSize);
  const { rooms, network } = connectRooms(placed, labels, mainLabel, gridSize);
  const entries = placeEntries(network, mainCells, labels, mainLabel, gridSize, entryCount);

  return {
    gridSize,
    rooms,
    corridors: network.list.map((index) => toCell(index, width)),
    entries: entries.map((index) => toCell(index, width)),
  };
};

interface PlacedRoom {
  room: Room;
  tileIndexes: Set<number>;
}

// Rooms grow from a random seed cell; everything already placed plus a one-cell
// pad around it is handed to generateRoom as occupied, so rooms never touch.
// A ring just outside the floor keeps growth inside the square.
const placeRooms = (gridSize: number, tileSet: TileSet, density: FloorDensity): { placed: PlacedRoom[]; roomGrid: Uint8Array } => {
  const width = latticeWidth(gridSize);
  const blockedGrid = new Uint8Array(width * width);
  const blockedList: Coordinates[] = [];
  const roomGrid = new Uint8Array(width * width);
  const block = (cell: Coordinates) => {
    const index = toIndex(cell, width);
    if (blockedGrid[index]) return;
    blockedGrid[index] = 1;
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
    if (blockedGrid[toIndex(seed, width)]) continue;

    const room = generateRoom([seed], tileSet, pickRandom(ROOM_SIZES), pickRandom(ROOM_SHAPES), blockedList);

    const tileIndexes = new Set<number>();
    for (const tile of room.tiles) {
      tileIndexes.add(toIndex(tile.position, width));
      roomGrid[toIndex(tile.position, width)] = 1;
      block(tile.position);
      for (const cell of getSurroundingCells(tile.position)) block(cell);
    }

    placed.push({ room, tileIndexes });
  }

  return { placed, roomGrid };
};

// Free cells fragment into pockets when rooms and walls seal regions off.
// Label each pocket, then crown the one adjacent to the most rooms as the
// floor's main area: corridors, entries, and surviving rooms all live there.
const labelFreePockets = (roomGrid: Uint8Array, placed: PlacedRoom[], gridSize: number) => {
  const width = latticeWidth(gridSize);
  const deltas = deltasOf(width);
  const labels = new Int32Array(width * width);
  let nextLabel = 0;

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const start = toIndex({ x, y }, width);
      if (labels[start] !== 0 || roomGrid[start] === 1) continue;

      nextLabel += 1;
      labels[start] = nextLabel;
      const queue = [start];
      for (let head = 0; head < queue.length; head++) {
        for (const delta of deltas) {
          const neighbor = queue[head]! + delta;
          if (labels[neighbor] !== 0 || roomGrid[neighbor] === 1 || !isInsideGrid(neighbor, width)) continue;
          labels[neighbor] = nextLabel;
          queue.push(neighbor);
        }
      }
    }
  }

  const votes = new Map<number, number>();
  for (const { tileIndexes } of placed) {
    const seen = new Set<number>();
    for (const index of tileIndexes) {
      for (const delta of deltas) {
        const label = labels[index + delta]!;
        if (label !== 0) seen.add(label);
      }
    }
    for (const label of seen) votes.set(label, (votes.get(label) ?? 0) + 1);
  }

  let mainLabel = 1;
  let bestVotes = -1;
  for (const [label, count] of votes) {
    if (count > bestVotes) {
      bestVotes = count;
      mainLabel = label;
    }
  }

  const mainCells: number[] = [];
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const index = toIndex({ x, y }, width);
      if (labels[index] === mainLabel) mainCells.push(index);
    }
  }

  return { labels, mainLabel, mainCells };
};

interface CorridorNetwork {
  grid: Uint8Array;
  list: number[];
}

const addToNetwork = (network: CorridorNetwork, index: number) => {
  if (network.grid[index]) return;
  network.grid[index] = 1;
  network.list.push(index);
};

// Corridors form one network grown room by room inside the main area: each
// room is reached by the shortest path from the existing network, and the
// room tile where the path lands becomes that room's entrance. A room with
// no cell on the main area is sealed inside another pocket: it is dropped.
const connectRooms = (placed: PlacedRoom[], labels: Int32Array, mainLabel: number, gridSize: number) => {
  const width = latticeWidth(gridSize);
  const deltas = deltasOf(width);
  const touchesMain = (tileIndexes: Set<number>): boolean => {
    for (const index of tileIndexes) {
      for (const delta of deltas) {
        if (labels[index + delta] === mainLabel) return true;
      }
    }
    return false;
  };

  const survivors = placed.filter(({ tileIndexes }) => touchesMain(tileIndexes));
  const [first, ...rest] = survivors;
  if (!first) throw new Error("A floor needs at least one room next to its main area.");

  const network: CorridorNetwork = { grid: new Uint8Array(width * width), list: [] };

  // Bootstrap the network with the first room's doorstep: its first tile
  // border cell that sits on the main area.
  let doorstep = -1;
  let firstDoor = -1;
  for (const index of first.tileIndexes) {
    for (const delta of deltas) {
      if (labels[index + delta] === mainLabel) {
        doorstep = index + delta;
        firstDoor = index;
        break;
      }
    }
    if (doorstep !== -1) break;
  }
  addToNetwork(network, doorstep);

  const rooms: Room[] = [withDoor(first.room, firstDoor, width)];

  for (const { room, tileIndexes } of rest) {
    const isNextToRoom = (index: number): boolean => deltas.some((delta) => tileIndexes.has(index + delta));
    const found = findNetworkPath(network.list, isNextToRoom, labels, mainLabel, gridSize);
    if (!found) throw new Error("A room touching the main area must be reachable from the network.");

    for (const index of found.path) addToNetwork(network, index);
    const door = deltas.map((delta) => found.landing + delta).find((index) => tileIndexes.has(index))!;
    rooms.push(withDoor(room, door, width));
  }

  return { rooms, network };
};

// Entries are random cells of the main area wired into the network by a
// corridor path, so an entry always sits on a corridor tile and every entry
// and room stays mutually reachable.
const placeEntries = (network: CorridorNetwork, mainCells: number[], labels: Int32Array, mainLabel: number, gridSize: number, entryCount: number): number[] => {
  if (mainCells.length < entryCount) {
    throw new Error("Not enough free space to place all floor entries.");
  }

  const entries: number[] = [];
  const taken = new Set<number>();

  for (let i = 0; i < entryCount; i++) {
    let entry = -1;
    while (entry === -1) {
      const candidate = mainCells[randomInt(mainCells.length)]!;
      if (!taken.has(candidate)) entry = candidate;
    }

    const found = findNetworkPath(network.list, (index) => index === entry, labels, mainLabel, gridSize);
    if (!found) throw new Error("An entry on the main area must be reachable from the network.");

    for (const index of found.path) addToNetwork(network, index);
    taken.add(entry);
    entries.push(entry);
  }

  return entries;
};

// BFS from the whole network at once across the main area; parents are
// tracked per cell (-1 unvisited, -2 seed) to rebuild the shortest path.
// Returns the landing (the first matching cell, which may be a seed) and the
// path to it (seeds excluded, landing included), or null if unreachable.
const findNetworkPath = (seeds: number[], isTarget: (index: number) => boolean, labels: Int32Array, mainLabel: number, gridSize: number): { path: number[]; landing: number } | null => {
  const width = latticeWidth(gridSize);
  const deltas = deltasOf(width);
  const parents = new Int32Array(width * width).fill(-1);
  const queue: number[] = [];

  for (const seed of seeds) {
    parents[seed] = -2;
    queue.push(seed);
  }

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;

    if (isTarget(current)) {
      const path: number[] = [];
      let step = current;
      while (parents[step] !== -2) {
        path.push(step);
        step = parents[step]!;
      }
      return { path: path.reverse(), landing: current };
    }

    for (const delta of deltas) {
      const neighbor = current + delta;
      if (parents[neighbor] !== -1 || labels[neighbor] !== mainLabel) continue;
      parents[neighbor] = current;
      queue.push(neighbor);
    }
  }

  return null;
};

// On a floor, a room's entrance is the tile its corridor lands on — the seed
// used during generation loses the flag.
const withDoor = (room: Room, doorIndex: number, width: number): Room => ({
  tileSet: room.tileSet,
  tiles: room.tiles.map((tile) => ({ position: tile.position, isEntrance: toIndex(tile.position, width) === doorIndex })),
});

const isInsideGrid = (index: number, width: number): boolean => {
  const x = index % width;
  const y = Math.floor(index / width);
  return x > 0 && x < width - 1 && y > 0 && y < width - 1;
};

const randomInt = (max: number): number => Math.floor(Math.random() * max);

const pickRandom = <T>(items: T[]): T => items[randomInt(items.length)]!;
