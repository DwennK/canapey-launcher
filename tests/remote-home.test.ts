import { describe, expect, it } from "vitest";
import { captureShortcut, shortcutLabel, validRemoteShortcut } from "../src/lib/remote-home";
function event(key: string, code = key, options: Partial<KeyboardEvent> = {}) {
  return { key, code, repeat: false, isComposing: false, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, getModifierState: () => false, ...options } as KeyboardEvent;
}
describe("remote Home capture", () => {
  it("captures a dedicated key or Ctrl Alt letter and labels it", () => {
    expect(captureShortcut(event("Home"))).toEqual({ code: "Home", ctrl: false, alt: false, shift: false });
    const key = captureShortcut(event("h", "KeyH", { ctrlKey: true, altKey: true }));
    expect(shortcutLabel(key)).toBe("Ctrl + Alt + H");
  });
  it("uses the logical letter on AZERTY", () => {
    expect(captureShortcut(event("a", "KeyQ", { ctrlKey: true, altKey: true }))?.code).toBe("KeyA");
  });
  it("ignores modifiers, composition and repeats", () => {
    for (const key of ["Control", "Alt", "Shift", "Meta", "AltGraph"]) expect(captureShortcut(event(key))).toBeNull();
    expect(captureShortcut(event("F10", "F10", { repeat: true }))).toBeNull();
    expect(captureShortcut(event("h", "KeyH", { isComposing: true }))).toBeNull();
  });
  it("protects navigation and ordinary typing and Windows combinations", () => {
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape", "Backspace", "Tab", " ", "h", "F1", "F12"]) expect(() => captureShortcut(event(key))).toThrow();
    expect(() => captureShortcut(event("Home", "Home", { metaKey: true }))).toThrow();
    expect(() => captureShortcut(event("h", "KeyH", { ctrlKey: true, altKey: true, getModifierState: () => true }))).toThrow();
  });
  it("accepts supported function keys, rejects malformed/out-of-range values", () => {
    for (const code of ["F2", "F11", "F13", "F24", "Home", "Pause"]) expect(validRemoteShortcut({ code, ctrl: false, alt: false, shift: false })).toBe(true);
    for (const code of ["F02", "F12", "F25", "KeyAA"]) expect(validRemoteShortcut({ code, ctrl: false, alt: false, shift: false })).toBe(false);
  });
});

describe('full remote mapping', () => {
  it('learns navigation, Enter and Escape locally, without cancelling capture', () => {
    for (const key of ['ArrowUp', 'Enter', 'Escape', 'Backspace', 'F1']) expect(captureShortcut(event(key), false)?.code).toBe(key);
    expect(captureShortcut(event(' ', 'Space'), false)?.code).toBe('Space');
    expect(() => captureShortcut(event('F4','F4',{altKey:true}),false)).toThrow();
    expect(() => captureShortcut(event('Q','KeyQ',{ctrlKey:true,shiftKey:true}),false)).toThrow();
    expect(() => captureShortcut(event('AudioVolumeUp'),false)).toThrow();
  });
});
