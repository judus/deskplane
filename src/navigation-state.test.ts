import { describe, expect, it } from "vitest";

import { NavigationState } from "./navigation-state.js";
import type { DesktopRowDefinition } from "./types.js";

describe("NavigationState", () => {
  it("starts at the center desktop of the center row", () => {
    const state = new NavigationState(layout());

    expect(state.activeRowId).toBe("middle");
    expect(state.activeDesktopId).toBe("middle-center");
  });

  it("remembers an independent horizontal desktop for every row", () => {
    const state = new NavigationState(layout());
    const topRight = state.locationOf("top-right");

    state.preselect(topRight);

    expect(state.activeDesktopId).toBe("middle-center");
    expect(state.activeDesktopByRow()).toMatchObject({
      top: "top-right",
      middle: "middle-center",
    });

    state.select(topRight);
    expect(state.activeDesktopId).toBe("top-right");
  });

  it("moves vertically to the destination row's remembered desktop", () => {
    const state = new NavigationState(layout());
    state.preselect(state.locationOf("top-left"));

    expect(state.targetInDirection("up")).toEqual({
      rowIndex: 0,
      desktopIndex: 0,
    });
  });

  it("supports an explicitly configured initial desktop", () => {
    const state = new NavigationState(layout(), "bottom-left");

    expect(state.activeRowId).toBe("bottom");
    expect(state.activeDesktopId).toBe("bottom-left");
  });

  it("rejects more than three rows", () => {
    const rows = [...layout(), row("extra")];

    expect(() => new NavigationState(rows)).toThrow(RangeError);
  });

  it("rejects duplicate desktop ids", () => {
    const rows = [row("first", ["duplicate"]), row("second", ["duplicate"])];

    expect(() => new NavigationState(rows)).toThrow(
      'duplicate desktop id "duplicate"',
    );
  });
});

function layout(): readonly DesktopRowDefinition[] {
  return [row("top"), row("middle"), row("bottom")];
}

function row(
  id: string,
  desktopIds = [`${id}-left`, `${id}-center`, `${id}-right`],
): DesktopRowDefinition {
  return {
    id,
    desktops: desktopIds.map((desktopId) => ({
      id: desktopId,
      element: {} as HTMLElement,
    })),
  };
}
