export interface Coordinates {
  x: number;
  y: number;
}

export const toKey = ({ x, y }: Coordinates): string => `${x},${y}`;

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
