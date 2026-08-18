import { generateDungeon } from "@deepdive/engine";
import { connection } from "next/server";

import { DungeonViewer } from "./dungeon-viewer";

export const Grid = async () => {
  await connection();
  const dungeon = generateDungeon("hard", "castle");
  console.log("Generated dungeon:", dungeon.levels.length, "levels,", dungeon.levels.flat().length, "floors,", dungeon.connections.length, "connections");

  return <DungeonViewer dungeon={dungeon} />;
};
