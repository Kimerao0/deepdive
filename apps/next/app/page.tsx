import { engine } from "@deepdive/engine";
import { db } from "@deepdive/db";

export default function Page() {
  return (
    <div>
      <h1>Next.js App</h1>
      <p>This is a Next.js app.</p>
      <p>{engine}</p>
      <p>{db}</p>
    </div>
  );
}
