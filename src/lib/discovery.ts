import type { AppEntry } from "./types";

// Deliberately narrow: never hide all Microsoft apps or all Windows paths.
const systemExecutables = new Set([
  "cmd.exe", "powershell.exe", "powershell_ise.exe", "pwsh.exe", "wt.exe",
  "regedit.exe", "regedt32.exe", "mmc.exe", "control.exe", "taskmgr.exe",
  "msconfig.exe", "msinfo32.exe", "resmon.exe", "perfmon.exe", "eventvwr.exe",
  "services.exe", "cleanmgr.exe", "dfrgui.exe", "diskpart.exe", "odbcad32.exe",
  "recoverydrive.exe", "systempropertiesadvanced.exe", "optionalfeatures.exe",
  "windowsmemorydiagnostic.exe", "mdsched.exe", "systemsettings.exe",
]);
const systemPackages = new Set([
  "microsoft.windowsterminal", "microsoft.windowsterminalpreview",
  "microsoft.powershell", "microsoft.powershellpreview",
  "microsoft.sechealthui", "microsoft.windows.sechealthui",
  "windows.immersivecontrolpanel", "microsoft.windowsfeedbackhub",
  "microsoft.gethelp", "microsoft.getstarted",
]);
const systemShortcuts = new Set([
  "windows tools", "administrative tools", "windows administrative tools",
  "outils windows", "outils d’administration", "outils d'administration",
  "outils d’administration windows", "outils d'administration windows",
  "system configuration", "configuration du système",
  "system information", "informations système",
  "disk cleanup", "nettoyage de disque",
]);

export function isSystemTool(app: AppEntry): boolean {
  const target = app.target;
  const value = target.value.toLowerCase().replaceAll("/", "\\");
  if (target.kind === "executable")
    return systemExecutables.has(value.split("\\").pop() ?? "");
  if (target.kind === "packaged")
    return systemPackages.has(value.split("_")[0] ?? "");
  if (target.kind === "uri")
    return /^(ms-settings|windowsdefender):/i.test(target.value);
  // Some administrative shortcuts point to folders rather than executables.
  return systemShortcuts.has(app.name.trim().toLowerCase());
}
