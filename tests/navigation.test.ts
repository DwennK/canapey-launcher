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
