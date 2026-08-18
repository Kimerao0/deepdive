import type { Coordinates, Size, TileSet } from "#dungeon/types.js";

interface Tile {
  position: Coordinates;
  isEntrance: boolean;
}

interface Room {
  tileSet: TileSet;
  tiles: Tile[];
}

const generateRoom = (entrances: Coordinates[], tileSet: TileSet, size: Size, alreadyOccupiedCoordinates: Coordinates[]): Room => {
  if (entrances.length === 0) {
    throw new Error("At least one entrance is required to generate a room.");
  }

  const tilesTotal = getTotalTiles(size);
  const startingTile = entrances[Math.floor(Math.random() * entrances.length)] || entrances[0]!;
  const roomTiles: Tile[] = [{ position: startingTile, isEntrance: true }];

  for (let i = 0; i < tilesTotal; i++) {
    const lastTile = roomTiles[roomTiles.length - 1];
    if (!lastTile) break;

    // First we need to connect all entrances in the room starting from the first entrance
    if (!areAllEntrancesCovered(entrances, roomTiles)) {
      const nextEntrance = entrances.find((entrance) => !roomTiles.some((tile) => tile.position.x === entrance.x && tile.position.y === entrance.y));

      // We have to add to the roomTiles array a new tile that is adjacent to the lastTile and is going into the direction of the nextEntrance
      if (nextEntrance) {
        const newTile = getNewTileTowardsEntrance(lastTile, nextEntrance);
        if (isFreeTile(newTile.position, alreadyOccupiedCoordinates)) {
          roomTiles.push(newTile);
        }
      }
    }
  }

  return {
    tileSet,
    tiles: roomTiles,
  };
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

const areAllEntrancesCovered = (entrances: Coordinates[], roomTiles: Tile[]): boolean => {
  return entrances.every((entrance) => roomTiles.some((tile) => tile.position.x === entrance.x && tile.position.y === entrance.y));
};

const getNewTileTowardsEntrance = (lastTile: Tile, nextEntrance: Coordinates): Tile => {
  const directionX = nextEntrance.x - lastTile.position.x;
  const directionY = nextEntrance.y - lastTile.position.y;

  return {
    position: {
      x: lastTile.position.x + Math.sign(directionX),
      y: lastTile.position.y + Math.sign(directionY),
    },
    isEntrance: false,
  };
};

const isFreeTile = (position: Coordinates, alreadyOccupiedCoordinates: Coordinates[]): boolean => {
  return !alreadyOccupiedCoordinates.some((occupied) => occupied.x === position.x && occupied.y === position.y);
};
