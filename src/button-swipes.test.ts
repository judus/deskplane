// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeskplane } from "./deskplane.js";
import type { Deskplane } from "./types.js";

let desktop: Deskplane | undefined;
afterEach(() => {
  desktop?.destroy();
  desktop = undefined;
  document.body.replaceChildren();
});

function fixture(optIn = true, excluded = false) {
  const viewport = document.createElement("div");
  const left = document.createElement("section");
  const right = document.createElement("section");
  const zone = document.createElement("div");
  zone.dataset.deskplaneSwipeZone = "horizontal";
  const button = document.createElement("button");
  const label = document.createElement("span");
  label.textContent = "Tap command";
  button.append(label);
  if (optIn) button.dataset.deskplaneSwipeThrough = "";
  if (excluded) zone.dataset.deskplaneNoSwipe = "";
  const clicks = vi.fn();
  button.addEventListener("click", clicks);
  zone.append(button);
  left.append(zone);
  document.body.append(viewport, left, right);
  Object.defineProperty(viewport, "clientWidth", { value: 400 });
  desktop = createDeskplane({
    viewport,
    rows: [
      {
        id: "workspaces",
        desktops: [
          { id: "left", element: left },
          { id: "right", element: right },
        ],
      },
    ],
    initialDesktopId: "left",
    gestures: { velocityThreshold: 10_000 },
    transition: { duration: 0 },
  });
  return { button, label, clicks };
}

function pointer(type: string, x: number, pointerId = 1) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    button: 0,
    pointerId,
    pointerType: "touch",
    clientX: x,
    clientY: 100,
  });
}
function click(pointerId = 1) {
  return new PointerEvent("click", {
    bubbles: true,
    cancelable: true,
    detail: 1,
    pointerId,
    pointerType: "touch",
  });
}
function drag(target: HTMLElement, distance: number, cancel = false) {
  target.dispatchEvent(pointer("pointerdown", 200));
  window.dispatchEvent(pointer("pointermove", 200 - distance));
  window.dispatchEvent(
    pointer(cancel ? "pointercancel" : "pointerup", 200 - distance),
  );
}

describe("button swipe-through", () => {
  it("leaves a tap and movement below the gesture threshold as a normal click", () => {
    const { label, clicks } = fixture();
    drag(label, 3);
    label.dispatchEvent(click());
    expect(clicks).toHaveBeenCalledOnce();
    expect(desktop?.snapshot.activeDesktopId).toBe("left");
  });

  it.each([
    [120, false, "right"],
    [12, false, "left"],
    [120, true, "left"],
  ] as const)(
    "suppresses the pointer click after a %i-pixel drag, cancelled=%s",
    (distance, cancel, destination) => {
      const { label, clicks } = fixture();
      drag(label, distance, cancel);
      expect(label.dispatchEvent(click())).toBe(false);
      expect(clicks).not.toHaveBeenCalled();
      expect(desktop?.snapshot.activeDesktopId).toBe(destination);
    },
  );

  it("protects unmarked buttons and no-swipe ancestors", () => {
    for (const [optIn, excluded] of [
      [false, false],
      [true, true],
    ]) {
      const { label } = fixture(optIn, excluded);
      drag(label, 120);
      expect(desktop?.snapshot.activeDesktopId).toBe("left");
      desktop?.destroy();
    }
  });

  it("does not suppress keyboard activation or a different pointer's click", () => {
    const { label, clicks } = fixture();
    drag(label, 12);
    label.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    label.dispatchEvent(click(2));
    expect(clicks).toHaveBeenCalledTimes(2);
    label.dispatchEvent(click());
    expect(clicks).toHaveBeenCalledTimes(2);
  });

  it("resets suppression at the next pointer-down, including outside swipe zones", () => {
    const { label, clicks } = fixture();
    drag(label, 12, true);
    document.body.dispatchEvent(pointer("pointerdown", 200));
    label.dispatchEvent(click());
    expect(clicks).toHaveBeenCalledOnce();
  });

  it("suppresses legacy mouse clicks on the original control, not unrelated controls", () => {
    const { button, label, clicks } = fixture();
    const other = document.createElement("button");
    document.body.append(other);
    drag(label, 12);
    expect(
      other.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      ),
    ).toBe(true);
    expect(
      button.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      ),
    ).toBe(false);
    expect(clicks).not.toHaveBeenCalled();
  });

  it("removes its capture handlers on teardown", () => {
    const { label, clicks } = fixture();
    drag(label, 12);
    desktop?.destroy();
    label.dispatchEvent(click());
    expect(clicks).toHaveBeenCalledOnce();
  });
});
