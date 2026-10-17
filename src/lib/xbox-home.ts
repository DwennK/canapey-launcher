import { invoke } from "@tauri-apps/api/core";
export interface XboxHomeStatus {
  available: boolean;
  connected: boolean;
  test: "idle" | "listening" | "detected" | "timeout";
}
export const xboxHomeStatus = () => invoke<XboxHomeStatus>("xbox_home_status");
export const testXboxButton = () => invoke<XboxHomeStatus>("test_xbox_button");
export const cancelXboxTest = () => invoke<void>("cancel_xbox_test");
export const openGameBarSettings = () => invoke<void>("open_game_bar_settings");
