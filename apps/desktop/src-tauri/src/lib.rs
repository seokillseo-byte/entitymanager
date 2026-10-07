use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[tauri::command]
fn app_health() -> &'static str {
    "EntityManager desktop shell is ready"
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoneySiteRecord {
    domain: String,
    homepage_url: String,
    sitemap_url: String,
    language: String,
    target_country: String,
    industry: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IntegrationSettingRecord {
    setting_type: String,
    provider: String,
    api_key: String,
    is_enabled: bool,
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

#[tauri::command]
fn get_money_site(app_handle: tauri::AppHandle) -> Result<MoneySiteRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;

    let mut statement = connection
        .prepare(
            "SELECT domain, homepage_url, sitemap_url, language, target_country, industry
             FROM money_sites
             WHERE id = 1",
        )
        .map_err(|error| error.to_string())?;

    let result = statement.query_row([], |row| {
        Ok(MoneySiteRecord {
            domain: row.get(0)?,
            homepage_url: row.get(1)?,
            sitemap_url: row.get(2)?,
            language: row.get(3)?,
            target_country: row.get(4)?,
            industry: row.get(5)?,
        })
    });

    match result {
        Ok(record) => Ok(record),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            let fallback = default_money_site();
            save_money_site_record(&connection, &fallback)?;
            Ok(fallback)
        }
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_money_site(
    app_handle: tauri::AppHandle,
    money_site: MoneySiteRecord,
) -> Result<MoneySiteRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    save_money_site_record(&connection, &money_site)?;

    Ok(money_site)
}

#[tauri::command]
fn get_integration_settings(app_handle: tauri::AppHandle) -> Result<Vec<IntegrationSettingRecord>, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    ensure_default_settings(&connection)?;

    let mut statement = connection
        .prepare(
            "SELECT setting_type, provider, api_key, is_enabled
             FROM integration_settings
             ORDER BY setting_type",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(IntegrationSettingRecord {
                setting_type: row.get(0)?,
                provider: row.get(1)?,
                api_key: row.get(2)?,
                is_enabled: row.get::<_, i64>(3)? == 1,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_integration_setting(
    app_handle: tauri::AppHandle,
    setting: IntegrationSettingRecord,
) -> Result<IntegrationSettingRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;

    connection
        .execute(
            "INSERT INTO integration_settings (setting_type, provider, api_key, is_enabled)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(setting_type)
             DO UPDATE SET provider = excluded.provider,
                           api_key = excluded.api_key,
                           is_enabled = excluded.is_enabled",
            params![
                setting.setting_type,
                setting.provider,
                setting.api_key,
                if setting.is_enabled { 1 } else { 0 }
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(setting)
}

fn open_database(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let database_path = database_path(app_handle)?;
    Connection::open(database_path).map_err(|error| error.to_string())
}

fn database_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;

    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    Ok(directory.join("entitymanager.db"))
}

fn ensure_schema(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS money_sites (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                domain TEXT NOT NULL,
                homepage_url TEXT NOT NULL,
                sitemap_url TEXT NOT NULL,
                language TEXT NOT NULL,
                target_country TEXT NOT NULL,
                industry TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS integration_settings (
                setting_type TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                api_key TEXT NOT NULL DEFAULT '',
                is_enabled INTEGER NOT NULL DEFAULT 0
            );
            ",
        )
        .map_err(|error| error.to_string())
}

fn save_money_site_record(connection: &Connection, money_site: &MoneySiteRecord) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO money_sites (id, domain, homepage_url, sitemap_url, language, target_country, industry)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id)
             DO UPDATE SET domain = excluded.domain,
                           homepage_url = excluded.homepage_url,
                           sitemap_url = excluded.sitemap_url,
                           language = excluded.language,
                           target_country = excluded.target_country,
                           industry = excluded.industry",
            params![
                money_site.domain,
                money_site.homepage_url,
                money_site.sitemap_url,
                money_site.language,
                money_site.target_country,
                money_site.industry
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn ensure_default_settings(connection: &Connection) -> Result<(), String> {
    let defaults = [
        ("ai", "Gemini"),
        ("captcha", "2Captcha / CapSolver"),
        ("email", "IMAP / Gmail API"),
        ("proxy", "Custom proxy"),
        ("indexing", "IndexNow / Google API"),
    ];

    for (setting_type, provider) in defaults {
        connection
            .execute(
                "INSERT OR IGNORE INTO integration_settings (setting_type, provider, api_key, is_enabled)
                 VALUES (?1, ?2, '', 0)",
                params![setting_type, provider],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn default_money_site() -> MoneySiteRecord {
    MoneySiteRecord {
        domain: "example-money-site.com".to_string(),
        homepage_url: "https://example-money-site.com".to_string(),
        sitemap_url: "https://example-money-site.com/sitemap.xml".to_string(),
        language: "Vietnamese".to_string(),
        target_country: "Vietnam".to_string(),
        industry: "SEO services".to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            app_health,
            local_config_path,
            get_money_site,
            save_money_site,
            get_integration_settings,
            save_integration_setting
        ])
        .run(tauri::generate_context!())
        .expect("error while running EntityManager");
}
