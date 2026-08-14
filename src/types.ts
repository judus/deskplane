export type NavigationAxis = "horizontal" | "vertical";

export type NavigationDirection = "up" | "right" | "down" | "left";

export type SwipeZoneAxes = NavigationAxis | "both";

export interface DesktopDefinition {
  /** A unique identifier across the complete virtual desktop. */
  readonly id: string;
  /** The existing element that becomes the desktop's content root. */
  readonly element: HTMLElement;
}

export interface DesktopRowDefinition {
  /** A unique row identifier. */
  readonly id: string;
  /** Desktops in their left-to-right order. */
  readonly desktops: readonly DesktopDefinition[];
  /** The desktop remembered for this row before it is first visited. */
  readonly initialDesktopId?: string;
}

export interface SwipeZoneDefinition {
  /** The element on which a drag may begin. */
  readonly element: HTMLElement;
  /** Axes accepted by this zone. Defaults to both. */
  readonly axes?: SwipeZoneAxes;
}

export interface GestureOptions {
  /**
   * Explicit gesture handles. If omitted, elements with
   * `data-deskplane-swipe-zone` inside the viewport are used.
   */
  readonly zones?: readonly SwipeZoneDefinition[];
  /** Pixels required before a drag is locked to one axis. Defaults to 8. */
  readonly lockThreshold?: number;
  /** Viewport fraction required to change desktop. Defaults to 0.18. */
  readonly distanceThreshold?: number;
  /** Pixels per millisecond that commit a short flick. Defaults to 0.5. */
  readonly velocityThreshold?: number;
  /**
   * Selector for controls that must never initiate navigation. Defaults to
   * common interactive elements and `[data-deskplane-no-swipe]`.
   */
  readonly ignore?: string;
}

export interface TransitionOptions {
  /** Transition duration in milliseconds. Defaults to 320. */
  readonly duration?: number;
  /** CSS easing function. Defaults to a smooth cubic bezier. */
  readonly easing?: string;
  /** The initial release supports the slide effect. */
  readonly effect?: "slide";
  /** Respect `prefers-reduced-motion`. Defaults to true. */
  readonly respectReducedMotion?: boolean;
}

export interface DeskplaneOptions {
  readonly viewport: HTMLElement;
  /** One to three rows, ordered top to bottom. */
  readonly rows: readonly DesktopRowDefinition[];
  /** Defaults to the center desktop of the center row. */
  readonly initialDesktopId?: string;
  readonly gestures?: GestureOptions | false;
  readonly transition?: TransitionOptions;
}

export interface DeskplaneSnapshot {
  readonly activeDesktopId: string;
  readonly activeRowId: string;
  readonly activeDesktopByRow: Readonly<Record<string, string>>;
  readonly isAnimating: boolean;
}

export type DeskplaneListener = (snapshot: DeskplaneSnapshot) => void;

export interface Deskplane {
  readonly snapshot: DeskplaneSnapshot;
  goTo(desktopId: string): Promise<boolean>;
  move(direction: NavigationDirection): Promise<boolean>;
  isActive(desktopId: string): boolean;
  subscribe(listener: DeskplaneListener): () => void;
  destroy(): void;
}
