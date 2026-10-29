import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface DesktopInfo {
  version: string;
  platform: string;
  arch: string;
  dataDir: string;
  nativeBackup: boolean;
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Returns the monitor-aware default window size for the current host. */
export function desktopWindowHint(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 1440, height: 960 };
  return {
    width: Math.round(window.screen.availWidth),
    height: Math.round(window.screen.availHeight),
  };
}

export function getDesktopInfo(): Promise<DesktopInfo> {
  return invoke<DesktopInfo>("desktop_info");
}

export function exportDesktopBackup(payload: string, suggestedName: string): Promise<string | null> {
  return invoke<string | null>("export_backup", { payload, suggestedName });
}

export function importDesktopBackup(): Promise<string | null> {
  return invoke<string | null>("import_backup");
}

export function openExternal(url: string): Promise<void> {
  return invoke<void>("open_external", { url });
}

export function quickLogShortcut(): Promise<string> {
  return invoke<string>("quick_log_shortcut");
}

/** Subscribe to the desktop global shortcut; returns an unlisten function. */
export function onQuickLog(handler: () => void): Promise<() => void> {
  return listen("er-companion:quick-log", () => handler());
}
