import {
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { createDeskplane } from "./deskplane.js";
import type {
  Deskplane,
  DeskplaneSnapshot,
  GestureOptions,
  TransitionOptions,
} from "./types.js";

export interface ReactDesktopDefinition {
  /** A unique identifier across the complete virtual desktop. */
  readonly id: string;
  /** React content rendered into a Deskplane-owned portal container. */
  readonly children: ReactNode;
  /** Optional application class applied to the desktop container. */
  readonly className?: string;
  /** Optional accessible name for the desktop container. */
  readonly ariaLabel?: string;
}

export interface ReactDesktopRowDefinition {
  /** A unique row identifier. */
  readonly id: string;
  /** Desktops in their left-to-right order. */
  readonly desktops: readonly ReactDesktopDefinition[];
  /** The desktop remembered for this row before it is first visited. */
  readonly initialDesktopId?: string;
}

export interface DeskplaneViewportProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  readonly rows: readonly ReactDesktopRowDefinition[];
  readonly initialDesktopId?: string;
  readonly gestures?: GestureOptions | false;
  readonly transition?: TransitionOptions;
  /** Called after the controller mounts. Its optional return value runs before teardown. */
  readonly onReady?: (deskplane: Deskplane) => void | (() => void);
  /** Receives the initial snapshot and all subsequent navigation-state changes. */
  readonly onSnapshotChange?: (snapshot: DeskplaneSnapshot) => void;
}

interface MountedDesktop {
  readonly element: HTMLElement;
  readonly id: string;
}

interface MountedLayout {
  readonly key: string;
  readonly desktops: ReadonlyMap<string, MountedDesktop>;
  readonly rows: readonly {
    readonly id: string;
    readonly initialDesktopId?: string;
    readonly desktops: readonly MountedDesktop[];
  }[];
}

const elementIdentities = new WeakMap<HTMLElement, number>();
let nextElementIdentity = 1;

/**
 * React adapter for Deskplane.
 *
 * Content is rendered through portals into containers created and positioned by
 * Deskplane. React therefore retains ownership of the component trees while the
 * framework-agnostic core retains ownership of desktop placement and gestures.
 */
export function DeskplaneViewport({
  rows,
  initialDesktopId,
  gestures,
  transition,
  onReady,
  onSnapshotChange,
  ...viewportProps
}: DeskplaneViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onReady, onSnapshotChange });
  callbacksRef.current = { onReady, onSnapshotChange };
  const layoutKey = structuralLayoutKey(rows);
  const controllerConfigurationKey = configurationKey(
    initialDesktopId,
    gestures,
    transition,
  );
  const [mountedLayout, setMountedLayout] = useState<MountedLayout>();

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const mountedRows = rows.map((row) => ({
      id: row.id,
      ...(row.initialDesktopId === undefined
        ? {}
        : { initialDesktopId: row.initialDesktopId }),
      desktops: row.desktops.map((desktop) => {
        const element = viewport.ownerDocument.createElement("section");
        if (desktop.className !== undefined)
          element.className = desktop.className;
        if (desktop.ariaLabel !== undefined)
          element.setAttribute("aria-label", desktop.ariaLabel);
        return { id: desktop.id, element };
      }),
    }));

    setMountedLayout({
      key: layoutKey,
      rows: mountedRows,
      desktops: new Map(
        mountedRows.flatMap((row) =>
          row.desktops.map((desktop) => [desktop.id, desktop] as const),
        ),
      ),
    });
  }, [layoutKey]);

  useLayoutEffect(() => {
    if (mountedLayout?.key !== layoutKey) return;
    for (const row of rows) {
      for (const desktop of row.desktops) {
        const mounted = mountedLayout.desktops.get(desktop.id);
        if (mounted === undefined) continue;
        mounted.element.className = desktop.className ?? "";
        mounted.element.classList.add("deskplane-desktop");
        if (desktop.ariaLabel === undefined) {
          mounted.element.removeAttribute("aria-label");
        } else {
          mounted.element.setAttribute("aria-label", desktop.ariaLabel);
        }
      }
    }
  });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (
      viewport === null ||
      mountedLayout === undefined ||
      mountedLayout.key !== layoutKey
    ) {
      return;
    }

    const deskplane = createDeskplane({
      viewport,
      rows: mountedLayout.rows,
      ...(initialDesktopId === undefined ? {} : { initialDesktopId }),
      ...(gestures === undefined ? {} : { gestures }),
      ...(transition === undefined ? {} : { transition }),
    });
    const unsubscribe = deskplane.subscribe((snapshot) => {
      callbacksRef.current.onSnapshotChange?.(snapshot);
    });
    const cleanReady = callbacksRef.current.onReady?.(deskplane);

    return () => {
      unsubscribe?.();
      cleanReady?.();
      deskplane.destroy();
    };
  }, [controllerConfigurationKey, layoutKey, mountedLayout]);

  const activeLayout =
    mountedLayout?.key === layoutKey ? mountedLayout : undefined;

  return (
    <div {...viewportProps} ref={viewportRef}>
      {activeLayout === undefined
        ? null
        : rows.flatMap((row) =>
            row.desktops.map((desktop) => {
              const mounted = activeLayout.desktops.get(desktop.id);
              return mounted === undefined
                ? null
                : createPortal(desktop.children, mounted.element, desktop.id);
            }),
          )}
    </div>
  );
}

function structuralLayoutKey(
  rows: readonly ReactDesktopRowDefinition[],
): string {
  return JSON.stringify(
    rows.map((row) => ({
      id: row.id,
      initialDesktopId: row.initialDesktopId ?? null,
      desktopIds: row.desktops.map((desktop) => desktop.id),
    })),
  );
}

function configurationKey(
  initialDesktopId: string | undefined,
  gestures: GestureOptions | false | undefined,
  transition: TransitionOptions | undefined,
): string {
  return JSON.stringify({
    initialDesktopId: initialDesktopId ?? null,
    gestures:
      gestures === false
        ? false
        : {
            lockThreshold: gestures?.lockThreshold ?? null,
            distanceThreshold: gestures?.distanceThreshold ?? null,
            velocityThreshold: gestures?.velocityThreshold ?? null,
            ignore: gestures?.ignore ?? null,
            zones:
              gestures?.zones?.map((zone) => ({
                element: elementIdentity(zone.element),
                axes: zone.axes ?? null,
              })) ?? null,
          },
    transition: {
      duration: transition?.duration ?? null,
      easing: transition?.easing ?? null,
      effect: transition?.effect ?? null,
      respectReducedMotion: transition?.respectReducedMotion ?? null,
    },
  });
}

function elementIdentity(element: HTMLElement): number {
  const existing = elementIdentities.get(element);
  if (existing !== undefined) return existing;
  const identity = nextElementIdentity++;
  elementIdentities.set(element, identity);
  return identity;
}
