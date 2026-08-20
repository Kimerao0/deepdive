export interface Coordinates {
  x: number;
  y: number;
}

export const toKey = ({ x, y }: Coordinates): string => `${x},${y}`;

export type Direction = "north" | "south" | "east" | "west";

// The grid is drawn with y = 0 as its top row, so north decreases y. This
// table lives here, alone: the server authorises a move and the client
// predicts the same move, and a second copy of it could disagree silently.
const DIRECTION_DELTAS: Record<Direction, Coordinates> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

export const step = ({ x, y }: Coordinates, direction: Direction): Coordinates => {
  const delta = DIRECTION_DELTAS[direction];
  return { x: x + delta.x, y: y + delta.y };
};

export const getNeighbors = ({ x, y }: Coordinates): Coordinates[] => [
  { x: x + 1, y },
  { x: x - 1, y },
  { x, y: y + 1 },
  { x, y: y - 1 },
];

export const getSurroundingCells = ({ x, y }: Coordinates): Coordinates[] => [
  { x: x + 1, y },
  { x: x + 1, y: y + 1 },
  { x, y: y + 1 },
  { x: x - 1, y: y + 1 },
  { x: x - 1, y },
  { x: x - 1, y: y - 1 },
  { x, y: y - 1 },
  { x: x + 1, y: y - 1 },
];
