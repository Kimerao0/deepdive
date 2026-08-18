export type TileSet =
  | "cave"
  | "castle"
  | "forest"
  | "desert"
  | "ice"
  | "volcano"
  | "city"
  | "temple"
  | "labyrinth"
  | "swamp"
  | "mountain"
  | "sky"
  | "jungle"
  | "ruins"
  | "crypt"
  | "sewer"
  | "mine";

export interface Coordinates {
  x: number;
  y: number;
}

export type Size = "small" | "medium" | "large" | "huge";

export type RoomShape = "chaotic" | "organic" | "compact" | "blocky";

export type FloorDensity = "sparse" | "normal" | "dense";

export type Difficulty = "easy" | "medium" | "hard";
