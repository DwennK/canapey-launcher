import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({ native: true, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => backend.native,
  invoke: backend.invoke,
  convertFileSrc: (path: string) => path,
}));

describe("startup visibility handshake", () => {
  let frames: FrameRequestCallback[];
  beforeEach(() => {
    vi.resetModules();
    backend.native = true;
    backend.invoke.mockReset().mockResolvedValue(undefined);
    performance.clearMarks();
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => frames.push(fn));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the hidden native window before requesting frames and reports after two frames", async () => {
    let shown!: () => void;
    backend.invoke.mockReturnValueOnce(new Promise<void>((resolve) => { shown = resolve; }));
    const { ready } = await import("../src/lib/bridge");
    const pending = ready();
    expect(backend.invoke).toHaveBeenCalledWith("frontend_ready", { frontendMs: expect.any(Number) });
    expect(frames).toHaveLength(0);
    shown();
    await Promise.resolve();
    frames.shift()!(performance.now());
    expect(backend.invoke).toHaveBeenCalledTimes(1);
    frames.shift()!(performance.now());
    await pending;
    expect(backend.invoke).toHaveBeenLastCalledWith("frontend_painted", {
      timings: expect.objectContaining({ painted: expect.any(Number), bootstrapEnd: null }),
    });
    expect(frames).toHaveLength(0);
  });

  it("keeps browser preview measurable without invoking native commands", async () => {
    backend.native = false;
    const { ready } = await import("../src/lib/bridge");
    const pending = ready();
    frames.shift()!(performance.now());
    frames.shift()!(performance.now());
    await pending;
    expect(backend.invoke).not.toHaveBeenCalled();
    expect(performance.getEntriesByName("canapey:painted")).toHaveLength(1);
  });
});
