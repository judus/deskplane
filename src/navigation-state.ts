import type { DesktopRowDefinition, NavigationDirection } from "./types.js";

interface StateRow {
  readonly id: string;
  readonly desktopIds: readonly string[];
}

export interface NavigationTarget {
  readonly rowIndex: number;
  readonly desktopIndex: number;
}

export class NavigationState {
  readonly rows: readonly StateRow[];
  readonly desktopLocations = new Map<string, NavigationTarget>();

  activeRowIndex: number;
  readonly activeDesktopIndexes: number[];

  constructor(
    definitions: readonly DesktopRowDefinition[],
    initialDesktopId?: string,
  ) {
    validateRows(definitions);

    this.rows = definitions.map((row) => ({
      id: row.id,
      desktopIds: row.desktops.map((desktop) => desktop.id),
    }));

    definitions.forEach((row, rowIndex) => {
      row.desktops.forEach((desktop, desktopIndex) => {
        this.desktopLocations.set(desktop.id, { rowIndex, desktopIndex });
      });
    });

    this.activeDesktopIndexes = definitions.map((row) => {
      if (row.initialDesktopId === undefined) {
        return Math.floor(row.desktops.length / 2);
      }

      const desktopIndex = row.desktops.findIndex(
        (desktop) => desktop.id === row.initialDesktopId,
      );

      if (desktopIndex < 0) {
        throw new Error(
          `initial desktop "${row.initialDesktopId}" is not in row "${row.id}"`,
        );
      }

      return desktopIndex;
    });

    if (initialDesktopId === undefined) {
      this.activeRowIndex = Math.floor(definitions.length / 2);
      return;
    }

    const initialLocation = this.locationOf(initialDesktopId);
    this.activeRowIndex = initialLocation.rowIndex;
    this.activeDesktopIndexes[initialLocation.rowIndex] =
      initialLocation.desktopIndex;
  }

  get activeDesktopId(): string {
    return this.desktopIdAt(
      this.activeRowIndex,
      this.activeDesktopIndexes[this.activeRowIndex] ?? 0,
    );
  }

  get activeRowId(): string {
    const row = this.rows[this.activeRowIndex];

    if (row === undefined) {
      throw new Error("active row is unavailable");
    }

    return row.id;
  }

  locationOf(desktopId: string): NavigationTarget {
    const location = this.desktopLocations.get(desktopId);

    if (location === undefined) {
      throw new Error(`unknown desktop "${desktopId}"`);
    }

    return location;
  }

  targetInDirection(direction: NavigationDirection): NavigationTarget | null {
    const rowIndex = this.activeRowIndex;
    const desktopIndex = this.activeDesktopIndexes[rowIndex] ?? 0;

    switch (direction) {
      case "left":
        return desktopIndex > 0
          ? { rowIndex, desktopIndex: desktopIndex - 1 }
          : null;
      case "right": {
        const row = this.rows[rowIndex];
        return row !== undefined && desktopIndex < row.desktopIds.length - 1
          ? { rowIndex, desktopIndex: desktopIndex + 1 }
          : null;
      }
      case "up": {
        const targetRowIndex = rowIndex - 1;
        return targetRowIndex >= 0
          ? {
              rowIndex: targetRowIndex,
              desktopIndex: this.activeDesktopIndexes[targetRowIndex] ?? 0,
            }
          : null;
      }
      case "down": {
        const targetRowIndex = rowIndex + 1;
        return targetRowIndex < this.rows.length
          ? {
              rowIndex: targetRowIndex,
              desktopIndex: this.activeDesktopIndexes[targetRowIndex] ?? 0,
            }
          : null;
      }
    }
  }

  select(target: NavigationTarget): void {
    this.assertTarget(target);
    this.activeDesktopIndexes[target.rowIndex] = target.desktopIndex;
    this.activeRowIndex = target.rowIndex;
  }

  preselect(target: NavigationTarget): void {
    this.assertTarget(target);
    this.activeDesktopIndexes[target.rowIndex] = target.desktopIndex;
  }

  desktopIdAt(rowIndex: number, desktopIndex: number): string {
    const desktopId = this.rows[rowIndex]?.desktopIds[desktopIndex];

    if (desktopId === undefined) {
      throw new Error("desktop coordinates are outside the configured layout");
    }

    return desktopId;
  }

  activeDesktopByRow(): Readonly<Record<string, string>> {
    return Object.freeze(
      Object.fromEntries(
        this.rows.map((row, rowIndex) => [
          row.id,
          this.desktopIdAt(rowIndex, this.activeDesktopIndexes[rowIndex] ?? 0),
        ]),
      ),
    );
  }

  private assertTarget(target: NavigationTarget): void {
    this.desktopIdAt(target.rowIndex, target.desktopIndex);
  }
}

function validateRows(definitions: readonly DesktopRowDefinition[]): void {
  if (definitions.length === 0 || definitions.length > 3) {
    throw new RangeError("virtual desktop requires between one and three rows");
  }

  const rowIds = new Set<string>();
  const desktopIds = new Set<string>();
  const elements = new Set<HTMLElement>();

  for (const row of definitions) {
    if (row.id.trim() === "") {
      throw new Error("row ids must not be empty");
    }

    if (rowIds.has(row.id)) {
      throw new Error(`duplicate row id "${row.id}"`);
    }

    if (row.desktops.length === 0) {
      throw new Error(`row "${row.id}" must contain at least one desktop`);
    }

    rowIds.add(row.id);

    for (const desktop of row.desktops) {
      if (desktop.id.trim() === "") {
        throw new Error("desktop ids must not be empty");
      }

      if (desktopIds.has(desktop.id)) {
        throw new Error(`duplicate desktop id "${desktop.id}"`);
      }

      if (elements.has(desktop.element)) {
        throw new Error("a desktop element may only be registered once");
      }

      desktopIds.add(desktop.id);
      elements.add(desktop.element);
    }
  }
}
