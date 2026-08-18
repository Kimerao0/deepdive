import { engine } from "@deepdive/engine";
import { db } from "@deepdive/db";

import { Grid } from "./components/grid";
import { Suspense } from "react";

const gridComponent = (
  <Suspense fallback={<p>generating…</p>}>
    <Grid />
  </Suspense>
);

export default function Page() {
  return (
    <div>
      <h1>Next.js App</h1>
      <p>This is a Next.js app.</p>
      <p>{engine}</p>
      <p>{db}</p>
      {gridComponent}
    </div>
  );
}
