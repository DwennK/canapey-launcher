import { afterEach, describe, expect, it, vi } from "vitest";
import { CardHold } from "../src/lib/hold";

afterEach(() => vi.useRealTimers());
describe("card press arbitration", () => {
  it("releases a short press once and ignores unrelated releases", () => {
    vi.useFakeTimers();
    const open = vi.fn(),
      hold = new CardHold(() => {});
    hold.start("keyboard", open);
    vi.advanceTimersByTime(599);
    expect(hold.release("controller")).toBe(false);
    expect(hold.release("keyboard")).toBe(true);
    expect(hold.release("keyboard")).toBe(false);
    vi.runAllTimers();
    expect(open).not.toHaveBeenCalled();
  });
  it("opens once at 600ms despite repeats and never launches on release", () => {
    vi.useFakeTimers();
    const open = vi.fn(),
      hold = new CardHold(() => {});
    hold.start("controller", open);
    vi.advanceTimersByTime(300);
    hold.start("controller", open);
    vi.advanceTimersByTime(300);
    expect(open).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(hold.release("controller")).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("cancels on lost focus, navigation or disconnect and accepts a fresh press", () => {
    vi.useFakeTimers();
    const open = vi.fn(),
      progress = vi.fn(),
      hold = new CardHold(progress);
    hold.start("keyboard", open);
    vi.advanceTimersByTime(400);
    hold.cancel();
    vi.runAllTimers();
    expect(open).not.toHaveBeenCalled();
    expect(hold.release("keyboard")).toBe(false);
    expect(progress).toHaveBeenLastCalledWith(false);
    hold.start("keyboard", open);
    expect(hold.release("keyboard")).toBe(true);
  });
});
