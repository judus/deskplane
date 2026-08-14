// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createDeskplane } from "./deskplane.js";
import type { DesktopRowDefinition } from "./types.js";

afterEach(() => {
  document.body.replaceChildren();
});

describe("createDeskplane", () => {
  it("mounts into the target, defaults to the center, and restores the DOM", () => {
    const fixture = createFixture();
    const desktop = createDeskplane({
      viewport: fixture.viewport,
      rows: fixture.rows,
      transition: { duration: 0 },
    });

    expect(desktop.snapshot.activeDesktopId).toBe("middle-center");
    expect(
      fixture.viewport.querySelector("[data-deskplane-stage]"),
    ).not.toBeNull();
    expect(fixture.elements.get("middle-center")?.inert).toBe(false);
    expect(fixture.elements.get("top-center")?.inert).toBe(true);

    desktop.destroy();

    expect(fixture.viewport.querySelector("[data-deskplane-stage]")).toBeNull();
    expect(fixture.source.children).toHaveLength(9);
    expect(fixture.elements.get("middle-center")?.className).toBe("");
  });

  it("pre-aligns another row and exposes active state to external controls", async () => {
    const fixture = createFixture();
    const listener = vi.fn();
    const desktop = createDeskplane({
      viewport: fixture.viewport,
      rows: fixture.rows,
      transition: { duration: 0 },
    });
    desktop.subscribe(listener);

    await desktop.goTo("top-right");

    expect(desktop.snapshot).toMatchObject({
      activeDesktopId: "top-right",
      activeRowId: "top",
      activeDesktopByRow: {
        top: "top-right",
        middle: "middle-center",
        bottom: "bottom-center",
      },
    });
    expect(desktop.isActive("top-right")).toBe(true);
    const topStrip = fixture.viewport.querySelector<HTMLElement>(
      "[data-deskplane-row='top'] > .deskplane-strip",
    );
    expect(topStrip?.style.transform).toBe("translate3d(-200%, 0, 0)");
    expect(listener).toHaveBeenLastCalledWith(desktop.snapshot);

    desktop.destroy();
  });

  it("locks an explicit swipe zone to one axis", () => {
    const fixture = createFixture(true);
    Object.defineProperty(fixture.viewport, "clientWidth", { value: 400 });

    const desktop = createDeskplane({
      viewport: fixture.viewport,
      rows: fixture.rows,
      transition: { duration: 0 },
    });
    const zone = fixture.elements
      .get("middle-center")
      ?.querySelector<HTMLElement>("[data-deskplane-swipe-zone]");

    expect(zone).toBeDefined();
    zone?.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 200,
        clientY: 100,
      }),
    );
    window.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 80,
        clientY: 160,
      }),
    );
    window.dispatchEvent(
      pointerEvent("pointerup", {
        clientX: 80,
        clientY: 160,
      }),
    );

    expect(desktop.snapshot.activeDesktopId).toBe("middle-right");
    desktop.destroy();
  });
});

function createFixture(withSwipeZone = false): {
  readonly viewport: HTMLElement;
  readonly source: HTMLElement;
  readonly rows: readonly DesktopRowDefinition[];
  readonly elements: ReadonlyMap<string, HTMLElement>;
} {
  const viewport = document.createElement("div");
  const source = document.createElement("div");
  const elements = new Map<string, HTMLElement>();
  const rows = ["top", "middle", "bottom"].map((rowId) => ({
    id: rowId,
    desktops: ["left", "center", "right"].map((columnId) => {
      const id = `${rowId}-${columnId}`;
      const element = document.createElement("section");
      element.textContent = id;

      if (withSwipeZone && id === "middle-center") {
        const zone = document.createElement("div");
        zone.dataset.deskplaneSwipeZone = "horizontal";
        element.append(zone);
      }

      elements.set(id, element);
      source.append(element);
      return { id, element };
    }),
  }));

  document.body.append(viewport, source);
  return { viewport, source, rows, elements };
}

function pointerEvent(
  type: string,
  coordinates: { readonly clientX: number; readonly clientY: number },
): PointerEvent {
  return new PointerEvent(type, {
    ...coordinates,
    bubbles: true,
    button: 0,
    isPrimary: true,
    pointerId: 1,
  });
}
