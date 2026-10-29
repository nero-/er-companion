# Desktop application

The companion ships as a **Tauri 2** desktop application for Linux, macOS, and Windows. It uses the same React renderer and generated content pack as the PWA; the Rust layer owns the native window, system save/open dialogs, and external-browser links.

## Commands

```bash
# Development window with Vite HMR
npm run desktop:dev

# Host-platform installers
npm run desktop:build

# Rust-only compile check
npm run desktop:check
```

`npm run desktop:build` runs the renderer build first, then compiles the Rust application in release mode. Tauri builds the host platform; the GitHub Actions matrix builds all three platforms.

## Prerequisites

| Platform | Requirements |
|---|---|
| Linux | Rust stable via `rustup`; `webkit2gtk-4.1`; GTK 3; `librsvg`; a C toolchain. Arch: `base-devel webkit2gtk-4.1 librsvg openssl`. Debian/Ubuntu: `build-essential libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev`. |
| macOS | Xcode Command Line Tools and Rust stable. |
| Windows | Rust stable, Visual Studio Build Tools with the C++ workload, and WebView2 (present on current Windows 10/11). |

The repository does not vendor a Rust toolchain. Install it with:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## Native behavior

- **Backups:** `Export backup` and `Import` use the operating system's file dialogs. Rust validates that exports are JSON before writing, caps imports at 64 MiB, and returns the chosen path. The renderer still owns the save schema and normalization.
- **Progress storage:** the app's private WebView data directory, shown in **Settings → Data & backups**.
- **External links:** clicks on `http`/`https` anchors are intercepted and opened in the default browser. Only `http` and `https` schemes are accepted by the Rust command.
- **Offline:** all content, fonts, and art ship inside the binary. The PWA service worker is intentionally omitted from Tauri builds; local assets are already immutable.
- **No accounts, telemetry, or runtime API calls.**
- **Window sizing:** the window opens at 82% × 86% of the current monitor (clamped 1024–1920 × 700–1280 logical pixels) and recentres, so 1440p/4K displays do not open a small fixed window.
- **Quick log:** `Ctrl+Shift+L` is a global shortcut that marks the next route step done through the same store action as the UI. It is registered with `tauri-plugin-global-shortcut` and forwarded to the renderer as `er-companion:quick-log`.
- **Linux renderer fallback:** the Rust entrypoint sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` by default on Linux. WebKitGTK 2.5x with Mesa can otherwise render a blank webview under software/remote X sessions. The variable is only a fallback; it can be overridden before launch. This was verified by isolating the blank window under Xvfb.

## Build outputs

| Platform | Bundles |
|---|---|
| Linux | `.deb`, AppImage, RPM (host tools permitting) |
| macOS | universal `.app` and `.dmg` (CI) |
| Windows | NSIS `.exe` installer; MSI when built explicitly |

Artifacts are under `src-tauri/target/release/bundle/` (or `src-tauri/target/<target>/release/bundle/` for cross-target builds such as macOS universal).

## Cross-platform CI

`.github/workflows/desktop.yml` runs on manual dispatch and `v*` tags:

- Ubuntu 22.04 → DEB and AppImage
- macOS 14 → universal Apple Silicon + Intel DMG/app
- Windows → NSIS installer

It runs the renderer typecheck and tests on every target, runs the Rust validation tests on Linux, and uploads installers as workflow artifacts for 14 days. It does not publish a release or sign binaries.

## Verification on Linux

The Linux x86_64 build was verified locally on 2026-10-22:

| Check | Result |
|---|---|
| Rust toolchain | 1.99.1 |
| Tauri CLI / crate | 2.12.4 / 2.12.5 |
| Renderer typecheck | clean |
| Frontend tests | 34 passed |
| Rust tests | 3 passed |
| Desktop asset build | 17,961.49 kB JS (1,935.54 kB gzip), no `sw.js` or SW registration |
| Release binary | 20 MB |
| Debian package | 8.39 MiB |
| Native export | system save dialog wrote a valid 2,510-byte JSON backup |
| Native import | restored that backup; in-app confirmation shown |
| Development mode | `npm run desktop:dev` launched, served Vite, and rendered the dashboard with 0 startup errors |
| Cross-platform CI | GitHub Actions run `39902191472`: Linux, macOS universal, and Windows all passed |
| Published assets | private `v1.0.0` release: DEB 8.4 MB, AppImage 84 MB, universal DMG 15 MB, Windows NSIS 6.3 MB |

The window was launched under Xvfb with dwm and rendered Settings, the desktop host card, and both native dialogs. macOS and Windows bundles were compiled successfully by the CI matrix but were not launched on those operating systems from this Linux host.

## Signing and distribution

No signing identities are configured. Unsigned macOS bundles trigger Gatekeeper warnings; unsigned Windows installers trigger SmartScreen warnings. Public distribution needs, at minimum:

- an Apple Developer ID certificate plus notarization,
- an Authenticode certificate for Windows,
- a distribution review for the bundled Redmaw-derived guide text, wiki facts, and official artwork.

The app is an unofficial fan project and is not affiliated with FromSoftware, Bandai Namco, or the Redmaw guide.

## Architecture

```text
src/                         shared React renderer
src/lib/desktop.ts           typed Tauri bridge; no-op in the browser
src-tauri/src/lib.rs         window, backup dialogs, URL validation, desktop info
src-tauri/tauri.conf.json    window, CSP, bundle metadata
src-tauri/capabilities/      core window permissions
.github/workflows/desktop.yml  Linux/macOS/Windows builds
```

The browser build remains first-class. `src/lib/desktop.ts` checks for the Tauri runtime before invoking native commands; the PWA keeps its service worker and download/upload backup flow.
