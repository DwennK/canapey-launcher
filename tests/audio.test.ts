import { describe, expect, it, vi } from "vitest";
import { createAudioControls } from "../src/lib/audio";
import type { AudioState } from "../src/lib/types";
const snapshot = (volume = 40, defaultId = "tv"): AudioState => ({
  outputs: [
    { id: "tv", name: "TV" },
    { id: "headset", name: "Casque" },
  ],
  defaultId,
  volume,
  muted: false,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
describe("audio commands", () => {
  it("serializes and coalesces rapid volume input without losing the last value", async () => {
    const first = deferred<AudioState>();
    const api = {
      audioState: vi.fn().mockResolvedValue(snapshot()),
      changeAudio: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue(snapshot(48)),
    };
    const audio = createAudioControls(api);
    await audio.refresh();
    audio.setVolume(42);
    audio.setVolume(44);
    audio.setVolume(46);
    audio.setVolume(48);
    expect(audio.volume.value).toBe(48);
    expect(api.changeAudio).toHaveBeenCalledTimes(1);
    await audio.refresh(); // Never read over an in-flight mutation.
    expect(api.audioState).toHaveBeenCalledTimes(1);
    first.resolve(snapshot(42));
    await settle();
    expect(api.changeAudio.mock.calls.map((c) => c[0].value)).toEqual([42, 48]);
    expect(audio.state.value?.volume).toBe(48);
  });
  it("waits for an outstanding read and keeps the original device identity", async () => {
    const read = deferred<AudioState>();
    const api = {
      audioState: vi
        .fn()
        .mockResolvedValueOnce(snapshot())
        .mockReturnValueOnce(read.promise),
      changeAudio: vi.fn().mockRejectedValue("Sortie modifiée"),
    };
    const audio = createAudioControls(api);
    await audio.refresh();
    const polling = audio.refresh();
    audio.setVolume(50);
    expect(api.changeAudio).not.toHaveBeenCalled();
    api.audioState.mockResolvedValue(snapshot(30, "headset"));
    read.resolve(snapshot(30, "headset"));
    await polling;
    await settle();
    expect(api.changeAudio).toHaveBeenCalledWith({
      kind: "volume",
      id: "tv",
      value: 50,
    });
    expect(audio.error.value).toBe("Sortie modifiée");
    expect(audio.volume.value).toBe(30);
  });
  it("does not allow volume on a device during an output switch", async () => {
    const change = deferred<AudioState>();
    const api = {
      audioState: vi.fn().mockResolvedValue(snapshot()),
      changeAudio: vi.fn().mockReturnValue(change.promise),
    };
    const audio = createAudioControls(api);
    await audio.refresh();
    audio.setOutput("headset");
    audio.setVolume(80);
    audio.toggleMute();
    expect(api.changeAudio).toHaveBeenCalledTimes(1);
    change.resolve(snapshot(20, "headset"));
    await settle();
    expect(audio.volume.value).toBe(20);
  });
  it("recovers after an error and discards queued writes", async () => {
    const change = deferred<AudioState>();
    const api = {
      audioState: vi.fn().mockResolvedValue(snapshot()),
      changeAudio: vi.fn().mockImplementation(async () => {
        await change.promise;
        throw Error("Déconnecté");
      }),
    };
    const audio = createAudioControls(api);
    await audio.refresh();
    audio.setVolume(60);
    audio.setVolume(80);
    change.resolve(snapshot());
    await settle();
    expect(api.changeAudio).toHaveBeenCalledTimes(1);
    expect(audio.volume.value).toBe(40);
    expect(audio.error.value).toContain("Déconnecté");
    await audio.refresh(true);
    expect(audio.error.value).toBe("");
  });
  it("makes no mutation without a default device and recovers from read failure", async () => {
    const api = {
      audioState: vi
        .fn()
        .mockRejectedValueOnce("Service indisponible")
        .mockResolvedValue({
          outputs: [],
          defaultId: null,
          volume: null,
          muted: false,
        }),
      changeAudio: vi.fn(),
    };
    const audio = createAudioControls(api);
    await audio.refresh();
    expect(audio.error.value).toBe("Service indisponible");
    await audio.refresh();
    audio.setVolume(10);
    audio.toggleMute();
    audio.setOutput("missing");
    expect(api.changeAudio).not.toHaveBeenCalled();
    expect(audio.error.value).toBe("");
  });
});
