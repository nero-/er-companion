import { invoke } from "@tauri-apps/api/core";

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
