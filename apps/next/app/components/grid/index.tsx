import { generateFloor } from "@deepdive/engine";
import { connection } from "next/server";

const CELL_SIZE = 8;

export const Grid = async () => {
  await connection();
  const floor = generateFloor("small", "castle", "sparse", 2);
  console.log("Generated floor:", floor.rooms.length, "rooms,", floor.corridors.length, "corridor tiles,", floor.entries.length, "entries");

  const tileColors = new Map<string, string>();
  for (const cell of floor.corridors) {
    tileColors.set(`${cell.x},${cell.y}`, "#444");
  }
  for (const room of floor.rooms) {
    for (const tile of room.tiles) {
      tileColors.set(`${tile.position.x},${tile.position.y}`, tile.isEntrance ? "green" : "blue");
    }
  }
  for (const cell of floor.entries) {
    tileColors.set(`${cell.x},${cell.y}`, "red");
  }

  const cells = [];
  for (let y = 0; y < floor.gridSize; y++) {
    for (let x = 0; x < floor.gridSize; x++) {
      cells.push(<div key={`${x},${y}`} style={{ backgroundColor: tileColors.get(`${x},${y}`) ?? "white" }} />);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${floor.gridSize}, ${CELL_SIZE}px)`,
        gridAutoRows: `${CELL_SIZE}px`,
        gap: "1px",
        backgroundColor: "#ddd",
        width: "fit-content",
      }}
    >
      {cells}
    </div>
  );
};
