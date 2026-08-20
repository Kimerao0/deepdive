import { step, toKey, type Coordinates } from "#coordinates/index";
import type { Floor } from "#dungeon/floor/index";
import type { Action } from "#world/index";

export type ViewTileKind = "room" | "door" | "corridor" | "entry" | "void";

export interface FloorView {
  tiles: ViewTileKind[][];
  partyPosition: Coordinates;
}

// Everything the party can see: the square window of radius visibilityRadius
// centred on it, row-major, so tiles[row][column] counts y then x. The square
// is the rule — the round torchlight is a rendering effect over cells the
// party legitimately sees.
export const getFloorView = (floor: Floor, partyPosition: Coordinates, visibilityRadius: number): FloorView => {
  const known = knownCells(floor);
  const tiles: ViewTileKind[][] = [];

  for (let y = partyPosition.y - visibilityRadius; y <= partyPosition.y + visibilityRadius; y++) {
    const row: ViewTileKind[] = [];
    for (let x = partyPosition.x - visibilityRadius; x <= partyPosition.x + visibilityRadius; x++) {
      // A miss covers both the rock inside the floor and everything off it.
      row.push(known.get(toKey({ x, y })) ?? "void");
    }
    tiles.push(row);
  }

  return { tiles, partyPosition };
};

// Void is the only kind a party cannot stand on. Stated over kinds so the
// client can answer walkability from a view alone, with no floor in hand.
export const isWalkableKind = (kind: ViewTileKind): boolean => kind !== "void";

// The kind at an absolute position, or undefined when that cell lies outside
// the window — the party knows nothing about it.
export const getViewTile = (view: FloorView, { x, y }: Coordinates): ViewTileKind | undefined => {
  const radius = (view.tiles.length - 1) / 2;
  const row = y - (view.partyPosition.y - radius);
  const column = x - (view.partyPosition.x - radius);

  return view.tiles[row]?.[column];
};

// What the client can tell about an action from the view alone: the party
// moved, the way is blocked, or the target lies outside the window and only
// the server can say. `from` is the party's predicted position, which drifts
// ahead of view.partyPosition while responses are in flight.
//
// `unknown` must never be collapsed into `blocked`: the client does not
// dispatch what it rejects locally, so a wrong `blocked` would swallow a
// legal action instead of merely mispredicting it.
export type Prediction = { outcome: "moved"; position: Coordinates } | { outcome: "blocked" } | { outcome: "unknown" };

export const predictAction = (view: FloorView, from: Coordinates, action: Action): Prediction => {
  const target = step(from, action.direction);
  const kind = getViewTile(view, target);

  if (kind === undefined) return { outcome: "unknown" };
  if (!isWalkableKind(kind)) return { outcome: "blocked" };

  return { outcome: "moved", position: target };
};

// One pass over the floor instead of scanning its arrays per cell. Corridors
// go in first so an entry overwrites the corridor it sits on: the more
// specific fact about a cell wins.
const knownCells = (floor: Floor): Map<string, ViewTileKind> => {
  const known = new Map<string, ViewTileKind>();

  for (const cell of floor.corridors) known.set(toKey(cell), "corridor");
  for (const cell of floor.entries) known.set(toKey(cell), "entry");
  for (const room of floor.rooms) {
    for (const tile of room.tiles) known.set(toKey(tile.position), tile.isEntrance ? "door" : "room");
  }

  return known;
};
