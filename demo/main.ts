import {
  createDeskplane,
  type DesktopRowDefinition,
  type NavigationDirection,
} from "../src/index.js";
import "../src/style.css";
import "./style.css";

const viewport = requiredElement<HTMLElement>("#desktop-viewport");
const rows = createRows([
  ["top-overview", "top-notes"],
  [
    "middle-library",
    "middle-activity",
    "middle-dashboard",
    "middle-settings",
    "middle-help",
  ],
  ["bottom-contact", "bottom-details"],
]);

for (const row of rows) {
  for (const desktop of row.desktops) {
    desktop.element.classList.add("demo-desktop");
    desktop.element.removeAttribute("hidden");
    desktop.element.append(
      swipeRail("horizontal", "Drag horizontally"),
      swipeRail("vertical", "Drag vertically"),
    );
  }
}

const deskplane = createDeskplane({
  viewport,
  rows,
  initialDesktopId: "middle-dashboard",
  transition: {
    duration: 360,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
});

const status = requiredElement<HTMLOutputElement>("#desktop-status");
const destinationButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-go-to]"),
);

deskplane.subscribe((snapshot) => {
  status.value = `${snapshot.activeRowId} / ${snapshot.activeDesktopId}`;

  for (const button of destinationButtons) {
    const active = button.dataset.goTo === snapshot.activeDesktopId;
    button.setAttribute("aria-pressed", String(active));
    button.dataset.active = String(active);
  }
});

for (const button of destinationButtons) {
  button.addEventListener("click", () => {
    const desktopId = button.dataset.goTo;
    if (desktopId !== undefined) {
      void deskplane.goTo(desktopId);
    }
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-move]",
)) {
  button.addEventListener("click", () => {
    const direction = button.dataset.move as NavigationDirection | undefined;
    if (direction !== undefined) {
      void deskplane.move(direction);
    }
  });
}

requiredElement<HTMLButtonElement>("#demo-action").addEventListener(
  "click",
  () => {
    requiredElement<HTMLOutputElement>("#demo-action-result").value =
      "Pressed successfully";
  },
);

bindDemonstrationForm("#settings-form", "#settings-result", "Saved locally");
bindDemonstrationForm(
  "#contact-form",
  "#contact-result",
  "Demonstration submitted",
);

function createRows(
  desktopIdsByRow: readonly (readonly string[])[],
): readonly DesktopRowDefinition[] {
  return desktopIdsByRow.map((desktopIds, rowIndex) => ({
    id: ["top", "middle", "bottom"][rowIndex] ?? `row-${rowIndex}`,
    desktops: desktopIds.map((id) => ({
      id,
      element: requiredElement<HTMLElement>(`[data-desktop='${id}']`),
    })),
  }));
}

function swipeRail(
  axis: "horizontal" | "vertical",
  label: string,
): HTMLElement {
  const rail = document.createElement("div");
  rail.className = `swipe-rail swipe-rail--${axis}`;
  rail.dataset.deskplaneSwipeZone = axis;
  rail.setAttribute("aria-hidden", "true");
  rail.textContent = label;
  return rail;
}

function bindDemonstrationForm(
  formSelector: string,
  outputSelector: string,
  message: string,
): void {
  requiredElement<HTMLFormElement>(formSelector).addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      requiredElement<HTMLOutputElement>(outputSelector).value = message;
    },
  );
}

function requiredElement<ElementType extends Element>(
  selector: string,
): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (element === null) {
    throw new Error(`missing demo element: ${selector}`);
  }
  return element;
}
