#[tauri::command]
fn app_health() -> &'static str {
    "EntityManager desktop shell is ready"
}

#[tauri::command]
fn local_config_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = app_handle
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("entitymanager.settings.json");

    Ok(path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![app_health, local_config_path])
        .run(tauri::generate_context!())
        .expect("error while running EntityManager");
}
