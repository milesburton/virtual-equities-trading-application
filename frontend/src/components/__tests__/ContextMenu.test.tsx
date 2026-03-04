import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ContextMenuEntry } from "../ContextMenu";
import { ContextMenu } from "../ContextMenu";

const baseItems: ContextMenuEntry[] = [
  { label: "Copy symbol", icon: "⎘", onClick: vi.fn() },
  { label: "View chart", onClick: vi.fn() },
];

function renderMenu(overrides?: {
  items?: ContextMenuEntry[];
  x?: number;
  y?: number;
  onClose?: () => void;
}) {
  const onClose = overrides?.onClose ?? vi.fn();
  render(
    <ContextMenu
      items={overrides?.items ?? baseItems}
      x={overrides?.x ?? 100}
      y={overrides?.y ?? 100}
      onClose={onClose}
    />
  );
  return { onClose };
}

describe("ContextMenu – rendering", () => {
  it("renders with role=menu", () => {
    renderMenu();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("renders menu items as menuitem buttons", () => {
    renderMenu();
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);
  });

  it("renders item labels", () => {
    renderMenu();
    expect(screen.getByText("Copy symbol")).toBeInTheDocument();
    expect(screen.getByText("View chart")).toBeInTheDocument();
  });

  it("renders separators as non-button elements", () => {
    const itemsWithSep: ContextMenuEntry[] = [
      { label: "Item A", onClick: vi.fn() },
      { separator: true },
      { label: "Item B", onClick: vi.fn() },
    ];
    renderMenu({ items: itemsWithSep });
    // Only 2 menuitem buttons, not 3
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("renders disabled items as disabled buttons", () => {
    const items: ContextMenuEntry[] = [
      { label: "Disabled item", disabled: true, onClick: vi.fn() },
    ];
    renderMenu({ items });
    expect(screen.getByRole("menuitem")).toBeDisabled();
  });
});

describe("ContextMenu – interactions", () => {
  it("calls onClick and onClose when a menu item is clicked", () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    const items: ContextMenuEntry[] = [{ label: "Do thing", onClick }];
    render(<ContextMenu items={items} x={100} y={100} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem"));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClick when a disabled item is clicked", () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    const items: ContextMenuEntry[] = [{ label: "Disabled", disabled: true, onClick }];
    render(<ContextMenu items={items} x={100} y={100} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem"));
    expect(onClick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape key is pressed", () => {
    const { onClose } = renderMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when clicking outside the menu", () => {
    const { onClose } = renderMenu();
    // Click on document body (outside menu)
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose when clicking inside the menu", () => {
    const { onClose } = renderMenu();
    const menu = screen.getByRole("menu");
    fireEvent.mouseDown(menu);
    expect(onClose).not.toHaveBeenCalled();
  });
});
