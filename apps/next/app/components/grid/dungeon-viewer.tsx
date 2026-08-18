"use client";

import { useState } from "react";
import type { Dungeon, Floor } from "@deepdive/engine";

export const DungeonViewer = ({ dungeon }: { dungeon: Dungeon }) => {
  const [levelIndex, setLevelIndex] = useState(0);
  const [floorIndex, setFloorIndex] = useState(0);

  const level = dungeon.levels[levelIndex]!;
  const floor = level[floorIndex]!;

  const goToLevel = (index: number) => {
    setLevelIndex(index);
    setFloorIndex(0);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", margin: "8px 0" }}>
        <button onClick={() => goToLevel(levelIndex - 1)} disabled={levelIndex === 0}>
          ↑ level
        </button>
        <span>
          Level {levelIndex + 1} / {dungeon.levels.length}
        </span>
        <button onClick={() => goToLevel(levelIndex + 1)} disabled={levelIndex === dungeon.levels.length - 1}>
          ↓ level
        </button>
        {level.map((_, index) => (
          <button key={index} onClick={() => setFloorIndex(index)} disabled={index === floorIndex}>
            Floor {index + 1}
          </button>
        ))}
      </div>
      <FloorGrid floor={floor} />
    </div>
  );
};

const FloorGrid = ({ floor }: { floor: Floor }) => {
  const cellSize = floor.gridSize > 100 ? 4 : 8;

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
        gridTemplateColumns: `repeat(${floor.gridSize}, ${cellSize}px)`,
        gridAutoRows: `${cellSize}px`,
        gap: "1px",
        backgroundColor: "#ddd",
        width: "fit-content",
      }}
    >
      {cells}
    </div>
  );
};
