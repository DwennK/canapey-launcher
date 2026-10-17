import { describe, expect, it } from "vitest";
import { captureShortcut, shortcutLabel, validRemoteShortcut } from "../src/lib/remote-home";
import { remoteActions, sameShortcut } from '../src/lib/remote-layout';
function event(key: string, code = key, options: Partial<KeyboardEvent> = {}) {
  return { key, code, repeat: false, isComposing: false, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, getModifierState: () => false, ...options } as KeyboardEvent;
}
describe("global remote capture", () => {
  it("learns ordinary keys, navigation and media without modifiers", () => {
    for (const code of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter','Escape','Backspace','Tab','F1','F24','AudioVolumeUp','MediaPlayPause','Semicolon']) {
      expect(captureShortcut(event(code))?.code).toBe(code);
    }
    expect(captureShortcut(event(' ', 'Space'))?.code).toBe('Space');
    expect(captureShortcut(event('h', 'KeyH'))?.code).toBe('KeyH');
    expect(captureShortcut(event('AudioVolumeMute', 'Unidentified'))?.code).toBe('AudioVolumeMute');
    expect(shortcutLabel(captureShortcut(event('h','KeyH',{ctrlKey:true,altKey:true})))).toBe('Ctrl + Alt + H');
  });
  it("uses logical AZERTY letters but preserves numpad digits", () => {
    expect(captureShortcut(event('a','KeyQ'))?.code).toBe('KeyA');
    expect(captureShortcut(event('1','Numpad1'))?.code).toBe('Numpad1');
    expect(captureShortcut(event('1','Digit1'))?.code).toBe('Digit1');
    expect(captureShortcut(event('End','Numpad1'))?.code).toBe('End');
  });
  it("normalizes Windows aliases to avoid duplicate reservations", () => {
    const enter = captureShortcut(event('Enter','NumpadEnter'))!;
    expect(enter.code).toBe('Enter');
    expect(sameShortcut(enter,{...enter,code:'NumpadEnter'})).toBe(true);
    expect(captureShortcut(event('MediaPause'))?.code).toBe('Pause');
  });
  it("ignores modifiers, composition and repeats", () => {
    for (const key of ['Control','Alt','Shift','Meta','AltGraph']) expect(captureShortcut(event(key))).toBeNull();
    expect(captureShortcut(event('F10','F10',{repeat:true}))).toBeNull();
    expect(captureShortcut(event('h','KeyH',{isComposing:true}))).toBeNull();
  });
  it("rejects system shortcuts and unsupported or malformed keys", () => {
    for (const code of ['F02','F12','F25','KeyAA','NumpadEqual']) expect(validRemoteShortcut({code,ctrl:false,alt:false,shift:false})).toBe(false);
    for (const input of [event('Home','Home',{metaKey:true}),event('Tab','Tab',{altKey:true}),event('F4','F4',{altKey:true}),event('Delete','Delete',{ctrlKey:true,altKey:true}),event('Escape','Escape',{ctrlKey:true,shiftKey:true}),event('Q','KeyQ',{ctrlKey:true,shiftKey:true})]) expect(()=>captureShortcut(input)).toThrow();
  });
  it("makes every offered action available globally", () => {
    expect(remoteActions.every(action=>action.global)).toBe(true);
  });
});
