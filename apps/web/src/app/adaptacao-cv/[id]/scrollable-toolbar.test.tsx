import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScrollableToolbar } from "./scrollable-toolbar";

// jsdom não calcula layout: as medidas vêm daqui.
const layout = { scrollWidth: 400, clientWidth: 400, scrollLeft: 0 };
const scrollBy = vi.fn();

beforeEach(() => {
  layout.scrollWidth = 400;
  layout.clientWidth = 400;
  layout.scrollLeft = 0;
  scrollBy.mockReset();
  for (const key of ["scrollWidth", "clientWidth", "scrollLeft"] as const) {
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get: () => layout[key],
    });
  }
  HTMLElement.prototype.scrollBy = scrollBy as never;
});

afterEach(() => {
  cleanup();
});

const left = () =>
  screen.queryByRole("button", { name: /rolar botões para a esquerda/i });
const right = () =>
  screen.queryByRole("button", { name: /rolar botões para a direita/i });

function renderBar() {
  render(
    <ScrollableToolbar className="bar">
      <button type="button">Editar CV</button>
    </ScrollableToolbar>,
  );
  return screen.getByText("Editar CV").parentElement as HTMLElement;
}

describe("ScrollableToolbar", () => {
  it("shows no arrow when everything fits", () => {
    renderBar();
    expect(left()).not.toBeInTheDocument();
    expect(right()).not.toBeInTheDocument();
  });

  it("at the start of an overflowing bar shows only the right arrow", () => {
    layout.scrollWidth = 700;
    renderBar();
    expect(left()).not.toBeInTheDocument();
    expect(right()).toBeInTheDocument();
  });

  it("shows both arrows in the middle and only the left one at the end", () => {
    layout.scrollWidth = 700;
    const bar = renderBar();

    layout.scrollLeft = 120;
    act(() => {
      fireEvent.scroll(bar);
    });
    expect(left()).toBeInTheDocument();
    expect(right()).toBeInTheDocument();

    layout.scrollLeft = 300; // 300 + 400 = 700 (fim)
    act(() => {
      fireEvent.scroll(bar);
    });
    expect(left()).toBeInTheDocument();
    expect(right()).not.toBeInTheDocument();
  });

  it("a sub-pixel remainder at the end does not leave a ghost right arrow", () => {
    layout.scrollWidth = 700;
    const bar = renderBar();
    layout.scrollLeft = 299.5;
    act(() => {
      fireEvent.scroll(bar);
    });
    expect(right()).not.toBeInTheDocument();
  });

  it("the arrows scroll the bar smoothly in their direction", () => {
    layout.scrollWidth = 700;
    const bar = renderBar();
    fireEvent.click(right() as HTMLElement);
    expect(scrollBy).toHaveBeenLastCalledWith({
      left: 200,
      behavior: "smooth",
    });

    layout.scrollLeft = 200;
    act(() => {
      fireEvent.scroll(bar);
    });
    fireEvent.click(left() as HTMLElement);
    expect(scrollBy).toHaveBeenLastCalledWith({
      left: -200,
      behavior: "smooth",
    });
  });

  it("re-evaluates when the window is resized", () => {
    const bar = renderBar();
    expect(right()).not.toBeInTheDocument();

    layout.scrollWidth = 700;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(right()).toBeInTheDocument();
    expect(bar).toBeInTheDocument();
  });
});
