import type { NavigationAxis } from "./types.js";

/**
 * Resolves a drag to one axis once its dominant distance reaches the threshold.
 */
export function resolveNavigationAxis(
  deltaX: number,
  deltaY: number,
  threshold = 0,
): NavigationAxis | null {
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new RangeError("threshold must be a finite, non-negative number");
  }

  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);
  const dominantDistance = Math.max(horizontalDistance, verticalDistance);

  if (dominantDistance < threshold || dominantDistance === 0) {
    return null;
  }

  return horizontalDistance >= verticalDistance ? "horizontal" : "vertical";
}
