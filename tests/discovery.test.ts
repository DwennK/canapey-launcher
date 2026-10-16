import { describe, expect, it } from "vitest";
import { isSystemTool } from "../src/lib/discovery";
import type { AppEntry, Target } from "../src/lib/types";

const app = (kind: Target["kind"], value: string, name = "Application"): AppEntry => ({
  id: "scan-id", name, theme: "home", card: null, background: null,
  icon: null, source: "Windows", target: { kind, value, args: [], workingDir: null },
});

describe("system tool discovery filter", () => {
  it("recognizes executable identities regardless of display language or path case", () => {
    expect(isSystemTool(app("executable", "C:/WINDOWS/System32/CMD.EXE", "Invite de commandes"))).toBe(true);
    expect(isSystemTool(app("executable", "D:\\PowerShell\\7\\pwsh.exe", "Terminal personnalisé"))).toBe(true);
    expect(isSystemTool(app("executable", "C:\\Windows\\System32\\mmc.exe", "Gestion de l’ordinateur"))).toBe(true);
  });
  it("recognizes specific packaged tools and settings URIs", () => {
    expect(isSystemTool(app("packaged", "Microsoft.WindowsTerminal_8wekyb3d8bbwe!App"))).toBe(true);
    expect(isSystemTool(app("packaged", "windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel"))).toBe(true);
    expect(isSystemTool(app("uri", "ms-settings:display"))).toBe(true);
  });
  it("keeps everyday Microsoft apps, browsers, games and ambiguous update launchers", () => {
    for (const entry of [
      app("executable", "C:\\Windows\\explorer.exe"),
      app("executable", "C:\\Windows\\System32\\notepad.exe"),
      app("executable", "C:\\Windows\\System32\\mspaint.exe"),
      app("executable", "C:\\Apps\\msedge.exe"),
      app("executable", "C:\\Apps\\Update.exe", "Discord"),
      app("executable", "C:\\Games\\System Shock\\game.exe", "System Shock"),
      app("packaged", "Microsoft.Windows.Photos_8wekyb3d8bbwe!App"),
      app("packaged", "Microsoft.GamingApp_8wekyb3d8bbwe!App"),
      app("packaged", "Microsoft.ZuneVideo_8wekyb3d8bbwe!App"),
      app("uri", "https://example.com/ms-settings"),
    ]) expect(isSystemTool(entry), entry.target.value).toBe(false);
  });
  it("uses a narrow exact-name fallback only for unresolved shortcuts", () => {
    expect(isSystemTool(app("shortcut", "C:\\Menu\\Tools.lnk", "Outils Windows"))).toBe(true);
    expect(isSystemTool(app("shortcut", "C:\\Menu\\Tools.lnk", "Windows Tools"))).toBe(true);
    expect(isSystemTool(app("shortcut", "C:\\Menu\\Game.lnk", "Windows Tools Simulator"))).toBe(false);
    expect(isSystemTool(app("executable", "C:\\Games\\game.exe", "Windows Tools"))).toBe(false);
  });
});
