use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const MAX_BACKUP_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopInfo {
    version: String,
    platform: String,
    arch: String,
    data_dir: String,
    native_backup: bool,
}

fn json_path(mut path: PathBuf) -> PathBuf {
    if path.extension().is_none() {
        path.set_extension("json");
    }
    path
}

fn display_path(path: &Path) -> String {
    path.display().to_string()
}

fn validate_backup(payload: &str) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(payload)
        .map(|_| ())
        .map_err(|_| "Refusing to write an invalid companion backup.".to_string())
}

fn validated_external_url(raw: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(raw).map_err(|_| "Invalid external URL.".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Only HTTP and HTTPS links can be opened.".to_string());
    }
    Ok(parsed)
}

#[tauri::command]
fn desktop_info(app: AppHandle) -> Result<DesktopInfo, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(DesktopInfo {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        data_dir: display_path(&data_dir),
        native_backup: true,
    })
}

#[tauri::command]
async fn export_backup(
    app: AppHandle,
    payload: String,
    suggested_name: String,
) -> Result<Option<String>, String> {
    validate_backup(&payload)?;

    let file_name = if suggested_name.trim().is_empty() {
        "er-companion-backup.json".to_string()
    } else {
        suggested_name
    };

    let (tx, rx) = std::sync::mpsc::channel::<Result<Option<PathBuf>, String>>();
    app.dialog()
        .file()
        .set_title("Export companion backup")
        .set_file_name(&file_name)
        .add_filter("ER Companion backup", &["json"])
        .save_file(move |selected| {
            let result = match selected {
                Some(file) => file
                    .into_path()
                    .map(Some)
                    .map_err(|error| format!("Invalid save location: {error}")),
                None => Ok(None),
            };
            let _ = tx.send(result);
        });

    let selected = tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|error| format!("Save dialog task failed: {error}"))?
        .map_err(|_| "Save dialog closed without a result.".to_string())??;

    let Some(path) = selected else {
        return Ok(None);
    };
    let path = json_path(path);

    fs::write(&path, payload.as_bytes())
        .map_err(|error| format!("Could not write {}: {error}", display_path(&path)))?;

    Ok(Some(display_path(&path)))
}

#[tauri::command]
async fn import_backup(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<Option<PathBuf>, String>>();
    app.dialog()
        .file()
        .set_title("Import companion backup")
        .add_filter("ER Companion backup", &["json"])
        .pick_file(move |selected| {
            let result = match selected {
                Some(file) => file
                    .into_path()
                    .map(Some)
                    .map_err(|error| format!("Invalid backup location: {error}")),
                None => Ok(None),
            };
            let _ = tx.send(result);
        });

    let selected = tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|error| format!("Open dialog task failed: {error}"))?
        .map_err(|_| "Open dialog closed without a result.".to_string())??;

    let Some(path) = selected else {
        return Ok(None);
    };
    let metadata =
        fs::metadata(&path).map_err(|error| format!("Could not read {}: {error}", display_path(&path)))?;

    if metadata.len() > MAX_BACKUP_BYTES {
        return Err("That backup is larger than 64 MiB and was not opened.".to_string());
    }

    fs::read_to_string(&path)
        .map(Some)
        .map_err(|error| format!("Could not read {}: {error}", display_path(&path)))
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = validated_external_url(&url)?;
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|error| format!("Could not open the system browser: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Some WebKitGTK 2.5x / Mesa combinations render a blank webview when the
    // DMABUF renderer is enabled (notably software and remote X sessions).
    // The app is static content, so the shared-memory fallback is the safe
    // default; advanced users can override the variable before launch.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            desktop_info,
            export_backup,
            import_backup,
            open_external
        ])
        .run(tauri::generate_context!())
        .expect("error while running ER Companion");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_json_extension_only_when_missing() {
        assert_eq!(json_path(PathBuf::from("save")), PathBuf::from("save.json"));
        assert_eq!(json_path(PathBuf::from("save.json")), PathBuf::from("save.json"));
    }

    #[test]
    fn rejects_invalid_backup_payloads() {
        assert!(validate_backup("{\"schemaVersion\":1}").is_ok());
        assert!(validate_backup("not json").is_err());
        assert!(validate_backup("").is_err());
    }

    #[test]
    fn only_allows_http_and_https_links() {
        assert_eq!(
            validated_external_url("https://eldenring.redmaw.dev/")
                .expect("https is allowed")
                .scheme(),
            "https"
        );
        assert_eq!(
            validated_external_url("http://localhost:3000")
                .expect("http is allowed")
                .scheme(),
            "http"
        );
        assert!(validated_external_url("file:///etc/passwd").is_err());
        assert!(validated_external_url("javascript:alert(1)").is_err());
        assert!(validated_external_url("not a url").is_err());
    }
}
