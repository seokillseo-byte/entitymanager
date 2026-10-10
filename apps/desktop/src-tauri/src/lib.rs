use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

const SECRET_SERVICE: &str = "EntityManager";
static EXTENSION_BRIDGE_STARTED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn app_health() -> &'static str {
    "EntityManager desktop shell is ready"
}

#[tauri::command]
fn open_latest_release_download(asset_name: String) -> Result<(), String> {
    let valid_name = asset_name == "EntityManager-Chrome-Extension.zip"
        || (asset_name.starts_with("EntityManager_")
            && asset_name.ends_with("_x64-setup.exe")
            && !asset_name.contains('/')
            && !asset_name.contains('\\')
            && !asset_name.contains(".."));
    if !valid_name {
        return Err("Tên tệp tải không được phép.".to_string());
    }
    let url = format!(
        "https://github.com/seokillseo-byte/entitymanager/releases/latest/download/{asset_name}"
    );

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Không mở được trình duyệt để tải tệp: {error}"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Tải tệp qua nút này hiện chỉ được hỗ trợ trên Windows.".to_string())
    }
}

#[tauri::command]
fn open_extension_download() -> Result<(), String> {
    const EXTENSION_DOWNLOAD_URL: &str = "https://github.com/seokillseo-byte/entitymanager/releases/latest/download/EntityManager-Chrome-Extension.zip";

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", EXTENSION_DOWNLOAD_URL])
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Không mở được trình duyệt để tải extension: {error}"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Tải extension qua nút này hiện chỉ được hỗ trợ trên Windows.".to_string())
    }
}

#[tauri::command]
fn start_extension_bridge_server(app_handle: tauri::AppHandle) -> Result<String, String> {
    if EXTENSION_BRIDGE_STARTED.swap(true, Ordering::SeqCst) {
        return Ok("Extension bridge server is already running at http://127.0.0.1:17321".to_string());
    }

    std::thread::spawn(move || {
        if let Ok(listener) = TcpListener::bind("127.0.0.1:17321") {
            for stream in listener.incoming().flatten() {
                handle_extension_bridge_stream(stream, app_handle.clone());
            }
        }
    });

    Ok("Extension bridge server started at http://127.0.0.1:17321".to_string())
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
    key_status: String,
    last_test_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IntegrationAdapterResult {
    #[serde(rename = "type")]
    setting_type: String,
    provider: String,
    is_ready: bool,
    mode: String,
    message: String,
    capabilities: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformRecord {
    id: String,
    name: String,
    #[serde(rename = "type")]
    platform_type: String,
    homepage_url: String,
    authority_score: i64,
    difficulty: String,
    automation_mode: String,
    entity_value: String,
    requires_captcha: bool,
    requires_email: bool,
    notes: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntityProfileRecord {
    id: String,
    profile_type: String,
    brand_name: String,
    legal_name: String,
    short_description: String,
    full_description: String,
    founder_name: String,
    author_name: String,
    email: String,
    phone: String,
    address: String,
    same_as_urls: String,
    target_keywords: String,
    topical_niche: String,
    expertise_proof: String,
    trust_signals: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountRecord {
    id: String,
    platform_id: String,
    platform_name: String,
    recommended_username: String,
    status: String,
    priority: String,
    automation_mode: String,
    evidence_url: String,
    notes: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkflowRunRecord {
    id: String,
    account_id: String,
    platform_name: String,
    action: String,
    status: String,
    message: String,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutomationQueueItem {
    id: String,
    account_id: String,
    platform_name: String,
    gate_type: String,
    status: String,
    payload: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptchaInjectionBridgeRequest {
    queue_id: String,
    account_id: String,
    injector: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptchaInjectionCompleteRequest {
    queue_id: String,
    account_id: String,
    injector: String,
    success: bool,
    evidence_url: String,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptchaInjectionPayload {
    queue_id: String,
    account_id: String,
    platform_name: String,
    website_url: String,
    website_key: String,
    solution_token: String,
    token_field: String,
    action: String,
    next_step: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptchaInjectionResult {
    queue_item: AutomationQueueItem,
    account: AccountRecord,
    workflow_run: WorkflowRunRecord,
    submit_verify_queue_item: Option<AutomationQueueItem>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountSubmitVerifyRequest {
    queue_id: String,
    account_id: String,
    success: bool,
    evidence_url: String,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountSubmitVerifyResult {
    queue_item: AutomationQueueItem,
    account: AccountRecord,
    workflow_run: WorkflowRunRecord,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountSubmitVerifyPayload {
    queue_id: String,
    account_id: String,
    platform_id: String,
    platform_name: String,
    action: String,
    form_values: SubmitVerifyFormValues,
    field_selectors: SubmitVerifyFieldSelectors,
    required_fields: Vec<String>,
    requires_captcha_token: bool,
    submit_selectors: Vec<String>,
    verify_selectors: Vec<String>,
    evidence_capture: String,
    notes: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubmitVerifyFormValues {
    username: String,
    email: String,
    display_name: String,
    bio: String,
    website_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubmitVerifyFieldSelectors {
    username: Vec<String>,
    email: Vec<String>,
    display_name: Vec<String>,
    bio: Vec<String>,
    website_url: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelectorRecipeRecord {
    platform_id: String,
    platform_name: String,
    field_selectors_json: String,
    submit_selectors: String,
    verify_selectors: String,
    required_fields: String,
    requires_captcha_token: bool,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EvidenceRecord {
    id: String,
    title: String,
    evidence_type: String,
    url: String,
    related_platform_id: String,
    notes: String,
    status: String,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DryRunHistoryRecord {
    id: String,
    platform_id: String,
    platform_name: String,
    account_id: String,
    planned_fields: Vec<String>,
    planned_selector: String,
    missing_checks: Vec<String>,
    current_url: String,
    created_at: String,
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
            "SELECT setting_type, provider, api_key, is_enabled, last_test_at
             FROM integration_settings
             ORDER BY setting_type",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            let setting_type: String = row.get(0)?;
            let masked_key: String = row.get(2)?;
            let key_status = if has_secret(&setting_type) {
                "secure".to_string()
            } else {
                key_status_from_mask(&masked_key)
            };

            Ok(IntegrationSettingRecord {
                setting_type,
                provider: row.get(1)?,
                api_key: masked_key,
                is_enabled: row.get::<_, i64>(3)? == 1,
                key_status,
                last_test_at: row.get(4)?,
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
    let (masked_key, key_status) = if setting.api_key.trim().is_empty() {
        let existing_key = existing_integration_key(&connection, &setting.setting_type)?;
        let status = if has_secret(&setting.setting_type) {
            "secure".to_string()
        } else {
            key_status_from_mask(&existing_key)
        };

        (existing_key, status)
    } else {
        save_secret(&setting.setting_type, &setting.api_key)?;
        (mask_secret(&setting.api_key), "secure".to_string())
    };

    connection
        .execute(
            "INSERT INTO integration_settings (setting_type, provider, api_key, is_enabled, key_status)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(setting_type)
             DO UPDATE SET provider = excluded.provider,
                           api_key = excluded.api_key,
                           is_enabled = excluded.is_enabled,
                           key_status = excluded.key_status",
            params![
                setting.setting_type,
                setting.provider,
                masked_key,
                if setting.is_enabled { 1 } else { 0 },
                key_status
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(IntegrationSettingRecord {
        api_key: masked_key,
        key_status,
        ..setting
    })
}

#[tauri::command]
fn test_integration_setting(
    app_handle: tauri::AppHandle,
    setting: IntegrationSettingRecord,
) -> Result<IntegrationAdapterResult, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    let stored_key = existing_integration_key(&connection, &setting.setting_type)?;
    let has_secure_key = has_secret(&setting.setting_type);
    let capabilities = integration_capabilities(&setting.setting_type);
    let is_ready = setting.is_enabled && (has_secure_key || !stored_key.is_empty());
    let message = if is_ready {
        format!("{} adapter is configured for dry-run validation with secure key metadata.", setting.provider)
    } else {
        format!("{} adapter needs an enabled setting and stored key before live use.", setting.provider)
    };
    let timestamp = setting.last_test_at;

    connection
        .execute(
            "UPDATE integration_settings SET last_test_at = ?1 WHERE setting_type = ?2",
            params![timestamp, setting.setting_type],
        )
        .map_err(|error| error.to_string())?;

    Ok(IntegrationAdapterResult {
        setting_type: setting.setting_type,
        provider: setting.provider,
        is_ready,
        mode: "dry_run".to_string(),
        message,
        capabilities,
    })
}

#[tauri::command]
async fn test_live_integration_setting(
    app_handle: tauri::AppHandle,
    setting: IntegrationSettingRecord,
) -> Result<IntegrationAdapterResult, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    let capabilities = integration_capabilities(&setting.setting_type);
    let timestamp = setting.last_test_at.clone();

    if !setting.is_enabled {
        update_integration_test_time(&connection, &setting.setting_type, &timestamp)?;

        return Ok(IntegrationAdapterResult {
            setting_type: setting.setting_type,
            provider: setting.provider,
            is_ready: false,
            mode: "live".to_string(),
            message: "Enable this provider before running a live adapter test.".to_string(),
            capabilities,
        });
    }

    let api_key = match read_secret(&setting.setting_type) {
        Ok(value) if !value.trim().is_empty() => value,
        _ => {
            update_integration_test_time(&connection, &setting.setting_type, &timestamp)?;

            return Ok(IntegrationAdapterResult {
                setting_type: setting.setting_type,
                provider: setting.provider,
                is_ready: false,
                mode: "live".to_string(),
                message: "No encrypted API key found in the OS credential store. Save the key again first.".to_string(),
                capabilities,
            });
        }
    };

    let result = match setting.setting_type.as_str() {
        "ai" => test_live_ai_provider(&setting.provider, &api_key, capabilities).await,
        "captcha" => test_live_captcha_provider(&setting.provider, &api_key, capabilities).await,
        _ => Ok(IntegrationAdapterResult {
            setting_type: setting.setting_type.clone(),
            provider: setting.provider.clone(),
            is_ready: false,
            mode: "live".to_string(),
            message: "Live adapter is currently implemented for AI/Gemini first. This provider is queued for the next adapter pass.".to_string(),
            capabilities,
        }),
    }?;

    update_integration_test_time(&connection, &setting.setting_type, &timestamp)?;

    Ok(result)
}

#[tauri::command]
fn get_platforms(app_handle: tauri::AppHandle) -> Result<Vec<PlatformRecord>, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    ensure_default_platforms(&connection)?;

    let mut statement = connection
        .prepare(
            "SELECT id, name, platform_type, homepage_url, authority_score, difficulty,
                    automation_mode, entity_value, requires_captcha, requires_email, notes
             FROM platforms
             ORDER BY authority_score DESC, name ASC",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(PlatformRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                platform_type: row.get(2)?,
                homepage_url: row.get(3)?,
                authority_score: row.get(4)?,
                difficulty: row.get(5)?,
                automation_mode: row.get(6)?,
                entity_value: row.get(7)?,
                requires_captcha: row.get::<_, i64>(8)? == 1,
                requires_email: row.get::<_, i64>(9)? == 1,
                notes: row.get(10)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_platform(app_handle: tauri::AppHandle, platform: PlatformRecord) -> Result<PlatformRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    save_platform_record(&connection, &platform)?;

    Ok(platform)
}

#[tauri::command]
fn get_selector_recipes(app_handle: tauri::AppHandle) -> Result<Vec<SelectorRecipeRecord>, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    ensure_default_selector_recipes(&connection)?;

    let mut statement = connection
        .prepare(
            "SELECT platform_id, platform_name, field_selectors_json, submit_selectors,
                    verify_selectors, required_fields, requires_captcha_token, updated_at
             FROM selector_recipes
             ORDER BY platform_name ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(SelectorRecipeRecord {
                platform_id: row.get(0)?,
                platform_name: row.get(1)?,
                field_selectors_json: row.get(2)?,
                submit_selectors: row.get(3)?,
                verify_selectors: row.get(4)?,
                required_fields: row.get(5)?,
                requires_captcha_token: row.get::<_, i64>(6)? == 1,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_selector_recipe(
    app_handle: tauri::AppHandle,
    recipe: SelectorRecipeRecord,
) -> Result<SelectorRecipeRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    save_selector_recipe_record(&connection, &recipe)?;

    Ok(recipe)
}

#[tauri::command]
fn get_evidence_records(app_handle: tauri::AppHandle) -> Result<Vec<EvidenceRecord>, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    let mut statement = connection.prepare("SELECT id, title, evidence_type, url, related_platform_id, notes, status, created_at FROM evidence_records ORDER BY created_at DESC").map_err(|error| error.to_string())?;
    let rows = statement.query_map([], |row| Ok(EvidenceRecord {
        id: row.get(0)?, title: row.get(1)?, evidence_type: row.get(2)?, url: row.get(3)?,
        related_platform_id: row.get(4)?, notes: row.get(5)?, status: row.get(6)?, created_at: row.get(7)?,
    })).map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command]
fn save_evidence_record(app_handle: tauri::AppHandle, record: EvidenceRecord) -> Result<EvidenceRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    connection.execute(
        "INSERT INTO evidence_records (id, title, evidence_type, url, related_platform_id, notes, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, evidence_type = excluded.evidence_type,
             url = excluded.url, related_platform_id = excluded.related_platform_id, notes = excluded.notes,
             status = excluded.status, created_at = excluded.created_at",
        params![record.id, record.title, record.evidence_type, record.url, record.related_platform_id, record.notes, record.status, record.created_at],
    ).map_err(|error| error.to_string())?;
    Ok(record)
}
#[tauri::command]
fn get_dry_run_history(app_handle: tauri::AppHandle) -> Result<Vec<DryRunHistoryRecord>, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    let mut statement = connection.prepare(
        "SELECT id, platform_id, platform_name, account_id, planned_fields, planned_selector, missing_checks, current_url, created_at FROM dry_run_history ORDER BY created_at DESC LIMIT 100"
    ).map_err(|error| error.to_string())?;
    let rows = statement.query_map([], |row| {
        let planned_fields: String = row.get(4)?;
        let missing_checks: String = row.get(6)?;
        Ok(DryRunHistoryRecord {
            id: row.get(0)?, platform_id: row.get(1)?, platform_name: row.get(2)?, account_id: row.get(3)?,
            planned_fields: serde_json::from_str(&planned_fields).unwrap_or_default(),
            planned_selector: row.get(5)?,
            missing_checks: serde_json::from_str(&missing_checks).unwrap_or_default(),
            current_url: row.get(7)?, created_at: row.get(8)?,
        })
    }).map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command]
fn save_dry_run_history(app_handle: tauri::AppHandle, record: DryRunHistoryRecord) -> Result<DryRunHistoryRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    save_dry_run_history_record(&connection, &record)?;
    Ok(record)
}

#[tauri::command]
fn get_entity_profile(app_handle: tauri::AppHandle) -> Result<EntityProfileRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;

    let mut statement = connection
        .prepare(
            "SELECT id, profile_type, brand_name, legal_name, short_description, full_description,
                    founder_name, author_name, email, phone, address, same_as_urls, target_keywords,
                    topical_niche, expertise_proof, trust_signals
             FROM entity_profiles
             WHERE id = 'primary'",
        )
        .map_err(|error| error.to_string())?;

    let result = statement.query_row([], |row| {
        Ok(EntityProfileRecord {
            id: row.get(0)?,
            profile_type: row.get(1)?,
            brand_name: row.get(2)?,
            legal_name: row.get(3)?,
            short_description: row.get(4)?,
            full_description: row.get(5)?,
            founder_name: row.get(6)?,
            author_name: row.get(7)?,
            email: row.get(8)?,
            phone: row.get(9)?,
            address: row.get(10)?,
            same_as_urls: row.get(11)?,
            target_keywords: row.get(12)?,
            topical_niche: row.get(13)?,
            expertise_proof: row.get(14)?,
            trust_signals: row.get(15)?,
        })
    });

    match result {
        Ok(record) => Ok(record),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            let fallback = default_entity_profile();
            save_entity_profile_record(&connection, &fallback)?;
            Ok(fallback)
        }
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_entity_profile(
    app_handle: tauri::AppHandle,
    profile: EntityProfileRecord,
) -> Result<EntityProfileRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    save_entity_profile_record(&connection, &profile)?;

    Ok(profile)
}

#[tauri::command]
fn get_accounts(app_handle: tauri::AppHandle) -> Result<Vec<AccountRecord>, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;

    let mut statement = connection
        .prepare(
            "SELECT id, platform_id, platform_name, recommended_username, status, priority,
                    automation_mode, evidence_url, notes, created_at, updated_at
             FROM accounts
             ORDER BY
                CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                platform_name ASC",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(AccountRecord {
                id: row.get(0)?,
                platform_id: row.get(1)?,
                platform_name: row.get(2)?,
                recommended_username: row.get(3)?,
                status: row.get(4)?,
                priority: row.get(5)?,
                automation_mode: row.get(6)?,
                evidence_url: row.get(7)?,
                notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_account(app_handle: tauri::AppHandle, account: AccountRecord) -> Result<AccountRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    save_account_record(&connection, &account)?;

    Ok(account)
}

#[tauri::command]
fn get_workflow_runs(app_handle: tauri::AppHandle) -> Result<Vec<WorkflowRunRecord>, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;

    let mut statement = connection
        .prepare(
            "SELECT id, account_id, platform_name, action, status, message, created_at
             FROM workflow_runs
             ORDER BY created_at DESC
             LIMIT 100",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(WorkflowRunRecord {
                id: row.get(0)?,
                account_id: row.get(1)?,
                platform_name: row.get(2)?,
                action: row.get(3)?,
                status: row.get(4)?,
                message: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_workflow_run(
    app_handle: tauri::AppHandle,
    run: WorkflowRunRecord,
) -> Result<WorkflowRunRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    save_workflow_run_record(&connection, &run)?;

    Ok(run)
}

#[tauri::command]
fn get_automation_queue(app_handle: tauri::AppHandle) -> Result<Vec<AutomationQueueItem>, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;

    let mut statement = connection
        .prepare(
            "SELECT id, account_id, platform_name, gate_type, status, payload, created_at, updated_at
             FROM automation_queue
             ORDER BY
                CASE status WHEN 'queued' THEN 1 WHEN 'waiting' THEN 2 WHEN 'failed' THEN 3 ELSE 4 END,
                updated_at DESC",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(AutomationQueueItem {
                id: row.get(0)?,
                account_id: row.get(1)?,
                platform_name: row.get(2)?,
                gate_type: row.get(3)?,
                status: row.get(4)?,
                payload: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_automation_queue_item(
    app_handle: tauri::AppHandle,
    item: AutomationQueueItem,
) -> Result<AutomationQueueItem, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    save_automation_queue_item_record(&connection, &item)?;

    Ok(item)
}

#[tauri::command]
async fn execute_captcha_queue_item(
    app_handle: tauri::AppHandle,
    item: AutomationQueueItem,
) -> Result<AutomationQueueItem, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;

    if item.gate_type != "captcha" {
        return Err("Only CAPTCHA queue items can be sent to the CAPTCHA provider.".to_string());
    }

    let setting = get_integration_setting(&connection, "captcha")?;

    if !setting.is_enabled {
        let updated = queue_item_with_payload(
            item,
            "waiting",
            "CAPTCHA provider is disabled. Enable captcha in Settings first.",
        );
        save_automation_queue_item_record(&connection, &updated)?;

        return Ok(updated);
    }

    let api_key = match read_secret("captcha") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => {
            let updated = queue_item_with_payload(
                item,
                "waiting",
                "No encrypted CAPTCHA API key found. Save the captcha key in Settings first.",
            );
            save_automation_queue_item_record(&connection, &updated)?;

            return Ok(updated);
        }
    };

    let payload = parse_captcha_payload(&item.payload)?;
    let website_url = payload["websiteUrl"].as_str().unwrap_or("").trim();
    let website_key = payload["websiteKey"].as_str().unwrap_or("").trim();

    if website_url.is_empty() || website_key.is_empty() {
        let updated = queue_item_with_payload(
            item,
            "waiting",
            "CAPTCHA payload needs JSON with websiteUrl and websiteKey before provider submission.",
        );
        save_automation_queue_item_record(&connection, &updated)?;

        return Ok(updated);
    }

    let provider_response = submit_captcha_task(&setting.provider, &api_key, &payload).await?;
    let updated_payload = json!({
        "provider": setting.provider,
        "providerTaskId": provider_response["taskId"].as_i64().map(|value| value.to_string()).unwrap_or_else(|| provider_response["taskId"].as_str().unwrap_or("").to_string()),
        "providerStatus": "submitted",
        "websiteUrl": website_url,
        "websiteKey": website_key,
        "message": "CAPTCHA task submitted to provider. Result polling will be added in the next pass."
    });
    let updated = AutomationQueueItem {
        status: "waiting".to_string(),
        payload: updated_payload.to_string(),
        updated_at: now_string(),
        ..item
    };
    save_automation_queue_item_record(&connection, &updated)?;

    Ok(updated)
}

#[tauri::command]
async fn poll_captcha_queue_item(
    app_handle: tauri::AppHandle,
    item: AutomationQueueItem,
) -> Result<AutomationQueueItem, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;

    if item.gate_type != "captcha" {
        return Err("Only CAPTCHA queue items can be polled for provider results.".to_string());
    }

    let setting = get_integration_setting(&connection, "captcha")?;

    if !setting.is_enabled {
        let updated = queue_item_with_payload(
            item,
            "waiting",
            "CAPTCHA provider is disabled. Enable captcha in Settings before polling.",
        );
        save_automation_queue_item_record(&connection, &updated)?;

        return Ok(updated);
    }

    let api_key = match read_secret("captcha") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => {
            let updated = queue_item_with_payload(
                item,
                "waiting",
                "No encrypted CAPTCHA API key found. Save the captcha key in Settings first.",
            );
            save_automation_queue_item_record(&connection, &updated)?;

            return Ok(updated);
        }
    };

    let payload = parse_captcha_payload(&item.payload)?;
    let task_id = payload["providerTaskId"]
        .as_str()
        .map(ToString::to_string)
        .or_else(|| payload["providerTaskId"].as_i64().map(|value| value.to_string()))
        .unwrap_or_default();

    if task_id.trim().is_empty() {
        let updated = queue_item_with_payload(
            item,
            "waiting",
            "CAPTCHA queue item has no providerTaskId yet. Send the CAPTCHA task first.",
        );
        save_automation_queue_item_record(&connection, &updated)?;

        return Ok(updated);
    }

    let provider_response = poll_captcha_task(&setting.provider, &api_key, &task_id).await?;
    let provider_status = provider_response["status"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();
    let solution_token = provider_response["solution"]["gRecaptchaResponse"]
        .as_str()
        .or_else(|| provider_response["solution"]["token"].as_str())
        .unwrap_or("")
        .to_string();

    let mut updated_payload = payload.clone();
    updated_payload["provider"] = json!(setting.provider);
    updated_payload["providerTaskId"] = json!(task_id);
    updated_payload["providerStatus"] = json!(provider_status);
    updated_payload["lastProviderResponse"] = provider_response;

    let status = if provider_status == "ready" && !solution_token.is_empty() {
        updated_payload["solutionToken"] = json!(solution_token);
        updated_payload["automationHook"] = json!({
            "target": "browser_or_extension",
            "action": "inject_recaptcha_token",
            "tokenField": "g-recaptcha-response"
        });
        "resolved"
    } else {
        updated_payload["message"] = json!("CAPTCHA result is not ready yet. Poll again later.");
        "waiting"
    };

    let updated = AutomationQueueItem {
        status: status.to_string(),
        payload: updated_payload.to_string(),
        updated_at: now_string(),
        ..item
    };
    save_automation_queue_item_record(&connection, &updated)?;

    Ok(updated)
}

#[tauri::command]
fn get_captcha_injection_payload(
    app_handle: tauri::AppHandle,
    request: CaptchaInjectionBridgeRequest,
) -> Result<CaptchaInjectionPayload, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;

    let item = get_automation_queue_item_record(&connection, &request.queue_id)?;

    if item.account_id != request.account_id {
        return Err("Queue item does not belong to the requested account.".to_string());
    }

    if item.gate_type != "captcha" {
        return Err("Only CAPTCHA queue items can produce injection payloads.".to_string());
    }

    if item.status != "resolved" {
        return Err("CAPTCHA token is not resolved yet. Poll provider result before injection.".to_string());
    }

    let payload = parse_captcha_payload(&item.payload)?;
    let solution_token = payload["solutionToken"].as_str().unwrap_or("").trim();

    if solution_token.is_empty() {
        return Err("Resolved CAPTCHA queue item has no solutionToken.".to_string());
    }

    let token_field = payload["automationHook"]["tokenField"]
        .as_str()
        .unwrap_or("g-recaptcha-response")
        .to_string();

    Ok(CaptchaInjectionPayload {
        queue_id: item.id,
        account_id: item.account_id,
        platform_name: item.platform_name,
        website_url: payload["websiteUrl"].as_str().unwrap_or("").to_string(),
        website_key: payload["websiteKey"].as_str().unwrap_or("").to_string(),
        solution_token: solution_token.to_string(),
        token_field,
        action: "inject_recaptcha_token".to_string(),
        next_step: "submit_or_verify_account".to_string(),
    })
}

fn get_next_captcha_injection_payload_record(
    app_handle: &tauri::AppHandle,
) -> Result<CaptchaInjectionPayload, String> {
    let connection = open_database(app_handle)?;
    ensure_schema(&connection)?;

    let mut statement = connection
        .prepare(
            "SELECT id, account_id, platform_name, gate_type, status, payload, created_at, updated_at
             FROM automation_queue
             WHERE gate_type = 'captcha'
               AND status = 'resolved'
             ORDER BY updated_at ASC",
        )
        .map_err(|error| error.to_string())?;

    let items = statement
        .query_map([], |row| {
            Ok(AutomationQueueItem {
                id: row.get(0)?,
                account_id: row.get(1)?,
                platform_name: row.get(2)?,
                gate_type: row.get(3)?,
                status: row.get(4)?,
                payload: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?;

    for item_result in items {
        let item = item_result.map_err(|error| error.to_string())?;
        let payload = parse_captcha_payload(&item.payload)?;
        let solution_token = payload["solutionToken"].as_str().unwrap_or("").trim();
        let injection_status = payload["injection"]["status"].as_str().unwrap_or("");

        if solution_token.is_empty() || injection_status == "injected" {
            continue;
        }

        let token_field = payload["automationHook"]["tokenField"]
            .as_str()
            .unwrap_or("g-recaptcha-response")
            .to_string();

        return Ok(CaptchaInjectionPayload {
            queue_id: item.id,
            account_id: item.account_id,
            platform_name: item.platform_name,
            website_url: payload["websiteUrl"].as_str().unwrap_or("").to_string(),
            website_key: payload["websiteKey"].as_str().unwrap_or("").to_string(),
            solution_token: solution_token.to_string(),
            token_field,
            action: "inject_recaptcha_token".to_string(),
            next_step: "submit_or_verify_account".to_string(),
        });
    }

    Err("No resolved CAPTCHA payload is ready for extension injection.".to_string())
}

#[tauri::command]
fn complete_captcha_injection(
    app_handle: tauri::AppHandle,
    request: CaptchaInjectionCompleteRequest,
) -> Result<CaptchaInjectionResult, String> {
    complete_captcha_injection_record(&app_handle, request)
}

fn complete_captcha_injection_record(
    app_handle: &tauri::AppHandle,
    request: CaptchaInjectionCompleteRequest,
) -> Result<CaptchaInjectionResult, String> {
    let connection = open_database(app_handle)?;
    ensure_schema(&connection)?;

    let mut item = get_automation_queue_item_record(&connection, &request.queue_id)?;

    if item.account_id != request.account_id {
        return Err("Queue item does not belong to the requested account.".to_string());
    }

    let mut account = get_account_record(&connection, &request.account_id)?;
    let mut payload = parse_captcha_payload(&item.payload)?;
    let timestamp = now_string();
    let status = if request.success { "resolved" } else { "failed" };
    let workflow_status = if request.success { "completed" } else { "failed" };
    let default_message = if request.success {
        "CAPTCHA token injected. Account workflow is ready for submit/verify."
    } else {
        "CAPTCHA token injection failed. Manual review is required."
    };
    let message = if request.message.trim().is_empty() {
        default_message.to_string()
    } else {
        request.message.trim().to_string()
    };

    payload["injection"] = json!({
        "injector": request.injector,
        "status": if request.success { "injected" } else { "failed" },
        "message": message,
        "evidenceUrl": request.evidence_url.clone(),
        "completedAt": timestamp.clone()
    });
    payload["nextStep"] = json!("submit_or_verify_account");

    item.status = status.to_string();
    item.payload = payload.to_string();
    item.updated_at = timestamp.clone();
    save_automation_queue_item_record(&connection, &item)?;

    if request.success && account.status == "planned" {
        account.status = "created".to_string();
    } else if !request.success {
        account.status = "needs_manual_review".to_string();
    }
    account.notes = format!("{} CAPTCHA bridge: {}", account.notes, message)
        .trim()
        .to_string();
    account.updated_at = timestamp.clone();
    save_account_record(&connection, &account)?;

    let submit_verify_queue_item = if request.success {
        let selectors = submit_verify_selectors(&account.platform_id, &account.platform_name);
        let field_selectors = submit_verify_field_selectors(&account.platform_id, &account.platform_name);
        let submit_item = AutomationQueueItem {
            id: format!("queue-{}-submit-verify", account.id),
            account_id: account.id.clone(),
            platform_name: account.platform_name.clone(),
            gate_type: "submit_verify".to_string(),
            status: "waiting".to_string(),
            payload: json!({
                "action": "submit_or_verify_account",
                "sourceQueueId": item.id,
                "captchaInjectedAt": timestamp.clone(),
                "injectionEvidenceUrl": request.evidence_url.clone(),
                "fieldSelectors": {
                    "username": field_selectors.username,
                    "email": field_selectors.email,
                    "displayName": field_selectors.display_name,
                    "bio": field_selectors.bio,
                    "websiteUrl": field_selectors.website_url
                },
                "requiredFields": ["username", "email", "displayName", "bio", "websiteUrl"],
                "requiresCaptchaToken": true,
                "submitSelectors": selectors.0,
                "verifySelectors": selectors.1,
                "evidenceCapture": "current_url",
                "message": "CAPTCHA injected. Submit/verify account is ready for browser automation or manual confirmation."
            })
            .to_string(),
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
        };
        save_automation_queue_item_record(&connection, &submit_item)?;
        Some(submit_item)
    } else {
        None
    };

    let workflow_run = WorkflowRunRecord {
        id: format!("run-{}-captcha-injection-{}", account.id, timestamp),
        account_id: account.id.clone(),
        platform_name: account.platform_name.clone(),
        action: "captcha_injection_bridge".to_string(),
        status: workflow_status.to_string(),
        message,
        created_at: timestamp,
    };
    save_workflow_run_record(&connection, &workflow_run)?;

    Ok(CaptchaInjectionResult {
        queue_item: item,
        account,
        workflow_run,
        submit_verify_queue_item,
    })
}

#[tauri::command]
fn complete_account_submit_verify(
    app_handle: tauri::AppHandle,
    request: AccountSubmitVerifyRequest,
) -> Result<AccountSubmitVerifyResult, String> {
    complete_account_submit_verify_record(&app_handle, request)
}

fn get_next_submit_verify_payload_record(
    app_handle: &tauri::AppHandle,
) -> Result<AccountSubmitVerifyPayload, String> {
    let connection = open_database(app_handle)?;
    ensure_schema(&connection)?;

    let mut statement = connection
        .prepare(
            "SELECT id, account_id, platform_name, gate_type, status, payload, created_at, updated_at
             FROM automation_queue
             WHERE gate_type = 'submit_verify'
               AND status = 'waiting'
             ORDER BY updated_at ASC",
        )
        .map_err(|error| error.to_string())?;

    let mut items = statement
        .query_map([], |row| {
            Ok(AutomationQueueItem {
                id: row.get(0)?,
                account_id: row.get(1)?,
                platform_name: row.get(2)?,
                gate_type: row.get(3)?,
                status: row.get(4)?,
                payload: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?;

    let item = match items.next() {
        Some(result) => result.map_err(|error| error.to_string())?,
        None => return Err("No submit/verify queue item is ready.".to_string()),
    };
    let account = get_account_record(&connection, &item.account_id)?;
    let profile = get_entity_profile_record(&connection).unwrap_or_else(|_| default_entity_profile());
    let money_site = get_money_site_record(&connection).unwrap_or_else(|_| default_money_site());
    let payload = serde_json::from_str::<serde_json::Value>(&item.payload).unwrap_or_else(|_| json!({}));
    let recipe = get_selector_recipe_record(&connection, &account.platform_id).ok();
    let fallback_selectors = submit_verify_selectors(&account.platform_id, &account.platform_name);
    let fallback_field_selectors = submit_verify_field_selectors(&account.platform_id, &account.platform_name);
    let recipe_field_selectors = recipe
        .as_ref()
        .and_then(|item| serde_json::from_str::<serde_json::Value>(&item.field_selectors_json).ok())
        .unwrap_or_else(|| json!({}));
    let submit_selectors = recipe
        .as_ref()
        .map(|item| lines_to_strings(&item.submit_selectors))
        .filter(|items| !items.is_empty())
        .unwrap_or_else(|| json_array_to_strings(&payload["submitSelectors"]));
    let verify_selectors = recipe
        .as_ref()
        .map(|item| lines_to_strings(&item.verify_selectors))
        .filter(|items| !items.is_empty())
        .unwrap_or_else(|| json_array_to_strings(&payload["verifySelectors"]));
    let required_fields = recipe
        .as_ref()
        .map(|item| lines_to_strings(&item.required_fields))
        .filter(|items| !items.is_empty())
        .unwrap_or_else(|| json_array_to_strings(&payload["requiredFields"]));

    Ok(AccountSubmitVerifyPayload {
        queue_id: item.id,
        account_id: item.account_id,
        platform_id: account.platform_id,
        platform_name: item.platform_name,
        action: "submit_or_verify_account".to_string(),
        form_values: SubmitVerifyFormValues {
            username: account.recommended_username,
            email: profile.email,
            display_name: if profile.brand_name.trim().is_empty() { profile.legal_name } else { profile.brand_name },
            bio: if profile.short_description.trim().is_empty() { account.notes.clone() } else { profile.short_description },
            website_url: money_site.homepage_url,
        },
        field_selectors: SubmitVerifyFieldSelectors {
            username: json_array_to_strings(&recipe_field_selectors["username"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["username"])).chain(fallback_field_selectors.username).collect(),
            email: json_array_to_strings(&recipe_field_selectors["email"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["email"])).chain(fallback_field_selectors.email).collect(),
            display_name: json_array_to_strings(&recipe_field_selectors["displayName"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["displayName"])).chain(fallback_field_selectors.display_name).collect(),
            bio: json_array_to_strings(&recipe_field_selectors["bio"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["bio"])).chain(fallback_field_selectors.bio).collect(),
            website_url: json_array_to_strings(&recipe_field_selectors["websiteUrl"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["websiteUrl"])).chain(fallback_field_selectors.website_url).collect(),
        },
        required_fields: if required_fields.is_empty() {
            vec![
                "username".to_string(),
                "email".to_string(),
                "displayName".to_string(),
                "bio".to_string(),
                "websiteUrl".to_string(),
            ]
        } else {
            required_fields
        },
        requires_captcha_token: recipe
            .as_ref()
            .map(|item| item.requires_captcha_token)
            .unwrap_or_else(|| payload["requiresCaptchaToken"].as_bool().unwrap_or(true)),
        submit_selectors: if submit_selectors.is_empty() { fallback_selectors.0 } else { submit_selectors },
        verify_selectors: if verify_selectors.is_empty() { fallback_selectors.1 } else { verify_selectors },
        evidence_capture: payload["evidenceCapture"].as_str().unwrap_or("current_url").to_string(),
        notes: payload["message"].as_str().unwrap_or("Submit or verify the account, then capture current URL as evidence.").to_string(),
    })
}

fn complete_account_submit_verify_record(
    app_handle: &tauri::AppHandle,
    request: AccountSubmitVerifyRequest,
) -> Result<AccountSubmitVerifyResult, String> {
    let connection = open_database(app_handle)?;
    ensure_schema(&connection)?;

    let mut item = get_automation_queue_item_record(&connection, &request.queue_id)?;

    if item.account_id != request.account_id {
        return Err("Queue item does not belong to the requested account.".to_string());
    }

    if item.gate_type != "submit_verify" {
        return Err("Only submit/verify queue items can be completed by this action.".to_string());
    }

    let mut account = get_account_record(&connection, &request.account_id)?;
    let timestamp = now_string();
    let status = if request.success { "resolved" } else { "failed" };
    let workflow_status = if request.success { "completed" } else { "failed" };
    let default_message = if request.success {
        "Account submit/verify step completed."
    } else {
        "Account submit/verify step failed and needs manual review."
    };
    let message = if request.message.trim().is_empty() {
        default_message.to_string()
    } else {
        request.message.trim().to_string()
    };

    let mut payload = serde_json::from_str::<serde_json::Value>(&item.payload).unwrap_or_else(|_| {
        json!({
            "previousPayload": item.payload
        })
    });
    payload["completion"] = json!({
        "status": if request.success { "verified" } else { "failed" },
        "message": message,
        "evidenceUrl": request.evidence_url.clone(),
        "completedAt": timestamp.clone()
    });

    item.status = status.to_string();
    item.payload = payload.to_string();
    item.updated_at = timestamp.clone();
    save_automation_queue_item_record(&connection, &item)?;

    account.status = if request.success {
        "verified".to_string()
    } else {
        "needs_manual_review".to_string()
    };
    if !request.evidence_url.trim().is_empty() {
        account.evidence_url = request.evidence_url.trim().to_string();
    }
    account.notes = format!("{} Submit/verify: {}", account.notes, message)
        .trim()
        .to_string();
    account.updated_at = timestamp.clone();
    save_account_record(&connection, &account)?;

    let workflow_run = WorkflowRunRecord {
        id: format!("run-{}-submit-verify-{}", account.id, timestamp),
        account_id: account.id.clone(),
        platform_name: account.platform_name.clone(),
        action: "submit_verify_account".to_string(),
        status: workflow_status.to_string(),
        message,
        created_at: timestamp,
    };
    save_workflow_run_record(&connection, &workflow_run)?;

    Ok(AccountSubmitVerifyResult {
        queue_item: item,
        account,
        workflow_run,
    })
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
                is_enabled INTEGER NOT NULL DEFAULT 0,
                key_status TEXT NOT NULL DEFAULT 'missing',
                last_test_at TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS platforms (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                platform_type TEXT NOT NULL,
                homepage_url TEXT NOT NULL,
                authority_score INTEGER NOT NULL,
                difficulty TEXT NOT NULL,
                automation_mode TEXT NOT NULL,
                entity_value TEXT NOT NULL,
                requires_captcha INTEGER NOT NULL DEFAULT 0,
                requires_email INTEGER NOT NULL DEFAULT 1,
                notes TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS entity_profiles (
                id TEXT PRIMARY KEY,
                profile_type TEXT NOT NULL,
                brand_name TEXT NOT NULL,
                legal_name TEXT NOT NULL,
                short_description TEXT NOT NULL,
                full_description TEXT NOT NULL,
                founder_name TEXT NOT NULL,
                author_name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL,
                address TEXT NOT NULL,
                same_as_urls TEXT NOT NULL,
                target_keywords TEXT NOT NULL,
                topical_niche TEXT NOT NULL,
                expertise_proof TEXT NOT NULL,
                trust_signals TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                platform_id TEXT NOT NULL,
                platform_name TEXT NOT NULL,
                recommended_username TEXT NOT NULL,
                status TEXT NOT NULL,
                priority TEXT NOT NULL,
                automation_mode TEXT NOT NULL,
                evidence_url TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workflow_runs (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                platform_name TEXT NOT NULL,
                action TEXT NOT NULL,
                status TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS automation_queue (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                platform_name TEXT NOT NULL,
                gate_type TEXT NOT NULL,
                status TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS selector_recipes (
                platform_id TEXT PRIMARY KEY,
                platform_name TEXT NOT NULL,
                field_selectors_json TEXT NOT NULL,
                submit_selectors TEXT NOT NULL,
                verify_selectors TEXT NOT NULL,
                required_fields TEXT NOT NULL,
                requires_captcha_token INTEGER NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS evidence_records (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                evidence_type TEXT NOT NULL,
                url TEXT NOT NULL,
                related_platform_id TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'needs_review',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dry_run_history (
                id TEXT PRIMARY KEY,
                platform_id TEXT NOT NULL,
                platform_name TEXT NOT NULL,
                account_id TEXT NOT NULL,
                planned_fields TEXT NOT NULL,
                planned_selector TEXT NOT NULL,
                missing_checks TEXT NOT NULL,
                current_url TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            ",
        )
        .map_err(|error| error.to_string())?;

    ensure_column(connection, "integration_settings", "key_status", "TEXT NOT NULL DEFAULT 'missing'")?;
    ensure_column(connection, "integration_settings", "last_test_at", "TEXT NOT NULL DEFAULT ''")?;

    Ok(())
}

fn ensure_column(connection: &Connection, table: &str, column: &str, definition: &str) -> Result<(), String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?;
    let columns = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    if !columns.iter().any(|existing| existing == column) {
        connection
            .execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"), [])
            .map_err(|error| error.to_string())?;
    }

    Ok(())
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
                "INSERT OR IGNORE INTO integration_settings (setting_type, provider, api_key, is_enabled, key_status, last_test_at)
                 VALUES (?1, ?2, '', 0, 'missing', '')",
                params![setting_type, provider],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn ensure_default_selector_recipes(connection: &Connection) -> Result<(), String> {
    ensure_default_platforms(connection)?;
    let platforms = get_platform_records(connection)?;

    for platform in platforms {
        let field_selectors = submit_verify_field_selectors(&platform.id, &platform.name);
        let submit_verify = submit_verify_selectors(&platform.id, &platform.name);
        let recipe = SelectorRecipeRecord {
            platform_id: platform.id,
            platform_name: platform.name,
            field_selectors_json: serde_json::to_string(&json!({
                "username": field_selectors.username,
                "email": field_selectors.email,
                "displayName": field_selectors.display_name,
                "bio": field_selectors.bio,
                "websiteUrl": field_selectors.website_url
            }))
            .unwrap_or_else(|_| "{}".to_string()),
            submit_selectors: submit_verify.0.join("\n"),
            verify_selectors: submit_verify.1.join("\n"),
            required_fields: "username\nemail\ndisplayName\nbio\nwebsiteUrl".to_string(),
            requires_captcha_token: platform.requires_captcha,
            updated_at: now_string(),
        };

        connection
            .execute(
                "INSERT OR IGNORE INTO selector_recipes (
                    platform_id, platform_name, field_selectors_json, submit_selectors,
                    verify_selectors, required_fields, requires_captcha_token, updated_at
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    recipe.platform_id,
                    recipe.platform_name,
                    recipe.field_selectors_json,
                    recipe.submit_selectors,
                    recipe.verify_selectors,
                    recipe.required_fields,
                    if recipe.requires_captcha_token { 1 } else { 0 },
                    recipe.updated_at
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn existing_integration_key(connection: &Connection, setting_type: &str) -> Result<String, String> {
    let result = connection.query_row(
        "SELECT api_key FROM integration_settings WHERE setting_type = ?1",
        params![setting_type],
        |row| row.get(0),
    );

    match result {
        Ok(value) => Ok(value),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(String::new()),
        Err(error) => Err(error.to_string()),
    }
}

fn get_integration_setting(connection: &Connection, setting_type: &str) -> Result<IntegrationSettingRecord, String> {
    let result = connection.query_row(
        "SELECT setting_type, provider, api_key, is_enabled, key_status, last_test_at
         FROM integration_settings
         WHERE setting_type = ?1",
        params![setting_type],
        |row| {
            Ok(IntegrationSettingRecord {
                setting_type: row.get(0)?,
                provider: row.get(1)?,
                api_key: row.get(2)?,
                is_enabled: row.get::<_, i64>(3)? == 1,
                key_status: row.get(4)?,
                last_test_at: row.get(5)?,
            })
        },
    );

    match result {
        Ok(record) => Ok(record),
        Err(rusqlite::Error::QueryReturnedNoRows) => Err("CAPTCHA integration setting was not found.".to_string()),
        Err(error) => Err(error.to_string()),
    }
}

fn update_integration_test_time(connection: &Connection, setting_type: &str, timestamp: &str) -> Result<(), String> {
    connection
        .execute(
            "UPDATE integration_settings SET last_test_at = ?1 WHERE setting_type = ?2",
            params![timestamp, setting_type],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn now_string() -> String {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => format!("{}", duration.as_secs()),
        Err(_) => String::new(),
    }
}

fn queue_item_with_payload(item: AutomationQueueItem, status: &str, message: &str) -> AutomationQueueItem {
    let payload = json!({
        "previousPayload": item.payload,
        "message": message
    });

    AutomationQueueItem {
        status: status.to_string(),
        payload: payload.to_string(),
        updated_at: now_string(),
        ..item
    }
}

fn parse_captcha_payload(payload: &str) -> Result<serde_json::Value, String> {
    let parsed = serde_json::from_str::<serde_json::Value>(payload).unwrap_or_else(|_| {
        json!({
            "captchaType": "recaptcha_v2",
            "websiteUrl": "",
            "websiteKey": "",
            "note": payload
        })
    });

    Ok(parsed)
}

fn json_array_to_strings(value: &serde_json::Value) -> Vec<String> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::trim))
                .filter(|item| !item.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn lines_to_strings(value: &str) -> Vec<String> {
    value
        .lines()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
        .collect()
}

fn get_money_site_record(connection: &Connection) -> Result<MoneySiteRecord, String> {
    connection
        .query_row(
            "SELECT domain, homepage_url, sitemap_url, language, target_country, industry
             FROM money_sites
             WHERE id = 1",
            [],
            |row| {
                Ok(MoneySiteRecord {
                    domain: row.get(0)?,
                    homepage_url: row.get(1)?,
                    sitemap_url: row.get(2)?,
                    language: row.get(3)?,
                    target_country: row.get(4)?,
                    industry: row.get(5)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

fn get_entity_profile_record(connection: &Connection) -> Result<EntityProfileRecord, String> {
    connection
        .query_row(
            "SELECT id, profile_type, brand_name, legal_name, short_description, full_description,
                    founder_name, author_name, email, phone, address, same_as_urls, target_keywords,
                    topical_niche, expertise_proof, trust_signals
             FROM entity_profiles
             WHERE id = 'primary'",
            [],
            |row| {
                Ok(EntityProfileRecord {
                    id: row.get(0)?,
                    profile_type: row.get(1)?,
                    brand_name: row.get(2)?,
                    legal_name: row.get(3)?,
                    short_description: row.get(4)?,
                    full_description: row.get(5)?,
                    founder_name: row.get(6)?,
                    author_name: row.get(7)?,
                    email: row.get(8)?,
                    phone: row.get(9)?,
                    address: row.get(10)?,
                    same_as_urls: row.get(11)?,
                    target_keywords: row.get(12)?,
                    topical_niche: row.get(13)?,
                    expertise_proof: row.get(14)?,
                    trust_signals: row.get(15)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

fn get_platform_records(connection: &Connection) -> Result<Vec<PlatformRecord>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, name, platform_type, homepage_url, authority_score, difficulty,
                    automation_mode, entity_value, requires_captcha, requires_email, notes
             FROM platforms
             ORDER BY authority_score DESC, name ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(PlatformRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                platform_type: row.get(2)?,
                homepage_url: row.get(3)?,
                authority_score: row.get(4)?,
                difficulty: row.get(5)?,
                automation_mode: row.get(6)?,
                entity_value: row.get(7)?,
                requires_captcha: row.get::<_, i64>(8)? == 1,
                requires_email: row.get::<_, i64>(9)? == 1,
                notes: row.get(10)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn save_dry_run_history_record(connection: &Connection, record: &DryRunHistoryRecord) -> Result<(), String> {
    connection.execute(
        "INSERT OR REPLACE INTO dry_run_history (id, platform_id, platform_name, account_id, planned_fields, planned_selector, missing_checks, current_url, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            record.id, record.platform_id, record.platform_name, record.account_id,
            serde_json::to_string(&record.planned_fields).unwrap_or_else(|_| "[]".to_string()),
            record.planned_selector,
            serde_json::to_string(&record.missing_checks).unwrap_or_else(|_| "[]".to_string()),
            record.current_url, record.created_at
        ],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

fn save_selector_recipe_record(connection: &Connection, recipe: &SelectorRecipeRecord) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO selector_recipes (
                platform_id, platform_name, field_selectors_json, submit_selectors,
                verify_selectors, required_fields, requires_captcha_token, updated_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(platform_id)
             DO UPDATE SET platform_name = excluded.platform_name,
                           field_selectors_json = excluded.field_selectors_json,
                           submit_selectors = excluded.submit_selectors,
                           verify_selectors = excluded.verify_selectors,
                           required_fields = excluded.required_fields,
                           requires_captcha_token = excluded.requires_captcha_token,
                           updated_at = excluded.updated_at",
            params![
                recipe.platform_id,
                recipe.platform_name,
                recipe.field_selectors_json,
                recipe.submit_selectors,
                recipe.verify_selectors,
                recipe.required_fields,
                if recipe.requires_captcha_token { 1 } else { 0 },
                recipe.updated_at
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn get_selector_recipe_record(connection: &Connection, platform_id: &str) -> Result<SelectorRecipeRecord, String> {
    connection
        .query_row(
            "SELECT platform_id, platform_name, field_selectors_json, submit_selectors,
                    verify_selectors, required_fields, requires_captcha_token, updated_at
             FROM selector_recipes
             WHERE platform_id = ?1",
            params![platform_id],
            |row| {
                Ok(SelectorRecipeRecord {
                    platform_id: row.get(0)?,
                    platform_name: row.get(1)?,
                    field_selectors_json: row.get(2)?,
                    submit_selectors: row.get(3)?,
                    verify_selectors: row.get(4)?,
                    required_fields: row.get(5)?,
                    requires_captcha_token: row.get::<_, i64>(6)? == 1,
                    updated_at: row.get(7)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

fn submit_verify_field_selectors(platform_id: &str, platform_name: &str) -> SubmitVerifyFieldSelectors {
    let mut selectors = SubmitVerifyFieldSelectors {
        username: vec![
            "input[name='username']".to_string(),
            "input[id*='username' i]".to_string(),
            "input[autocomplete='username']".to_string(),
            "input[name*='user' i]".to_string(),
        ],
        email: vec![
            "input[type='email']".to_string(),
            "input[name='email']".to_string(),
            "input[id*='email' i]".to_string(),
            "input[autocomplete='email']".to_string(),
        ],
        display_name: vec![
            "input[name='name']".to_string(),
            "input[name*='display' i]".to_string(),
            "input[id*='display' i]".to_string(),
            "input[autocomplete='name']".to_string(),
        ],
        bio: vec![
            "textarea[name='bio']".to_string(),
            "textarea[id*='bio' i]".to_string(),
            "textarea[name*='description' i]".to_string(),
            "textarea[id*='description' i]".to_string(),
        ],
        website_url: vec![
            "input[type='url']".to_string(),
            "input[name='website']".to_string(),
            "input[id*='website' i]".to_string(),
            "input[name*='url' i]".to_string(),
        ],
    };
    let key = platform_id.to_lowercase();
    let name = platform_name.to_lowercase();

    if key == "github" || name.contains("github") {
        selectors.username.insert(0, "input[name='user[login]']".to_string());
        selectors.email.insert(0, "input[name='user[email]']".to_string());
    }

    if key == "medium" || name.contains("medium") {
        selectors.email.insert(0, "input[name='email']".to_string());
        selectors.display_name.insert(0, "input[name='name']".to_string());
    }

    if key == "tumblr" || name.contains("tumblr") {
        selectors.email.insert(0, "input[name='email']".to_string());
        selectors.username.insert(0, "input[name='tumblelog[name]']".to_string());
    }

    if key == "pinterest" || name.contains("pinterest") {
        selectors.email.insert(0, "input[name='id']".to_string());
        selectors.display_name.insert(0, "input[name='full_name']".to_string());
    }

    selectors
}

fn submit_verify_selectors(platform_id: &str, platform_name: &str) -> (Vec<String>, Vec<String>) {
    let generic_submit = vec![
        "button[type='submit']".to_string(),
        "input[type='submit']".to_string(),
        "button[data-testid*='submit' i]".to_string(),
        "button[data-testid*='signup' i]".to_string(),
        "button[data-testid*='continue' i]".to_string(),
        "button[data-test*='submit' i]".to_string(),
        "button[data-test*='continue' i]".to_string(),
        "button[aria-label*='submit' i]".to_string(),
        "button[aria-label*='sign up' i]".to_string(),
        "button[aria-label*='continue' i]".to_string(),
    ];
    let generic_verify = vec![
        "a[href*='verify' i]".to_string(),
        "button[data-testid*='verify' i]".to_string(),
        "button[data-test*='verify' i]".to_string(),
        "button[aria-label*='verify' i]".to_string(),
        "button[aria-label*='confirm' i]".to_string(),
    ];
    let key = platform_id.to_lowercase();
    let name = platform_name.to_lowercase();

    if key == "github" || name.contains("github") {
        return (
            vec![
                "button[type='submit']".to_string(),
                "input[type='submit']".to_string(),
                "button.js-octocaptcha-form-submit".to_string(),
            ],
            generic_verify,
        );
    }

    if key == "medium" || name.contains("medium") {
        return (
            vec![
                "button[data-testid='headerSignUpButton']".to_string(),
                "button[data-testid*='submit' i]".to_string(),
                "button[type='submit']".to_string(),
            ],
            generic_verify,
        );
    }

    if key == "tumblr" || name.contains("tumblr") {
        return (
            vec![
                "button[aria-label*='sign up' i]".to_string(),
                "button[data-testid*='signup' i]".to_string(),
                "button[type='submit']".to_string(),
            ],
            generic_verify,
        );
    }

    if key == "pinterest" || name.contains("pinterest") {
        return (
            vec![
                "button[data-test-id*='register' i]".to_string(),
                "button[data-test-id*='signup' i]".to_string(),
                "button[type='submit']".to_string(),
            ],
            generic_verify,
        );
    }

    (generic_submit, generic_verify)
}

fn handle_extension_bridge_stream(mut stream: TcpStream, app_handle: tauri::AppHandle) {
    let mut buffer = vec![0; 32 * 1024];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(value) => value,
        Err(_) => return,
    };
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);

    if request.starts_with("OPTIONS ") {
        let _ = write_http_response(&mut stream, 204, "");
        return;
    }

    if request.starts_with("GET /captcha/injection/next ") {
        let response = match get_next_captcha_injection_payload_record(&app_handle) {
            Ok(payload) => serde_json::to_string(&payload).unwrap_or_else(|_| "{\"ok\":true}".to_string()),
            Err(error) => {
                let _ = write_http_response(&mut stream, 404, &json!({ "error": error }).to_string());
                return;
            }
        };

        let _ = write_http_response(&mut stream, 200, &response);
        return;
    }

    if request.starts_with("GET /account/submit-verify/next ") {
        let response = match get_next_submit_verify_payload_record(&app_handle) {
            Ok(payload) => serde_json::to_string(&payload).unwrap_or_else(|_| "{\"ok\":true}".to_string()),
            Err(error) => {
                let _ = write_http_response(&mut stream, 404, &json!({ "error": error }).to_string());
                return;
            }
        };

        let _ = write_http_response(&mut stream, 200, &response);
        return;
    }

    if request.starts_with("POST /account/submit-verify/complete ") {
        let Some(body) = request.split("\r\n\r\n").nth(1) else {
            let _ = write_http_response(&mut stream, 400, "{\"error\":\"missing body\"}");
            return;
        };

        let response = match serde_json::from_str::<AccountSubmitVerifyRequest>(body) {
            Ok(payload) => match complete_account_submit_verify_record(&app_handle, payload) {
                Ok(result) => serde_json::to_string(&result).unwrap_or_else(|_| "{\"ok\":true}".to_string()),
                Err(error) => {
                    let _ = write_http_response(&mut stream, 400, &json!({ "error": error }).to_string());
                    return;
                }
            },
            Err(error) => {
                let _ = write_http_response(&mut stream, 400, &json!({ "error": error.to_string() }).to_string());
                return;
            }
        };

        let _ = write_http_response(&mut stream, 200, &response);
        return;
    }

    if request.starts_with("POST /account/submit-verify/dry-run-history ") {
        let Some(body) = request.split("\r\n\r\n").nth(1) else {
            let _ = write_http_response(&mut stream, 400, "{\"error\":\"missing body\"}");
            return;
        };
        let response = match serde_json::from_str::<DryRunHistoryRecord>(body) {
            Ok(mut record) => {
                if record.id.trim().is_empty() { record.id = format!("dryrun-{}-{}", record.account_id, now_string()); }
                if record.created_at.trim().is_empty() { record.created_at = now_string(); }
                match open_database(&app_handle).and_then(|connection| {
                    ensure_schema(&connection)?;
                    save_dry_run_history_record(&connection, &record)?;
                    serde_json::to_string(&record).map_err(|error| error.to_string())
                }) {
                    Ok(value) => value,
                    Err(error) => { let _ = write_http_response(&mut stream, 400, &json!({ "error": error }).to_string()); return; }
                }
            },
            Err(error) => { let _ = write_http_response(&mut stream, 400, &json!({ "error": error.to_string() }).to_string()); return; }
        };
        let _ = write_http_response(&mut stream, 200, &response);
        return;
    }

    if !request.starts_with("POST /captcha/injection/complete ") {
        let _ = write_http_response(&mut stream, 404, "{\"error\":\"not found\"}");
        return;
    }

    let Some(body) = request.split("\r\n\r\n").nth(1) else {
        let _ = write_http_response(&mut stream, 400, "{\"error\":\"missing body\"}");
        return;
    };

    let response = match serde_json::from_str::<CaptchaInjectionCompleteRequest>(body) {
        Ok(payload) => match complete_captcha_injection_record(&app_handle, payload) {
            Ok(result) => serde_json::to_string(&result).unwrap_or_else(|_| "{\"ok\":true}".to_string()),
            Err(error) => {
                let _ = write_http_response(&mut stream, 400, &json!({ "error": error }).to_string());
                return;
            }
        },
        Err(error) => {
            let _ = write_http_response(&mut stream, 400, &json!({ "error": error.to_string() }).to_string());
            return;
        }
    };

    let _ = write_http_response(&mut stream, 200, &response);
}

fn write_http_response(stream: &mut TcpStream, status: u16, body: &str) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        404 => "Not Found",
        _ => "OK",
    };
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: content-type\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );

    stream.write_all(response.as_bytes())
}

fn secret_account(setting_type: &str) -> String {
    format!("integration:{setting_type}")
}

fn save_secret(setting_type: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SECRET_SERVICE, &secret_account(setting_type))
        .map_err(|error| format!("Failed to open OS credential store: {error}"))?;

    entry
        .set_password(value.trim())
        .map_err(|error| format!("Failed to save encrypted API key: {error}"))
}

fn read_secret(setting_type: &str) -> Result<String, String> {
    let entry = keyring::Entry::new(SECRET_SERVICE, &secret_account(setting_type))
        .map_err(|error| format!("Failed to open OS credential store: {error}"))?;

    entry
        .get_password()
        .map_err(|error| format!("Failed to read encrypted API key: {error}"))
}

fn has_secret(setting_type: &str) -> bool {
    read_secret(setting_type)
        .map(|secret| !secret.trim().is_empty())
        .unwrap_or(false)
}

fn key_status_from_mask(value: &str) -> String {
    if value.trim().is_empty() {
        "missing".to_string()
    } else if value.contains('…') {
        "masked".to_string()
    } else {
        "stored".to_string()
    }
}

fn mask_secret(value: &str) -> String {
    let trimmed = value.trim();

    if trimmed.is_empty() {
        return String::new();
    }

    let prefix: String = trimmed.chars().take(4).collect();
    let suffix: String = trimmed
        .chars()
        .rev()
        .take(4)
        .collect::<String>()
        .chars()
        .rev()
        .collect();

    format!("{prefix}…{suffix}")
}

fn integration_capabilities(setting_type: &str) -> Vec<String> {
    match setting_type {
        "ai" => vec!["generate_text".to_string()],
        "captcha" => vec!["solve_captcha".to_string()],
        "email" => vec!["send_email".to_string(), "receive_email".to_string()],
        "proxy" => vec!["proxy".to_string()],
        "indexing" => vec!["index_url".to_string()],
        _ => Vec::new(),
    }
}

async fn test_live_ai_provider(
    provider: &str,
    api_key: &str,
    capabilities: Vec<String>,
) -> Result<IntegrationAdapterResult, String> {
    let normalized_provider = provider.to_lowercase();

    if !normalized_provider.contains("gemini") && !normalized_provider.contains("google") {
        return Ok(IntegrationAdapterResult {
            setting_type: "ai".to_string(),
            provider: provider.to_string(),
            is_ready: false,
            mode: "live".to_string(),
            message: "First live AI adapter supports Google Gemini providers. Rename/select Gemini or keep this provider in dry-run mode.".to_string(),
            capabilities,
        });
    }

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        ))
        .json(&json!({
            "contents": [{
                "parts": [{
                    "text": "Reply with exactly: EntityManager AI adapter ready."
                }]
            }]
        }))
        .send()
        .await
        .map_err(|error| format!("Gemini adapter request failed: {error}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Gemini adapter response could not be read: {error}"))?;

    if !status.is_success() {
        return Ok(IntegrationAdapterResult {
            setting_type: "ai".to_string(),
            provider: provider.to_string(),
            is_ready: false,
            mode: "live".to_string(),
            message: format!("Gemini live test failed with HTTP {status}. Check API key, quota, billing, and provider access."),
            capabilities,
        });
    }

    let preview = extract_text_preview(&body);

    Ok(IntegrationAdapterResult {
        setting_type: "ai".to_string(),
        provider: provider.to_string(),
        is_ready: true,
        mode: "live".to_string(),
        message: format!("Gemini live adapter responded successfully: {preview}"),
        capabilities,
    })
}

async fn test_live_captcha_provider(
    provider: &str,
    api_key: &str,
    capabilities: Vec<String>,
) -> Result<IntegrationAdapterResult, String> {
    let normalized_provider = provider.to_lowercase();
    let client = reqwest::Client::new();

    if normalized_provider.contains("2captcha") || normalized_provider.contains("2 captcha") {
        let response = client
            .post("https://api.2captcha.com/getBalance")
            .json(&json!({ "clientKey": api_key }))
            .send()
            .await
            .map_err(|error| format!("2Captcha balance check failed: {error}"))?;
        let body = response
            .json::<serde_json::Value>()
            .await
            .map_err(|error| format!("2Captcha balance response could not be read: {error}"))?;

        if body["errorId"].as_i64().unwrap_or(1) != 0 {
            let description = body["errorDescription"].as_str().unwrap_or("unknown provider error");
            return Ok(IntegrationAdapterResult {
                setting_type: "captcha".to_string(),
                provider: provider.to_string(),
                is_ready: false,
                mode: "live".to_string(),
                message: format!("2Captcha live check failed: {description}"),
                capabilities,
            });
        }

        return Ok(IntegrationAdapterResult {
            setting_type: "captcha".to_string(),
            provider: provider.to_string(),
            is_ready: true,
            mode: "live".to_string(),
            message: "2Captcha live adapter is ready. Balance check succeeded.".to_string(),
            capabilities,
        });
    }

    if normalized_provider.contains("capsolver") || normalized_provider.contains("cap solver") {
        let response = client
            .post("https://api.capsolver.com/getBalance")
            .json(&json!({ "clientKey": api_key }))
            .send()
            .await
            .map_err(|error| format!("CapSolver balance check failed: {error}"))?;
        let body = response
            .json::<serde_json::Value>()
            .await
            .map_err(|error| format!("CapSolver balance response could not be read: {error}"))?;

        if body["errorId"].as_i64().unwrap_or(1) != 0 {
            let description = body["errorDescription"].as_str().unwrap_or("unknown provider error");
            return Ok(IntegrationAdapterResult {
                setting_type: "captcha".to_string(),
                provider: provider.to_string(),
                is_ready: false,
                mode: "live".to_string(),
                message: format!("CapSolver live check failed: {description}"),
                capabilities,
            });
        }

        return Ok(IntegrationAdapterResult {
            setting_type: "captcha".to_string(),
            provider: provider.to_string(),
            is_ready: true,
            mode: "live".to_string(),
            message: "CapSolver live adapter is ready. Balance check succeeded.".to_string(),
            capabilities,
        });
    }

    Ok(IntegrationAdapterResult {
        setting_type: "captcha".to_string(),
        provider: provider.to_string(),
        is_ready: false,
        mode: "live".to_string(),
        message: "Supported CAPTCHA providers are 2Captcha and CapSolver. Rename/select one of them to run live checks.".to_string(),
        capabilities,
    })
}

async fn submit_captcha_task(
    provider: &str,
    api_key: &str,
    payload: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let normalized_provider = provider.to_lowercase();
    let website_url = payload["websiteUrl"].as_str().unwrap_or("");
    let website_key = payload["websiteKey"].as_str().unwrap_or("");
    let client = reqwest::Client::new();

    if normalized_provider.contains("2captcha") || normalized_provider.contains("2 captcha") {
        let response = client
            .post("https://api.2captcha.com/createTask")
            .json(&json!({
                "clientKey": api_key,
                "task": {
                    "type": "RecaptchaV2TaskProxyless",
                    "websiteURL": website_url,
                    "websiteKey": website_key
                }
            }))
            .send()
            .await
            .map_err(|error| format!("2Captcha request failed: {error}"))?;
        let body = response
            .json::<serde_json::Value>()
            .await
            .map_err(|error| format!("2Captcha response could not be read: {error}"))?;

        if body["errorId"].as_i64().unwrap_or(1) != 0 {
            let description = body["errorDescription"].as_str().unwrap_or("unknown provider error");
            return Err(format!("2Captcha rejected the task: {description}"));
        }

        return Ok(body);
    }

    if normalized_provider.contains("capsolver") || normalized_provider.contains("cap solver") {
        let response = client
            .post("https://api.capsolver.com/createTask")
            .json(&json!({
                "clientKey": api_key,
                "task": {
                    "type": "ReCaptchaV2TaskProxyLess",
                    "websiteURL": website_url,
                    "websiteKey": website_key
                }
            }))
            .send()
            .await
            .map_err(|error| format!("CapSolver request failed: {error}"))?;
        let body = response
            .json::<serde_json::Value>()
            .await
            .map_err(|error| format!("CapSolver response could not be read: {error}"))?;

        if body["errorId"].as_i64().unwrap_or(1) != 0 {
            let description = body["errorDescription"].as_str().unwrap_or("unknown provider error");
            return Err(format!("CapSolver rejected the task: {description}"));
        }

        return Ok(body);
    }

    Err("Supported CAPTCHA providers for this phase are 2Captcha and CapSolver.".to_string())
}

async fn poll_captcha_task(
    provider: &str,
    api_key: &str,
    task_id: &str,
) -> Result<serde_json::Value, String> {
    let normalized_provider = provider.to_lowercase();
    let client = reqwest::Client::new();

    if normalized_provider.contains("2captcha") || normalized_provider.contains("2 captcha") {
        let response = client
            .post("https://api.2captcha.com/getTaskResult")
            .json(&json!({
                "clientKey": api_key,
                "taskId": task_id
            }))
            .send()
            .await
            .map_err(|error| format!("2Captcha result request failed: {error}"))?;
        let body = response
            .json::<serde_json::Value>()
            .await
            .map_err(|error| format!("2Captcha result response could not be read: {error}"))?;

        if body["errorId"].as_i64().unwrap_or(1) != 0 {
            let description = body["errorDescription"].as_str().unwrap_or("unknown provider error");
            return Err(format!("2Captcha result polling failed: {description}"));
        }

        return Ok(body);
    }

    if normalized_provider.contains("capsolver") || normalized_provider.contains("cap solver") {
        let response = client
            .post("https://api.capsolver.com/getTaskResult")
            .json(&json!({
                "clientKey": api_key,
                "taskId": task_id
            }))
            .send()
            .await
            .map_err(|error| format!("CapSolver result request failed: {error}"))?;
        let body = response
            .json::<serde_json::Value>()
            .await
            .map_err(|error| format!("CapSolver result response could not be read: {error}"))?;

        if body["errorId"].as_i64().unwrap_or(1) != 0 {
            let description = body["errorDescription"].as_str().unwrap_or("unknown provider error");
            return Err(format!("CapSolver result polling failed: {description}"));
        }

        return Ok(body);
    }

    Err("Supported CAPTCHA result polling providers are 2Captcha and CapSolver.".to_string())
}

fn extract_text_preview(body: &str) -> String {
    let parsed = serde_json::from_str::<serde_json::Value>(body).unwrap_or_else(|_| json!({}));
    let text = parsed["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("response received");

    text.chars().take(120).collect()
}

fn ensure_default_platforms(connection: &Connection) -> Result<(), String> {
    for platform in default_platforms() {
        connection
            .execute(
                "INSERT OR IGNORE INTO platforms (
                    id, name, platform_type, homepage_url, authority_score, difficulty,
                    automation_mode, entity_value, requires_captcha, requires_email, notes
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    platform.id,
                    platform.name,
                    platform.platform_type,
                    platform.homepage_url,
                    platform.authority_score,
                    platform.difficulty,
                    platform.automation_mode,
                    platform.entity_value,
                    if platform.requires_captcha { 1 } else { 0 },
                    if platform.requires_email { 1 } else { 0 },
                    platform.notes
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn save_platform_record(connection: &Connection, platform: &PlatformRecord) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO platforms (
                id, name, platform_type, homepage_url, authority_score, difficulty,
                automation_mode, entity_value, requires_captcha, requires_email, notes
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id)
             DO UPDATE SET name = excluded.name,
                           platform_type = excluded.platform_type,
                           homepage_url = excluded.homepage_url,
                           authority_score = excluded.authority_score,
                           difficulty = excluded.difficulty,
                           automation_mode = excluded.automation_mode,
                           entity_value = excluded.entity_value,
                           requires_captcha = excluded.requires_captcha,
                           requires_email = excluded.requires_email,
                           notes = excluded.notes",
            params![
                platform.id,
                platform.name,
                platform.platform_type,
                platform.homepage_url,
                platform.authority_score,
                platform.difficulty,
                platform.automation_mode,
                platform.entity_value,
                if platform.requires_captcha { 1 } else { 0 },
                if platform.requires_email { 1 } else { 0 },
                platform.notes
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn save_entity_profile_record(connection: &Connection, profile: &EntityProfileRecord) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO entity_profiles (
                id, profile_type, brand_name, legal_name, short_description, full_description,
                founder_name, author_name, email, phone, address, same_as_urls, target_keywords,
                topical_niche, expertise_proof, trust_signals
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
             ON CONFLICT(id)
             DO UPDATE SET profile_type = excluded.profile_type,
                           brand_name = excluded.brand_name,
                           legal_name = excluded.legal_name,
                           short_description = excluded.short_description,
                           full_description = excluded.full_description,
                           founder_name = excluded.founder_name,
                           author_name = excluded.author_name,
                           email = excluded.email,
                           phone = excluded.phone,
                           address = excluded.address,
                           same_as_urls = excluded.same_as_urls,
                           target_keywords = excluded.target_keywords,
                           topical_niche = excluded.topical_niche,
                           expertise_proof = excluded.expertise_proof,
                           trust_signals = excluded.trust_signals",
            params![
                profile.id,
                profile.profile_type,
                profile.brand_name,
                profile.legal_name,
                profile.short_description,
                profile.full_description,
                profile.founder_name,
                profile.author_name,
                profile.email,
                profile.phone,
                profile.address,
                profile.same_as_urls,
                profile.target_keywords,
                profile.topical_niche,
                profile.expertise_proof,
                profile.trust_signals
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn get_account_record(connection: &Connection, account_id: &str) -> Result<AccountRecord, String> {
    connection
        .query_row(
            "SELECT id, platform_id, platform_name, recommended_username, status, priority,
                    automation_mode, evidence_url, notes, created_at, updated_at
             FROM accounts
             WHERE id = ?1",
            params![account_id],
            |row| {
                Ok(AccountRecord {
                    id: row.get(0)?,
                    platform_id: row.get(1)?,
                    platform_name: row.get(2)?,
                    recommended_username: row.get(3)?,
                    status: row.get(4)?,
                    priority: row.get(5)?,
                    automation_mode: row.get(6)?,
                    evidence_url: row.get(7)?,
                    notes: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

fn save_account_record(connection: &Connection, account: &AccountRecord) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO accounts (
                id, platform_id, platform_name, recommended_username, status, priority,
                automation_mode, evidence_url, notes, created_at, updated_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id)
             DO UPDATE SET platform_id = excluded.platform_id,
                           platform_name = excluded.platform_name,
                           recommended_username = excluded.recommended_username,
                           status = excluded.status,
                           priority = excluded.priority,
                           automation_mode = excluded.automation_mode,
                           evidence_url = excluded.evidence_url,
                           notes = excluded.notes,
                           updated_at = excluded.updated_at",
            params![
                account.id,
                account.platform_id,
                account.platform_name,
                account.recommended_username,
                account.status,
                account.priority,
                account.automation_mode,
                account.evidence_url,
                account.notes,
                account.created_at,
                account.updated_at
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn save_workflow_run_record(connection: &Connection, run: &WorkflowRunRecord) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO workflow_runs (id, account_id, platform_name, action, status, message, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id)
             DO UPDATE SET account_id = excluded.account_id,
                           platform_name = excluded.platform_name,
                           action = excluded.action,
                           status = excluded.status,
                           message = excluded.message,
                           created_at = excluded.created_at",
            params![
                run.id,
                run.account_id,
                run.platform_name,
                run.action,
                run.status,
                run.message,
                run.created_at
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn get_automation_queue_item_record(connection: &Connection, queue_id: &str) -> Result<AutomationQueueItem, String> {
    connection
        .query_row(
            "SELECT id, account_id, platform_name, gate_type, status, payload, created_at, updated_at
             FROM automation_queue
             WHERE id = ?1",
            params![queue_id],
            |row| {
                Ok(AutomationQueueItem {
                    id: row.get(0)?,
                    account_id: row.get(1)?,
                    platform_name: row.get(2)?,
                    gate_type: row.get(3)?,
                    status: row.get(4)?,
                    payload: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

fn save_automation_queue_item_record(connection: &Connection, item: &AutomationQueueItem) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO automation_queue (
                id, account_id, platform_name, gate_type, status, payload, created_at, updated_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id)
             DO UPDATE SET account_id = excluded.account_id,
                           platform_name = excluded.platform_name,
                           gate_type = excluded.gate_type,
                           status = excluded.status,
                           payload = excluded.payload,
                           updated_at = excluded.updated_at",
            params![
                item.id,
                item.account_id,
                item.platform_name,
                item.gate_type,
                item.status,
                item.payload,
                item.created_at,
                item.updated_at
            ],
        )
        .map_err(|error| error.to_string())?;

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

fn default_entity_profile() -> EntityProfileRecord {
    EntityProfileRecord {
        id: "primary".to_string(),
        profile_type: "organization".to_string(),
        brand_name: "Example Money Site".to_string(),
        legal_name: "Example Money Site Co., Ltd.".to_string(),
        short_description: "SEO services brand focused on entity growth and authority building.".to_string(),
        full_description: "Example Money Site helps businesses improve organic visibility through entity optimization, EEAT content planning, and durable authority signals across trusted platforms.".to_string(),
        founder_name: "Nguyen Van A".to_string(),
        author_name: "SEO Editorial Team".to_string(),
        email: "contact@example-money-site.com".to_string(),
        phone: "+84 900 000 000".to_string(),
        address: "Ho Chi Minh City, Vietnam".to_string(),
        same_as_urls: "https://example-money-site.com/about\nhttps://example-money-site.com/contact".to_string(),
        target_keywords: "entity SEO, EEAT SEO, SEO services Vietnam".to_string(),
        topical_niche: "SEO services and entity authority building".to_string(),
        expertise_proof: "Case studies, client results, process documentation, author bio, and service pages.".to_string(),
        trust_signals: "Consistent NAP, branded profiles, author pages, social proof, privacy/contact pages, and clear ownership.".to_string(),
    }
}

fn default_platforms() -> Vec<PlatformRecord> {
    vec![
        platform("medium", "Medium", "blog", "https://medium.com", 86, "easy", "semi_auto", "content", false, true, "Strong content hub for brand stories, author posts, and supporting articles."),
        platform("tumblr", "Tumblr", "blog", "https://www.tumblr.com", 74, "medium", "semi_auto", "media", true, true, "Useful for media-rich supporting properties and light cross-linking."),
        platform("aboutme", "About.me", "profile", "https://about.me", 69, "easy", "semi_auto", "brand", false, true, "Simple profile entity for brand, founder, or expert identity."),
        platform("github", "GitHub", "profile", "https://github.com", 90, "medium", "manual_review", "author", true, true, "High-trust author/company profile; use for technical, SaaS, SEO tooling, and docs assets."),
        platform("pinterest", "Pinterest", "media", "https://www.pinterest.com", 82, "medium", "semi_auto", "media", true, true, "Good for image-led entity reinforcement and visual topical clusters."),
        platform("youtube", "YouTube", "video", "https://www.youtube.com", 95, "hard", "manual_review", "authority", true, true, "Authority video entity; best for brand proof, tutorials, and EEAT signals."),
        platform("slideshare", "SlideShare", "document", "https://www.slideshare.net", 76, "medium", "semi_auto", "content", false, true, "Document-sharing property for service decks, process explainers, and branded PDFs."),
        platform("soundcloud", "SoundCloud", "audio", "https://soundcloud.com", 72, "medium", "manual_review", "media", true, true, "Audio entity option for podcasts, interviews, and brand voice proof."),
        platform("crunchbase", "Crunchbase", "citation", "https://www.crunchbase.com", 88, "hard", "manual_review", "authority", true, true, "High-authority business citation; best for companies with verifiable brand assets."),
        platform("behance", "Behance", "portfolio", "https://www.behance.net", 78, "medium", "semi_auto", "brand", false, true, "Portfolio entity for visual case studies, branding, and creative proof."),
        platform("quora", "Quora", "qa", "https://www.quora.com", 84, "hard", "manual_review", "author", true, true, "Author expertise and topical answer footprint; use carefully for quality."),
        platform("google-business-profile", "Google Business Profile", "local", "https://www.google.com/business", 96, "hard", "manual_review", "local", true, true, "Core local/NAP entity for real businesses and local SEO trust."),
    ]
}

#[allow(clippy::too_many_arguments)]
fn platform(
    id: &str,
    name: &str,
    platform_type: &str,
    homepage_url: &str,
    authority_score: i64,
    difficulty: &str,
    automation_mode: &str,
    entity_value: &str,
    requires_captcha: bool,
    requires_email: bool,
    notes: &str,
) -> PlatformRecord {
    PlatformRecord {
        id: id.to_string(),
        name: name.to_string(),
        platform_type: platform_type.to_string(),
        homepage_url: homepage_url.to_string(),
        authority_score,
        difficulty: difficulty.to_string(),
        automation_mode: automation_mode.to_string(),
        entity_value: entity_value.to_string(),
        requires_captcha,
        requires_email,
        notes: notes.to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_health,
            open_extension_download,
            open_latest_release_download,
            start_extension_bridge_server,
            local_config_path,
            get_money_site,
            save_money_site,
            get_integration_settings,
            save_integration_setting,
            test_integration_setting,
            test_live_integration_setting,
            get_platforms,
            save_platform,
            get_selector_recipes,
            save_selector_recipe,
            get_dry_run_history,
            save_dry_run_history,
            get_evidence_records,
            save_evidence_record,
            get_entity_profile,
            save_entity_profile,
            get_accounts,
            save_account,
            get_workflow_runs,
            save_workflow_run,
            get_automation_queue,
            save_automation_queue_item,
            execute_captcha_queue_item,
            poll_captcha_queue_item,
            get_captcha_injection_payload,
            complete_captcha_injection,
            complete_account_submit_verify
        ])
        .run(tauri::generate_context!())
        .expect("error while running EntityManager");
}
