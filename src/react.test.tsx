// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeskplaneViewport } from "./react.js";
import type { Deskplane } from "./types.js";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(() => {
  if (root !== undefined) {
    act(() => root?.unmount());
    root = undefined;
  }
  document.body.replaceChildren();
});

describe("DeskplaneViewport", () => {
  it("renders React content through portals and exposes the core controller", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const onReady = vi.fn<(deskplane: Deskplane) => void>();
    const onSnapshotChange = vi.fn();
    root = createRoot(host);

    act(() =>
      root?.render(
        <DeskplaneViewport
          initialDesktopId="information"
          onReady={onReady}
          onSnapshotChange={onSnapshotChange}
          rows={[
            {
              id: "main",
              desktops: [
                { id: "controls", children: <p>Controls</p> },
                { id: "information", children: <p>Information</p> },
                { id: "copilot", children: <p>Copilot</p> },
              ],
            },
          ]}
          transition={{ duration: 0 }}
        />,
      ),
    );

    expect(host.textContent).toContain("ControlsInformationCopilot");
    expect(onReady).toHaveBeenCalledOnce();
    expect(onSnapshotChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeDesktopId: "information" }),
    );

    const deskplane = onReady.mock.calls[0]?.[0];
    expect(deskplane).toBeDefined();
    await act(() => deskplane?.goTo("copilot"));
    expect(onSnapshotChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeDesktopId: "copilot" }),
    );
  });

  it("does not rebuild the controller when inline React content changes", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const onReady = vi.fn<(deskplane: Deskplane) => void>();
    root = createRoot(host);

    const render = (label: string): void => {
      act(() =>
        root?.render(
          <DeskplaneViewport
            onReady={onReady}
            rows={[
              {
                id: "main",
                desktops: [{ id: "home", children: <p>{label}</p> }],
              },
            ]}
            transition={{ duration: 0 }}
          />,
        ),
      );
    };

    render("First");
    render("Second");

    expect(host.textContent).toBe("Second");
    expect(onReady).toHaveBeenCalledOnce();
  });
});
