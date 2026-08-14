import { resolveNavigationAxis } from "./axis.js";
import { NavigationState, type NavigationTarget } from "./navigation-state.js";
import type {
  NavigationAxis,
  NavigationDirection,
  SwipeZoneAxes,
  SwipeZoneDefinition,
  Deskplane,
  DeskplaneListener,
  DeskplaneOptions,
  DeskplaneSnapshot,
} from "./types.js";

const DEFAULT_IGNORE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "option",
  "select",
  "textarea",
  "[contenteditable]:not([contenteditable='false'])",
  "[data-deskplane-no-swipe]",
].join(",");

interface ElementPlacement {
  readonly id: string;
  readonly element: HTMLElement;
  readonly parent: Node | null;
  readonly nextSibling: Node | null;
  readonly hadDesktopClass: boolean;
  readonly ariaHidden: string | null;
  readonly dataDesktop: string | null;
  readonly inert: boolean;
  readonly inlineLeft: string;
}

interface MountedRow {
  readonly row: HTMLElement;
  readonly strip: HTMLElement;
}

interface ActiveGesture {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly startedAt: number;
  readonly axes: SwipeZoneAxes;
  axis: NavigationAxis | null;
  deltaX: number;
  deltaY: number;
}

interface MountedZone {
  readonly definition: SwipeZoneDefinition;
  readonly hadClass: boolean;
  readonly onPointerDown: (event: PointerEvent) => void;
}

export function createDeskplane(options: DeskplaneOptions): Deskplane {
  return new DeskplaneController(options);
}

class DeskplaneController implements Deskplane {
  private readonly viewport: HTMLElement;
  private readonly view: Window;
  private readonly state: NavigationState;
  private readonly stage: HTMLElement;
  private readonly mountedRows: readonly MountedRow[];
  private readonly placements: readonly ElementPlacement[];
  private readonly listeners = new Set<DeskplaneListener>();
  private readonly mountedZones: MountedZone[] = [];
  private readonly transitionDuration: number;
  private readonly lockThreshold: number;
  private readonly distanceThreshold: number;
  private readonly velocityThreshold: number;
  private readonly ignoreSelector: string;
  private readonly respectReducedMotion: boolean;
  private readonly hadViewportClass: boolean;
  private readonly previousDurationProperty: string;
  private readonly previousEasingProperty: string;

  private activeGesture: ActiveGesture | null = null;
  private isAnimating = false;
  private destroyed = false;
  private operation = 0;

  private readonly onPointerMove = (event: PointerEvent): void => {
    const gesture = this.activeGesture;

    if (gesture === null || event.pointerId !== gesture.pointerId) {
      return;
    }

    gesture.deltaX = event.clientX - gesture.startX;
    gesture.deltaY = event.clientY - gesture.startY;

    if (gesture.axis === null) {
      gesture.axis = this.resolveAllowedAxis(gesture);
    }

    if (gesture.axis === null) {
      return;
    }

    event.preventDefault();
    this.renderGesture(gesture);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (
      this.activeGesture === null ||
      event.pointerId !== this.activeGesture.pointerId
    ) {
      return;
    }

    this.finishGesture(event.timeStamp, false);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (
      this.activeGesture === null ||
      event.pointerId !== this.activeGesture.pointerId
    ) {
      return;
    }

    this.finishGesture(event.timeStamp, true);
  };

  constructor(options: DeskplaneOptions) {
    if (!(options.viewport instanceof HTMLElement)) {
      throw new TypeError("viewport must be an HTMLElement");
    }

    const view = options.viewport.ownerDocument.defaultView;

    if (view === null) {
      throw new Error("viewport must belong to a document with a window");
    }

    this.viewport = options.viewport;
    this.view = view;
    this.state = new NavigationState(options.rows, options.initialDesktopId);

    for (const row of options.rows) {
      for (const desktop of row.desktops) {
        if (
          desktop.element === this.viewport ||
          desktop.element.contains(this.viewport)
        ) {
          throw new Error("a desktop element cannot contain its viewport");
        }
      }
    }

    this.transitionDuration = finiteNumber(
      options.transition?.duration,
      320,
      "transition duration",
      0,
    );
    this.respectReducedMotion =
      options.transition?.respectReducedMotion ?? true;
    const easing =
      options.transition?.easing ?? "cubic-bezier(0.22, 1, 0.36, 1)";

    if (easing.trim() === "") {
      throw new Error("transition easing must not be empty");
    }

    const gestures = options.gestures === false ? undefined : options.gestures;
    this.lockThreshold = finiteNumber(
      gestures?.lockThreshold,
      8,
      "gesture lock threshold",
      0,
    );
    this.distanceThreshold = finiteNumber(
      gestures?.distanceThreshold,
      0.18,
      "gesture distance threshold",
      0,
      1,
    );
    this.velocityThreshold = finiteNumber(
      gestures?.velocityThreshold,
      0.5,
      "gesture velocity threshold",
      0,
    );
    this.ignoreSelector = gestures?.ignore ?? DEFAULT_IGNORE_SELECTOR;
    validateSelector(this.viewport, this.ignoreSelector);

    this.hadViewportClass =
      this.viewport.classList.contains("deskplane-viewport");
    this.previousDurationProperty = this.viewport.style.getPropertyValue(
      "--deskplane-transition-duration",
    );
    this.previousEasingProperty = this.viewport.style.getPropertyValue(
      "--deskplane-transition-easing",
    );
    this.viewport.classList.add("deskplane-viewport");
    this.viewport.style.setProperty(
      "--deskplane-transition-duration",
      `${this.transitionDuration}ms`,
    );
    this.viewport.style.setProperty("--deskplane-transition-easing", easing);

    this.placements = options.rows.flatMap((row) =>
      row.desktops.map((desktop) => ({
        id: desktop.id,
        element: desktop.element,
        parent: desktop.element.parentNode,
        nextSibling: desktop.element.nextSibling,
        hadDesktopClass:
          desktop.element.classList.contains("deskplane-desktop"),
        ariaHidden: desktop.element.getAttribute("aria-hidden"),
        dataDesktop: desktop.element.getAttribute("data-deskplane-desktop"),
        inert: desktop.element.inert,
        inlineLeft: desktop.element.style.left,
      })),
    );

    const document = this.viewport.ownerDocument;
    this.stage = document.createElement("div");
    this.stage.className = "deskplane-stage";
    this.stage.setAttribute("data-deskplane-stage", "");

    this.mountedRows = options.rows.map((definition, rowIndex) => {
      const row = document.createElement("div");
      const strip = document.createElement("div");
      row.className = "deskplane-row";
      strip.className = "deskplane-strip";
      row.dataset.deskplaneRow = definition.id;
      row.style.top = `${rowIndex * 100}%`;

      definition.desktops.forEach((desktop, desktopIndex) => {
        desktop.element.classList.add("deskplane-desktop");
        desktop.element.dataset.deskplaneDesktop = desktop.id;
        desktop.element.style.left = `${desktopIndex * 100}%`;
        strip.append(desktop.element);
      });

      row.append(strip);
      this.stage.append(row);
      return { row, strip };
    });

    this.viewport.append(this.stage);
    this.renderAllPositions();
    this.updateAccessibility();

    if (options.gestures !== false) {
      const zones = options.gestures?.zones ?? this.findDeclarativeSwipeZones();
      this.mountSwipeZones(zones);
      this.view.addEventListener("pointermove", this.onPointerMove, {
        passive: false,
      });
      this.view.addEventListener("pointerup", this.onPointerUp);
      this.view.addEventListener("pointercancel", this.onPointerCancel);
    }
  }

  get snapshot(): DeskplaneSnapshot {
    this.assertAlive();
    return Object.freeze({
      activeDesktopId: this.state.activeDesktopId,
      activeRowId: this.state.activeRowId,
      activeDesktopByRow: this.state.activeDesktopByRow(),
      isAnimating: this.isAnimating,
    });
  }

  async goTo(desktopId: string): Promise<boolean> {
    this.assertAlive();
    return this.navigate(this.state.locationOf(desktopId));
  }

  async move(direction: NavigationDirection): Promise<boolean> {
    this.assertAlive();
    const target = this.state.targetInDirection(direction);
    return target === null ? false : this.navigate(target);
  }

  isActive(desktopId: string): boolean {
    this.assertAlive();
    this.state.locationOf(desktopId);
    return this.state.activeDesktopId === desktopId;
  }

  subscribe(listener: DeskplaneListener): () => void {
    this.assertAlive();
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.operation += 1;
    this.activeGesture = null;
    this.listeners.clear();
    this.view.removeEventListener("pointermove", this.onPointerMove);
    this.view.removeEventListener("pointerup", this.onPointerUp);
    this.view.removeEventListener("pointercancel", this.onPointerCancel);

    for (const zone of this.mountedZones) {
      zone.definition.element.removeEventListener(
        "pointerdown",
        zone.onPointerDown,
      );
      if (!zone.hadClass) {
        zone.definition.element.classList.remove("deskplane-swipe-zone");
      }
    }

    for (const placement of [...this.placements].reverse()) {
      restorePlacement(placement);
    }

    this.stage.remove();

    if (!this.hadViewportClass) {
      this.viewport.classList.remove("deskplane-viewport");
    }

    restoreCustomProperty(
      this.viewport,
      "--deskplane-transition-duration",
      this.previousDurationProperty,
    );
    restoreCustomProperty(
      this.viewport,
      "--deskplane-transition-easing",
      this.previousEasingProperty,
    );
  }

  private async navigate(target: NavigationTarget): Promise<boolean> {
    const currentRowIndex = this.state.activeRowIndex;
    const currentDesktopIndex =
      this.state.activeDesktopIndexes[currentRowIndex] ?? 0;

    if (
      target.rowIndex === currentRowIndex &&
      target.desktopIndex === currentDesktopIndex
    ) {
      this.renderAllPositions();
      return false;
    }

    const operation = ++this.operation;
    const duration = this.effectiveTransitionDuration();
    this.isAnimating = duration > 0;

    if (target.rowIndex !== currentRowIndex) {
      this.state.preselect(target);
      const destinationStrip = this.stripAt(target.rowIndex);
      destinationStrip.style.transition = "none";
      this.renderStripPosition(target.rowIndex);
      void destinationStrip.offsetWidth;
      destinationStrip.style.removeProperty("transition");
      this.emit();
      await nextFrame(this.view);

      if (this.destroyed || operation !== this.operation) {
        return false;
      }
    }

    this.state.select(target);
    this.renderAllPositions();
    this.updateAccessibility();
    this.emit();

    if (duration > 0) {
      await delay(this.view, duration);
    }

    if (!this.destroyed && operation === this.operation) {
      this.isAnimating = false;
      this.emit();
    }

    return true;
  }

  private mountSwipeZones(zones: readonly SwipeZoneDefinition[]): void {
    const mountedElements = new Set<HTMLElement>();

    for (const definition of zones) {
      if (mountedElements.has(definition.element)) {
        throw new Error("a swipe zone element may only be registered once");
      }

      mountedElements.add(definition.element);
      const axes = definition.axes ?? "both";

      if (axes !== "both" && axes !== "horizontal" && axes !== "vertical") {
        throw new Error(`unsupported swipe zone axes "${String(axes)}"`);
      }

      const hadClass = definition.element.classList.contains(
        "deskplane-swipe-zone",
      );
      const onPointerDown = (event: PointerEvent): void => {
        this.startGesture(event, axes);
      };

      definition.element.classList.add("deskplane-swipe-zone");
      definition.element.addEventListener("pointerdown", onPointerDown);
      this.mountedZones.push({ definition, hadClass, onPointerDown });
    }
  }

  private findDeclarativeSwipeZones(): readonly SwipeZoneDefinition[] {
    return Array.from(
      this.viewport.querySelectorAll<HTMLElement>(
        "[data-deskplane-swipe-zone]",
      ),
      (element) => ({
        element,
        axes: parseZoneAxes(element.dataset.deskplaneSwipeZone),
      }),
    );
  }

  private startGesture(event: PointerEvent, axes: SwipeZoneAxes): void {
    if (
      this.destroyed ||
      this.isAnimating ||
      this.activeGesture !== null ||
      !event.isPrimary ||
      event.button !== 0 ||
      this.isIgnoredTarget(event.target)
    ) {
      return;
    }

    this.activeGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: event.timeStamp,
      axes,
      axis: null,
      deltaX: 0,
      deltaY: 0,
    };
  }

  private resolveAllowedAxis(gesture: ActiveGesture): NavigationAxis | null {
    const resolved = resolveNavigationAxis(
      gesture.deltaX,
      gesture.deltaY,
      this.lockThreshold,
    );

    if (resolved === null || gesture.axes === "both") {
      return resolved;
    }

    if (resolved === gesture.axes) {
      return resolved;
    }

    const allowedDistance = Math.abs(
      gesture.axes === "horizontal" ? gesture.deltaX : gesture.deltaY,
    );
    return allowedDistance >= this.lockThreshold ? gesture.axes : null;
  }

  private renderGesture(gesture: ActiveGesture): void {
    if (gesture.axis === "horizontal") {
      const strip = this.stripAt(this.state.activeRowIndex);
      const delta = this.resistedDelta("horizontal", gesture.deltaX);
      strip.style.transition = "none";
      this.renderStripPosition(this.state.activeRowIndex, delta);
      return;
    }

    const delta = this.resistedDelta("vertical", gesture.deltaY);
    this.stage.style.transition = "none";
    this.renderStagePosition(delta);
  }

  private resistedDelta(axis: NavigationAxis, delta: number): number {
    const direction = directionForDelta(axis, delta);
    return this.state.targetInDirection(direction) === null
      ? delta * 0.2
      : delta;
  }

  private finishGesture(finishedAt: number, cancelled: boolean): void {
    const gesture = this.activeGesture;

    if (gesture === null) {
      return;
    }

    this.activeGesture = null;

    if (gesture.axis === null) {
      return;
    }

    const movingElement =
      gesture.axis === "horizontal"
        ? this.stripAt(this.state.activeRowIndex)
        : this.stage;
    movingElement.style.removeProperty("transition");
    void movingElement.offsetWidth;

    const distance = Math.abs(
      gesture.axis === "horizontal" ? gesture.deltaX : gesture.deltaY,
    );
    const dimension =
      gesture.axis === "horizontal"
        ? this.viewport.clientWidth
        : this.viewport.clientHeight;
    const elapsed = Math.max(finishedAt - gesture.startedAt, 1);
    const velocity = distance / elapsed;
    const delta =
      gesture.axis === "horizontal" ? gesture.deltaX : gesture.deltaY;
    const direction = directionForDelta(gesture.axis, delta);
    const target = this.state.targetInDirection(direction);
    const shouldCommit =
      !cancelled &&
      target !== null &&
      (distance >= dimension * this.distanceThreshold ||
        velocity >= this.velocityThreshold);

    if (shouldCommit && target !== null) {
      void this.navigate(target);
      return;
    }

    this.animateBack();
  }

  private animateBack(): void {
    const operation = ++this.operation;
    const duration = this.effectiveTransitionDuration();
    this.isAnimating = duration > 0;
    this.renderAllPositions();
    this.emit();

    if (duration === 0) {
      this.isAnimating = false;
      this.emit();
      return;
    }

    void delay(this.view, duration).then(() => {
      if (!this.destroyed && operation === this.operation) {
        this.isAnimating = false;
        this.emit();
      }
    });
  }

  private renderAllPositions(): void {
    this.renderStagePosition();
    this.mountedRows.forEach((_, rowIndex) => {
      this.renderStripPosition(rowIndex);
    });
  }

  private renderStagePosition(pixelOffset = 0): void {
    const percentage = -this.state.activeRowIndex * 100;
    this.stage.style.transform = transform("Y", percentage, pixelOffset);
  }

  private renderStripPosition(rowIndex: number, pixelOffset = 0): void {
    const desktopIndex = this.state.activeDesktopIndexes[rowIndex] ?? 0;
    this.stripAt(rowIndex).style.transform = transform(
      "X",
      -desktopIndex * 100,
      pixelOffset,
    );
  }

  private stripAt(rowIndex: number): HTMLElement {
    const mountedRow = this.mountedRows[rowIndex];

    if (mountedRow === undefined) {
      throw new Error("row is outside the mounted layout");
    }

    return mountedRow.strip;
  }

  private updateAccessibility(): void {
    const activeDesktopId = this.state.activeDesktopId;

    for (const placement of this.placements) {
      const isActive = placement.id === activeDesktopId;
      placement.element.inert = isActive ? placement.inert : true;

      if (isActive) {
        restoreAttribute(
          placement.element,
          "aria-hidden",
          placement.ariaHidden,
        );
      } else {
        placement.element.setAttribute("aria-hidden", "true");
      }
    }
  }

  private effectiveTransitionDuration(): number {
    if (
      this.respectReducedMotion &&
      this.view.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return 0;
    }

    return this.transitionDuration;
  }

  private isIgnoredTarget(target: EventTarget | null): boolean {
    return isElement(target) && target.closest(this.ignoreSelector) !== null;
  }

  private emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error("virtual desktop has been destroyed");
    }
  }
}

function directionForDelta(
  axis: NavigationAxis,
  delta: number,
): NavigationDirection {
  if (axis === "horizontal") {
    return delta > 0 ? "left" : "right";
  }

  return delta > 0 ? "up" : "down";
}

function transform(
  axis: "X" | "Y",
  percentage: number,
  pixels: number,
): string {
  const translation =
    pixels === 0
      ? `${percentage}%`
      : `calc(${percentage}% + ${pixels.toFixed(3)}px)`;
  const x = axis === "X" ? translation : "0";
  const y = axis === "Y" ? translation : "0";
  return `translate3d(${x}, ${y}, 0)`;
}

function finiteNumber(
  value: number | undefined,
  fallback: number,
  label: string,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
): number {
  const resolved = value ?? fallback;

  if (!Number.isFinite(resolved) || resolved < minimum || resolved > maximum) {
    throw new RangeError(
      `${label} must be a finite number between ${minimum} and ${maximum}`,
    );
  }

  return resolved;
}

function validateSelector(element: HTMLElement, selector: string): void {
  try {
    element.matches(selector);
  } catch {
    throw new Error(`invalid gesture ignore selector "${selector}"`);
  }
}

function isElement(target: EventTarget | null): target is Element {
  return target !== null && "closest" in target;
}

function parseZoneAxes(value: string | undefined): SwipeZoneAxes {
  return value === "horizontal" || value === "vertical" ? value : "both";
}

function restorePlacement(placement: ElementPlacement): void {
  const { element } = placement;
  element.inert = placement.inert;
  element.style.left = placement.inlineLeft;
  restoreAttribute(element, "aria-hidden", placement.ariaHidden);
  restoreAttribute(element, "data-deskplane-desktop", placement.dataDesktop);

  if (!placement.hadDesktopClass) {
    element.classList.remove("deskplane-desktop");
  }

  if (placement.parent === null) {
    element.remove();
    return;
  }

  const sibling =
    placement.nextSibling?.parentNode === placement.parent
      ? placement.nextSibling
      : null;
  placement.parent.insertBefore(element, sibling);
}

function restoreAttribute(
  element: HTMLElement,
  name: string,
  value: string | null,
): void {
  if (value === null) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
}

function restoreCustomProperty(
  element: HTMLElement,
  name: string,
  value: string,
): void {
  if (value === "") {
    element.style.removeProperty(name);
  } else {
    element.style.setProperty(name, value);
  }
}

function nextFrame(view: Window): Promise<void> {
  return new Promise((resolve) => {
    view.requestAnimationFrame(() => {
      resolve();
    });
  });
}

function delay(view: Window, milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    view.setTimeout(resolve, milliseconds);
  });
}
