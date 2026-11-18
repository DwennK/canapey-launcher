import { describe, it, expect } from "vitest";
import { navigate, reconcileSelection } from "../src/lib/navigation";

describe("sofa navigation", () => {
  it("preserves selection when switching carousel and grid", () => {
    expect(navigate(3, 9, 4, "carousel", "down")).toEqual({
      index: 3,
      view: "grid",
    });
    expect(navigate(3, 9, 4, "grid", "up")).toEqual({
      index: 3,
      view: "carousel",
    });
    expect(navigate(7, 9, 4, "grid", "back")).toEqual({
      index: 7,
      view: "carousel",
    });
  });
  it("handles incomplete final rows without losing focus", () => {
    expect(navigate(7, 9, 4, "grid", "down").index).toBe(8);
    expect(navigate(8, 9, 4, "grid", "right").index).toBe(8);
    expect(navigate(4, 9, 4, "grid", "left").index).toBe(4);
  });
  it("clamps stale selection after removal and never wraps carousel edges", () => {
    expect(navigate(10, 3, 4, "carousel", "right").index).toBe(2);
    expect(navigate(0, 3, 4, "carousel", "left").index).toBe(0);
    expect(navigate(0, 0, 4, "grid", "down").index).toBe(0);
  });
  it("reconciles stored IDs and uses current grid columns after TV resize", () => {
    expect(reconcileSelection(["a", "b"], "b")).toBe(1);
    expect(reconcileSelection(["a", "b"], "removed")).toBe(0);
    expect(navigate(4, 8, 2, "grid", "up")).toEqual({ index: 2, view: "grid" });
    expect(navigate(4, 8, 5, "grid", "up")).toEqual({
      index: 4,
      view: "carousel",
    });
  });
});

import { targetKey } from "../src/lib/types";
it("normalizes Windows paths but preserves case-sensitive web paths and PWA arguments", () => {
  const target = {
    kind: "executable" as const,
    value: "C:/Apps/Test.exe",
    args: [],
    workingDir: null,
  };
  expect(targetKey(target)).toBe(
    targetKey({ ...target, value: "c:\\apps\\TEST.exe" }),
  );
  expect(targetKey({ ...target, args: ["--app=A"] })).not.toBe(
    targetKey({ ...target, args: ["--app=B"] }),
  );
  expect(
    targetKey({ ...target, kind: "uri", value: "https://example.com/A" }),
  ).not.toBe(
    targetKey({ ...target, kind: "uri", value: "https://example.com/a" }),
  );
});

import { directionalTarget, type FocusRect } from '../src/lib/navigation';
const rect = (x: number, y: number, width = 100, height = 50): FocusRect => ({ x, y, width, height });
describe('directional menu navigation', () => {
  it('visits the next row even when its controls are far to the left', () => {
    const items = [rect(800, 0), rect(0, 80), rect(800, 180)];
    expect(directionalTarget(items, 0, 'down')).toBe(1);
    expect(directionalTarget(items, 2, 'up')).toBe(1);
  });
  it('keeps the action column when an adjacent label is taller', () => {
    const items = [rect(400, 10, 48, 48), rect(0, 95, 350, 68), rect(400, 105, 48, 48)];
    expect(directionalTarget(items, 0, 'down')).toBe(2);
  });
  it('keeps horizontal movement in the same row and never wraps at an edge', () => {
    const items = [rect(0, 0), rect(130, 0), rect(0, 80), rect(130, 80)];
    expect(directionalTarget(items, 1, 'right')).toBe(1);
    expect(directionalTarget(items, 0, 'left')).toBe(0);
    expect(directionalTarget(items, 1, 'down')).toBe(3);
    expect(directionalTarget(items, 2, 'up')).toBe(0);
    expect(directionalTarget(items, 3, 'down')).toBe(3);
  });
  it('handles uneven keyboard rows and buttons of different heights', () => {
    const items = [rect(0, 0), rect(130, 0), rect(65, 80, 100, 44), rect(0, 150, 250, 60)];
    expect(directionalTarget(items, 1, 'down')).toBe(2);
    expect(directionalTarget(items, 2, 'down')).toBe(3);
    expect(directionalTarget(items, 0, 'right')).toBe(1);
    expect(directionalTarget(items, 1, 'right')).toBe(1);
  });
  it('does not turn a small vertical offset into a jump within the current row', () => {
    const items = [rect(0, 10, 100, 40), rect(130, 0, 100, 80), rect(0, 100)];
    expect(directionalTarget(items, 0, 'down')).toBe(2);
    expect(directionalTarget(items, 0, 'right')).toBe(1);
    expect(directionalTarget([], 0, 'down')).toBe(0);
  });
});
