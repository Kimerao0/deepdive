import { describe, expect, it } from "vitest";
import { engine } from "#index";

describe("Engine", () => {
  it("should test engine value", () => {
    expect(engine).toBe("this comes from the engine");
  });
});
