import { describe, expect, it } from "vitest";

import { resolveNavigationAxis } from "./index.js";

describe("resolveNavigationAxis", () => {
  it("waits until the dominant movement reaches the threshold", () => {
    expect(resolveNavigationAxis(4, 2, 5)).toBeNull();
  });

  it("locks horizontal movement to the horizontal axis", () => {
    expect(resolveNavigationAxis(-12, 4, 5)).toBe("horizontal");
  });

  it("locks vertical movement to the vertical axis", () => {
    expect(resolveNavigationAxis(3, 10, 5)).toBe("vertical");
  });

  it("uses a deterministic horizontal lock for an exact diagonal", () => {
    expect(resolveNavigationAxis(10, 10, 5)).toBe("horizontal");
  });

  it("rejects an invalid threshold", () => {
    expect(() => resolveNavigationAxis(1, 1, -1)).toThrow(RangeError);
  });
});
