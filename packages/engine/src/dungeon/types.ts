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
