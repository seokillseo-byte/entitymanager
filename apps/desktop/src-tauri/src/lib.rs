use base64::{engine::general_purpose, Engine as _};
use rand::{distributions::Alphanumeric, Rng};
use regex::Regex;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

const SECRET_SERVICE: &str = "EntityManager";
const BUILTIN_SELECTOR_RECIPE_VERSION: i64 = 1_797_000_000;
static EXTENSION_BRIDGE_STARTED: AtomicBool = AtomicBool::new(false);
static GMAIL_VERIFICATION_WORKER_STARTED: AtomicBool = AtomicBool::new(false);

const GMAIL_CLIENT_SECRET_KEY: &str = "gmail_oauth_client_secret";
const GMAIL_REFRESH_TOKEN_KEY: &str = "gmail_oauth_refresh_token";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GmailOAuthStatus {
    client_id: String,
    configured: bool,
    connected: bool,
    account_email: String,
    status: String,
    last_message: String,
    last_checked_at: String,
    authorization_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemDiagnosticCheck {
    id: String,
    label: String,
    status: String,
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GmailOAuthConfigInput {
    client_id: String,
    client_secret: String,
}

fn image_asset_value_to_bridge_value(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.starts_with("data:") {
        return trimmed.to_string();
    }

    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        let response = match reqwest::blocking::Client::new()
            .get(trimmed)
            .header(reqwest::header::USER_AGENT, "EntityManager/0.1 image bridge")
            .send()
        {
            Ok(response) => response,
            Err(_) => return trimmed.to_string(),
        };
        if !response.status().is_success() {
            return trimmed.to_string();
        }

        let mime = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .filter(|value| value.starts_with("image/"))
            .unwrap_or("image/jpeg")
            .to_string();
        let bytes = match response.bytes() {
            Ok(bytes) => bytes,
            Err(_) => return trimmed.to_string(),
        };

        return format!("data:{mime};base64,{}", general_purpose::STANDARD.encode(bytes));
    }

    let path = PathBuf::from(trimmed.trim_matches('"'));
    if !path.exists() || !path.is_file() {
        return trimmed.to_string();
    }

    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(_) => return trimmed.to_string(),
    };
    let extension = path
        .extension()
        .and_then(|item| item.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = match extension.as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        _ => "image/jpeg",
    };

    format!("data:{mime};base64,{}", general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn app_health() -> &'static str {
    "EntityManager desktop shell is ready"
}

#[tauri::command]
fn get_indexing_queue_count(app_handle: tauri::AppHandle) -> Result<i64, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    connection
        .query_row("SELECT COUNT(*) FROM indexing_queue WHERE status IN ('queued', 'retry')", [], |row| row.get(0))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<String, String> {
    let target = url.trim();
    if !(target.starts_with("https://") || target.starts_with("http://")) {
        return Err("Chỉ cho phép mở URL http:// hoặc https://".to_string());
    }

    #[cfg(target_os = "windows")]
    // Ask the Windows URL protocol handler to open the complete URL in the
    // user's default browser. `explorer.exe <url>` can incorrectly open the
    // Documents folder on some Windows installations.
    let result = Command::new("rundll32.exe")
        .arg("url.dll,FileProtocolHandler")
        .arg(target)
        .spawn();

    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(target).spawn();

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(target).spawn();

    result
        .map(|_| format!("Đã mở {target}"))
        .map_err(|error| format!("Không thể mở trình duyệt: {error}"))
}

#[tauri::command]
fn open_release_asset_download(release_tag: String, asset_name: String) -> Result<(), String> {
    let valid_tag = release_tag.starts_with("desktop-v0.1.0-build-")
        && release_tag
            .trim_start_matches("desktop-v0.1.0-build-")
            .chars()
            .all(|character| character.is_ascii_digit());
    if !valid_tag {
        return Err("Tag release không được phép.".to_string());
    }

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
        "https://github.com/seokillseo-byte/entitymanager/releases/download/{release_tag}/{asset_name}"
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
fn open_latest_release_download(asset_name: String) -> Result<(), String> {
    open_release_asset_download("desktop-v0.1.0-build-222".to_string(), asset_name)
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
    avatar_image_url: String,
    banner_image_url: String,
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
struct ProvisioningCampaignRecord {
    id: String,
    name: String,
    status: String,
    total_jobs: i64,
    current_position: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProvisioningJobRecord {
    id: String,
    campaign_id: String,
    account_id: String,
    platform_id: String,
    platform_name: String,
    position: i64,
    stage: String,
    status: String,
    signup_url: String,
    profile_url: String,
    evidence_url: String,
    last_message: String,
    attempt_count: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProvisioningCheckpointRequest {
    platform_id: String,
    stage: String,
    status: String,
    message: String,
    evidence_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProvisioningCheckpointResult {
    job: ProvisioningJobRecord,
    next_job: Option<ProvisioningJobRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProxyRecord {
    id: String,
    name: String,
    protocol: String,
    host: String,
    port: i64,
    username: String,
    password: String,
    has_password: bool,
    country_code: String,
    status: String,
    latency_ms: i64,
    exit_ip: String,
    last_error: String,
    last_checked_at: String,
    is_enabled: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserLaunchRequest {
    session_id: String,
    campaign_id: String,
    job_id: String,
    account_id: String,
    platform_id: String,
    url: String,
    proxy_id: String,
    visible: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserSessionRecord {
    id: String,
    campaign_id: String,
    job_id: String,
    account_id: String,
    platform_id: String,
    profile_directory: String,
    proxy_id: String,
    process_id: i64,
    status: String,
    visibility: String,
    current_url: String,
    last_message: String,
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
    execution_steps: Vec<String>,
    save_text_selector: String,
    media_confirm_selector: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubmitVerifyFormValues {
    username: String,
    email: String,
    display_name: String,
    bio: String,
    website_url: String,
    company: String,
    location: String,
    social_links: String,
    profile_image: String,
    avatar_image_url: String,
    banner_image_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubmitVerifyFieldSelectors {
    username: Vec<String>,
    email: Vec<String>,
    display_name: Vec<String>,
    bio: Vec<String>,
    website_url: Vec<String>,
    company: Vec<String>,
    location: Vec<String>,
    social_links: Vec<String>,
    profile_image: Vec<String>,
    avatar_image_url: Vec<String>,
    banner_image_url: Vec<String>,
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformValidationRecord {
    platform_id: String,
    platform_name: String,
    status: String,
    dry_run_checked_at: String,
    text_saved_at: String,
    media_uploaded_at: String,
    evidence_saved_at: String,
    certified_at: String,
    last_tested_url: String,
    notes: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformValidationSyncReport {
    platform_id: String,
    platform_name: String,
    status: String,
    step: String,
    current_url: String,
    message: String,
    missing_checks: Vec<String>,
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
fn save_json_export(filename: String, contents: String) -> Result<String, String> {
    if filename.is_empty()
        || !filename.ends_with(".json")
        || !filename.chars().all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_' || character == '.')
        || filename.contains("..")
    {
        return Err("Invalid export filename".to_string());
    }

    let profile = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Could not locate the user profile directory".to_string())?;
    let downloads = std::path::PathBuf::from(profile).join("Downloads");
    std::fs::create_dir_all(&downloads).map_err(|error| format!("Could not access Downloads folder: {error}"))?;
    let destination = downloads.join(filename);
    std::fs::write(&destination, contents.as_bytes()).map_err(|error| format!("Could not write export file: {error}"))?;
    Ok(destination.to_string_lossy().into_owned())
}

#[tauri::command]
fn get_all_dry_run_history(app_handle: tauri::AppHandle) -> Result<Vec<DryRunHistoryRecord>, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    let mut statement = connection.prepare(
        "SELECT id, platform_id, platform_name, account_id, planned_fields, planned_selector, missing_checks, current_url, created_at FROM dry_run_history ORDER BY created_at DESC, id ASC"
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
fn get_dry_run_history_audit(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    let total_records: i64 = connection
        .query_row("SELECT COUNT(*) FROM dry_run_history", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    let unique_ids: i64 = connection
        .query_row("SELECT COUNT(DISTINCT id) FROM dry_run_history", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    let oldest_created_at: Option<String> = connection
        .query_row("SELECT MIN(created_at) FROM dry_run_history", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    let newest_created_at: Option<String> = connection
        .query_row("SELECT MAX(created_at) FROM dry_run_history", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;

    Ok(json!({
        "totalRecords": total_records,
        "uniqueIds": unique_ids,
        "oldestCreatedAt": oldest_created_at,
        "newestCreatedAt": newest_created_at
    }))
}

#[tauri::command]
fn save_dry_run_history(app_handle: tauri::AppHandle, record: DryRunHistoryRecord) -> Result<DryRunHistoryRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    save_dry_run_history_record(&connection, &record)?;
    Ok(record)
}

#[tauri::command]
fn get_platform_validation_records(app_handle: tauri::AppHandle) -> Result<Vec<PlatformValidationRecord>, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    ensure_default_platforms(&connection)?;
    ensure_default_platform_validation(&connection)?;

    let mut statement = connection
        .prepare(
            "SELECT platform_id, platform_name, status, dry_run_checked_at, text_saved_at,
                    media_uploaded_at, evidence_saved_at, certified_at, last_tested_url, notes, updated_at
             FROM platform_validation
             ORDER BY CASE platform_id
                WHEN 'github' THEN 1
                WHEN 'medium' THEN 2
                WHEN 'aboutme' THEN 3
                WHEN 'tumblr' THEN 4
                ELSE 5
             END, platform_name ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(PlatformValidationRecord {
                platform_id: row.get(0)?,
                platform_name: row.get(1)?,
                status: row.get(2)?,
                dry_run_checked_at: row.get(3)?,
                text_saved_at: row.get(4)?,
                media_uploaded_at: row.get(5)?,
                evidence_saved_at: row.get(6)?,
                certified_at: row.get(7)?,
                last_tested_url: row.get(8)?,
                notes: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_platform_validation_record(
    app_handle: tauri::AppHandle,
    record: PlatformValidationRecord,
) -> Result<PlatformValidationRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    save_platform_validation_record_to_db(&connection, &record)?;
    Ok(record)
}

fn sync_platform_validation_record(
    app_handle: &tauri::AppHandle,
    report: PlatformValidationSyncReport,
) -> Result<PlatformValidationRecord, String> {
    let connection = open_database(app_handle)?;
    ensure_schema(&connection)?;
    ensure_default_platforms(&connection)?;
    ensure_default_platform_validation(&connection)?;
    let now = if report.created_at.trim().is_empty() { now_string() } else { report.created_at.clone() };
    let last_tested_url = report.current_url.trim().to_string();
    let note = platform_validation_note(&report);
    let existing = get_platform_validation_record(&connection, &report.platform_id).unwrap_or_else(|_| PlatformValidationRecord {
        platform_id: report.platform_id.clone(),
        platform_name: report.platform_name.clone(),
        status: "not_tested".to_string(),
        dry_run_checked_at: "".to_string(),
        text_saved_at: "".to_string(),
        media_uploaded_at: "".to_string(),
        evidence_saved_at: "".to_string(),
        certified_at: "".to_string(),
        last_tested_url: "".to_string(),
        notes: "".to_string(),
        updated_at: "".to_string(),
    });

    let mut next = PlatformValidationRecord {
        platform_id: report.platform_id,
        platform_name: if report.platform_name.trim().is_empty() { existing.platform_name } else { report.platform_name },
        status: normalize_platform_validation_status(&report.status),
        dry_run_checked_at: existing.dry_run_checked_at,
        text_saved_at: existing.text_saved_at,
        media_uploaded_at: existing.media_uploaded_at,
        evidence_saved_at: existing.evidence_saved_at,
        certified_at: existing.certified_at,
        last_tested_url: if last_tested_url.is_empty() { existing.last_tested_url } else { last_tested_url },
        notes: note,
        updated_at: now.clone(),
    };

    match report.step.as_str() {
        "dry_run" => {
            if next.status == "dry_run_ok" {
                next.dry_run_checked_at = now.clone();
            }
        },
        "fill_text" => {
            if next.status == "text_saved" {
                next.text_saved_at = now.clone();
            }
        },
        "upload_media" => {
            if next.status == "media_uploaded" {
                next.media_uploaded_at = now.clone();
            }
        },
        "submit_verify" => {},
        _ => {}
    }

    if next.status == "needs_recipe_fix" {
        if report.step == "dry_run" {
            next.dry_run_checked_at = "".to_string();
        }
        next.certified_at = "".to_string();
        next.evidence_saved_at = "".to_string();
    }

    save_platform_validation_record_to_db(&connection, &next)?;
    Ok(next)
}

#[tauri::command]
fn certify_platform(
    app_handle: tauri::AppHandle,
    platform_id: String,
) -> Result<PlatformValidationRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    ensure_default_platforms(&connection)?;
    ensure_default_platform_validation(&connection)?;

    let mut record = get_platform_validation_record(&connection, &platform_id)?;
    let mut missing = Vec::new();
    if record.dry_run_checked_at.trim().is_empty() {
        missing.push("dry-run chưa đạt");
    }
    if record.text_saved_at.trim().is_empty() {
        missing.push("text/NAP/EEAT chưa được lưu");
    }
    if record.media_uploaded_at.trim().is_empty() {
        missing.push("avatar/banner chưa được upload");
    }
    if record.status != "media_uploaded" {
        missing.push("trạng thái hiện tại chưa xác nhận bước media cuối cùng");
    }

    let evidence_url = connection
        .query_row(
            "SELECT evidence_url FROM accounts WHERE platform_id = ?1 AND status = 'verified' ORDER BY updated_at DESC LIMIT 1",
            params![&platform_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_default();
    if !(evidence_url.starts_with("https://") || evidence_url.starts_with("http://")) {
        missing.push("chưa có evidence URL hợp lệ trên account đã verified");
    }

    if !missing.is_empty() {
        return Err(format!("Chưa thể chứng nhận {}: {}.", record.platform_name, missing.join(", ")));
    }

    let now = now_string();
    record.evidence_saved_at = now.clone();
    record.certified_at = now.clone();
    record.last_tested_url = evidence_url;
    record.notes = "Certified end-to-end: dry-run, text/NAP/EEAT, media, verified account and evidence passed.".to_string();
    record.updated_at = now;
    save_platform_validation_record_to_db(&connection, &record)?;
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
                    topical_niche, expertise_proof, trust_signals, avatar_image_url, banner_image_url
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
            avatar_image_url: row.get(16)?,
            banner_image_url: row.get(17)?,
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
fn get_provisioning_campaigns(app_handle: tauri::AppHandle) -> Result<Vec<ProvisioningCampaignRecord>, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    let mut statement = connection.prepare(
        "SELECT id, name, status, total_jobs, current_position, created_at, updated_at
         FROM provisioning_campaigns ORDER BY updated_at DESC"
    ).map_err(|error| error.to_string())?;
    let rows = statement.query_map([], |row| Ok(ProvisioningCampaignRecord {
        id: row.get(0)?, name: row.get(1)?, status: row.get(2)?, total_jobs: row.get(3)?,
        current_position: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)?,
    })).map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command]
fn save_provisioning_campaign(app_handle: tauri::AppHandle, campaign: ProvisioningCampaignRecord) -> Result<ProvisioningCampaignRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    connection.execute(
        "INSERT INTO provisioning_campaigns (id, name, status, total_jobs, current_position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, status=excluded.status,
         total_jobs=excluded.total_jobs, current_position=excluded.current_position, updated_at=excluded.updated_at",
        params![campaign.id, campaign.name, campaign.status, campaign.total_jobs, campaign.current_position, campaign.created_at, campaign.updated_at],
    ).map_err(|error| error.to_string())?;
    Ok(campaign)
}

#[tauri::command]
fn get_provisioning_jobs(app_handle: tauri::AppHandle) -> Result<Vec<ProvisioningJobRecord>, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    let mut statement = connection.prepare(
        "SELECT id, campaign_id, account_id, platform_id, platform_name, position, stage, status,
                signup_url, profile_url, evidence_url, last_message, attempt_count, created_at, updated_at
         FROM provisioning_jobs ORDER BY campaign_id DESC, position ASC"
    ).map_err(|error| error.to_string())?;
    let rows = statement.query_map([], |row| Ok(ProvisioningJobRecord {
        id: row.get(0)?, campaign_id: row.get(1)?, account_id: row.get(2)?, platform_id: row.get(3)?,
        platform_name: row.get(4)?, position: row.get(5)?, stage: row.get(6)?, status: row.get(7)?,
        signup_url: row.get(8)?, profile_url: row.get(9)?, evidence_url: row.get(10)?, last_message: row.get(11)?,
        attempt_count: row.get(12)?, created_at: row.get(13)?, updated_at: row.get(14)?,
    })).map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command]
fn save_provisioning_job(app_handle: tauri::AppHandle, job: ProvisioningJobRecord) -> Result<ProvisioningJobRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    connection.execute(
        "INSERT INTO provisioning_jobs (id, campaign_id, account_id, platform_id, platform_name, position, stage, status,
          signup_url, profile_url, evidence_url, last_message, attempt_count, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
         ON CONFLICT(id) DO UPDATE SET stage=excluded.stage, status=excluded.status, signup_url=excluded.signup_url,
          profile_url=excluded.profile_url, evidence_url=excluded.evidence_url, last_message=excluded.last_message,
          attempt_count=excluded.attempt_count, updated_at=excluded.updated_at",
        params![job.id, job.campaign_id, job.account_id, job.platform_id, job.platform_name, job.position, job.stage,
          job.status, job.signup_url, job.profile_url, job.evidence_url, job.last_message, job.attempt_count,
          job.created_at, job.updated_at],
    ).map_err(|error| error.to_string())?;
    Ok(job)
}

fn get_active_provisioning_job_record(connection: &Connection, platform_id: &str) -> Result<ProvisioningJobRecord, String> {
    connection.query_row(
        "SELECT id, campaign_id, account_id, platform_id, platform_name, position, stage, status,
                signup_url, profile_url, evidence_url, last_message, attempt_count, created_at, updated_at
         FROM provisioning_jobs
         WHERE platform_id = ?1 AND status IN ('running', 'waiting_user', 'queued')
         ORDER BY CASE status WHEN 'running' THEN 1 WHEN 'waiting_user' THEN 2 ELSE 3 END, created_at DESC LIMIT 1",
        params![platform_id],
        |row| Ok(ProvisioningJobRecord {
            id: row.get(0)?, campaign_id: row.get(1)?, account_id: row.get(2)?, platform_id: row.get(3)?,
            platform_name: row.get(4)?, position: row.get(5)?, stage: row.get(6)?, status: row.get(7)?,
            signup_url: row.get(8)?, profile_url: row.get(9)?, evidence_url: row.get(10)?, last_message: row.get(11)?,
            attempt_count: row.get(12)?, created_at: row.get(13)?, updated_at: row.get(14)?,
        }),
    ).map_err(|error| error.to_string())
}

fn update_provisioning_checkpoint_record(
    app_handle: &tauri::AppHandle,
    request: ProvisioningCheckpointRequest,
) -> Result<ProvisioningCheckpointResult, String> {
    let connection = open_database(app_handle)?;
    ensure_schema(&connection)?;
    let mut job = get_active_provisioning_job_record(&connection, &request.platform_id)?;
    let timestamp = now_string();
    job.stage = request.stage;
    job.status = request.status;
    job.last_message = request.message;
    job.attempt_count += 1;
    job.updated_at = timestamp.clone();
    if !request.evidence_url.trim().is_empty() {
        job.evidence_url = request.evidence_url.trim().to_string();
    }
    connection.execute(
        "UPDATE provisioning_jobs SET stage=?2, status=?3, evidence_url=?4, last_message=?5,
                attempt_count=?6, updated_at=?7 WHERE id=?1",
        params![job.id, job.stage, job.status, job.evidence_url, job.last_message, job.attempt_count, job.updated_at],
    ).map_err(|error| error.to_string())?;

    let mut next_job = None;
    if job.status == "completed" {
        if let Ok(mut candidate) = connection.query_row(
            "SELECT id, campaign_id, account_id, platform_id, platform_name, position, stage, status,
                    signup_url, profile_url, evidence_url, last_message, attempt_count, created_at, updated_at
             FROM provisioning_jobs WHERE campaign_id=?1 AND position>?2 AND status='queued' ORDER BY position ASC LIMIT 1",
            params![job.campaign_id, job.position],
            |row| Ok(ProvisioningJobRecord {
                id: row.get(0)?, campaign_id: row.get(1)?, account_id: row.get(2)?, platform_id: row.get(3)?,
                platform_name: row.get(4)?, position: row.get(5)?, stage: row.get(6)?, status: row.get(7)?,
                signup_url: row.get(8)?, profile_url: row.get(9)?, evidence_url: row.get(10)?, last_message: row.get(11)?,
                attempt_count: row.get(12)?, created_at: row.get(13)?, updated_at: row.get(14)?,
            }),
        ) {
            candidate.status = "running".to_string();
            candidate.last_message = "Platform trước đã hoàn tất. Sẵn sàng tạo tài khoản.".to_string();
            candidate.updated_at = timestamp.clone();
            connection.execute(
                "UPDATE provisioning_jobs SET status='running', last_message=?2, updated_at=?3 WHERE id=?1",
                params![candidate.id, candidate.last_message, candidate.updated_at],
            ).map_err(|error| error.to_string())?;
            connection.execute(
                "UPDATE provisioning_campaigns SET current_position=?2, updated_at=?3 WHERE id=?1",
                params![job.campaign_id, candidate.position, timestamp],
            ).map_err(|error| error.to_string())?;
            next_job = Some(candidate);
        } else {
            connection.execute(
                "UPDATE provisioning_campaigns SET status='completed', current_position=total_jobs, updated_at=?2 WHERE id=?1",
                params![job.campaign_id, timestamp],
            ).map_err(|error| error.to_string())?;
        }
    }
    Ok(ProvisioningCheckpointResult { job, next_job })
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
                "requiredFields": required_fields_for_platform(&account.platform_id, &account.platform_name),
                "requiresCaptchaToken": true,
                "submitSelectors": selectors.0,
                "verifySelectors": selectors.1,
                "evidenceCapture": "current_url",
                "executionSteps": execution_steps_for_platform(&account.platform_id),
                "saveTextSelector": save_text_selector_for_platform(&account.platform_id, &account.platform_name),
                "mediaConfirmSelector": media_confirm_selector_for_platform(&account.platform_id, &account.platform_name),
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

fn get_dry_run_preview_payload_record(
    app_handle: &tauri::AppHandle,
    requested_platform_id: Option<&str>,
) -> Result<AccountSubmitVerifyPayload, String> {
    let connection = open_database(app_handle)?;
    ensure_schema(&connection)?;
    ensure_default_platforms(&connection)?;
    ensure_default_selector_recipes(&connection)?;

    let platforms = get_platform_records(&connection)?;
    let platform = if let Some(platform_id) = requested_platform_id {
        platforms.iter().find(|item| item.id.eq_ignore_ascii_case(platform_id))
            .ok_or_else(|| format!("Không tìm thấy nền tảng '{}' trong Platform Library.", platform_id))?
    } else {
        platforms.first().ok_or_else(|| "Không có nền tảng nào để chạy thử. Hãy mở Platform Library trước.".to_string())?
    };
    let profile = get_entity_profile_record(&connection).unwrap_or_else(|_| default_entity_profile());
    let money_site = get_money_site_record(&connection).unwrap_or_else(|_| default_money_site());
    let recipe = get_selector_recipe_record(&connection, &platform.id).ok();
    let fallback_selectors = submit_verify_selectors(&platform.id, &platform.name);
    let fallback_field_selectors = submit_verify_field_selectors(&platform.id, &platform.name);
    let recipe_field_selectors = recipe
        .as_ref()
        .and_then(|item| serde_json::from_str::<serde_json::Value>(&item.field_selectors_json).ok())
        .unwrap_or_else(|| json!({}));
    let clean_brand = profile.brand_name.to_lowercase().chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .take(22)
        .collect::<String>();
    let username = if clean_brand.is_empty() { "entitymanager-test".to_string() } else { format!("{clean_brand}test") };
    let entity_social_links = profile
        .same_as_urls
        .lines()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .take(4)
        .collect::<Vec<_>>()
        .join("\n");
    let avatar_image_value = image_asset_value_to_bridge_value(&profile.avatar_image_url);
    let banner_image_value = image_asset_value_to_bridge_value(&profile.banner_image_url);
    let required_fields = recipe.as_ref()
        .map(|item| lines_to_strings(&item.required_fields))
        .filter(|items| !items.is_empty())
        .unwrap_or_else(|| required_fields_for_platform(&platform.id, &platform.name));
    let submit_selectors = recipe.as_ref().map(|item| lines_to_strings(&item.submit_selectors)).filter(|items| !items.is_empty()).unwrap_or_else(|| fallback_selectors.0.clone());
    let verify_selectors = recipe.as_ref().map(|item| lines_to_strings(&item.verify_selectors)).filter(|items| !items.is_empty()).unwrap_or_else(|| fallback_selectors.1.clone());

    Ok(AccountSubmitVerifyPayload {
        queue_id: format!("dry-run-preview-{}", platform.id),
        account_id: format!("dry-run-preview-{}", platform.id),
        platform_id: platform.id.clone(),
        platform_name: platform.name.clone(),
        action: "submit_or_verify_account".to_string(),
        form_values: SubmitVerifyFormValues {
            username,
            email: profile.email,
            display_name: if profile.brand_name.trim().is_empty() { profile.legal_name.clone() } else { profile.brand_name.clone() },
            bio: if profile.short_description.trim().is_empty() { platform.notes.clone() } else { profile.short_description.clone() },
            website_url: money_site.homepage_url.trim().to_string(),
            company: profile.legal_name.clone(),
            location: profile.address.clone(),
            social_links: entity_social_links,
            profile_image: avatar_image_value.clone(),
            avatar_image_url: avatar_image_value,
            banner_image_url: banner_image_value,
        },
        field_selectors: SubmitVerifyFieldSelectors {
            username: json_array_to_strings(&recipe_field_selectors["username"]).into_iter().chain(fallback_field_selectors.username).collect(),
            email: json_array_to_strings(&recipe_field_selectors["email"]).into_iter().chain(fallback_field_selectors.email).collect(),
            display_name: json_array_to_strings(&recipe_field_selectors["displayName"]).into_iter().chain(fallback_field_selectors.display_name).collect(),
            bio: json_array_to_strings(&recipe_field_selectors["bio"]).into_iter().chain(fallback_field_selectors.bio).collect(),
            website_url: json_array_to_strings(&recipe_field_selectors["websiteUrl"]).into_iter().chain(fallback_field_selectors.website_url).collect(),
            company: json_array_to_strings(&recipe_field_selectors["company"]).into_iter().chain(fallback_field_selectors.company).collect(),
            location: json_array_to_strings(&recipe_field_selectors["location"]).into_iter().chain(fallback_field_selectors.location).collect(),
            social_links: json_array_to_strings(&recipe_field_selectors["socialLinks"]).into_iter().chain(fallback_field_selectors.social_links).collect(),
            profile_image: json_array_to_strings(&recipe_field_selectors["profileImage"]).into_iter().chain(fallback_field_selectors.profile_image).collect(),
            avatar_image_url: json_array_to_strings(&recipe_field_selectors["avatarImageUrl"]).into_iter().chain(fallback_field_selectors.avatar_image_url).collect(),
            banner_image_url: json_array_to_strings(&recipe_field_selectors["bannerImageUrl"]).into_iter().chain(fallback_field_selectors.banner_image_url).collect(),
        },
        required_fields,
        requires_captcha_token: recipe.as_ref().map(|item| item.requires_captcha_token).unwrap_or(false),
        submit_selectors,
        verify_selectors,
        evidence_capture: "current_url".to_string(),
        notes: "Chế độ chạy thử độc lập: không cần hàng đợi, không điền dữ liệu và không nhấn nút gửi.".to_string(),
        execution_steps: execution_steps_for_platform(&platform.id),
        save_text_selector: save_text_selector_for_platform(&platform.id, &platform.name),
        media_confirm_selector: media_confirm_selector_for_platform(&platform.id, &platform.name),
    })
}

fn get_next_submit_verify_payload_record(
    app_handle: &tauri::AppHandle,
    requested_platform_id: Option<&str>,
) -> Result<AccountSubmitVerifyPayload, String> {
    let connection = open_database(app_handle)?;
    ensure_schema(&connection)?;

    let mut statement = connection
        .prepare(
            "SELECT id, account_id, platform_name, gate_type, status, payload, created_at, updated_at
             FROM automation_queue
             WHERE gate_type = 'submit_verify'
               AND status IN ('waiting', 'queued')
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
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let item = if let Some(platform_id) = requested_platform_id {
        items.into_iter().find(|candidate| {
            get_account_record(&connection, &candidate.account_id)
                .map(|account| account.platform_id.eq_ignore_ascii_case(platform_id))
                .unwrap_or(false)
        })
    } else {
        items.into_iter().next()
    }
    .ok_or_else(|| requested_platform_id
        .map(|platform_id| format!("No submit/verify queue item is ready for {platform_id}."))
        .unwrap_or_else(|| "No submit/verify queue item is ready.".to_string()))?;
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
    let entity_social_links = profile
        .same_as_urls
        .lines()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .take(4)
        .collect::<Vec<_>>()
        .join("\n");
    let avatar_image_value = image_asset_value_to_bridge_value(&profile.avatar_image_url);
    let banner_image_value = image_asset_value_to_bridge_value(&profile.banner_image_url);

    Ok(AccountSubmitVerifyPayload {
        queue_id: item.id,
        account_id: item.account_id,
        platform_id: account.platform_id.clone(),
        platform_name: item.platform_name,
        action: "submit_or_verify_account".to_string(),
        form_values: SubmitVerifyFormValues {
            username: account.recommended_username,
            email: profile.email,
            display_name: if profile.brand_name.trim().is_empty() { profile.legal_name.clone() } else { profile.brand_name.clone() },
            bio: if profile.short_description.trim().is_empty() { account.notes.clone() } else { profile.short_description.clone() },
            website_url: money_site.homepage_url.trim().to_string(),
            company: profile.legal_name.clone(),
            location: profile.address.clone(),
            social_links: entity_social_links,
            profile_image: avatar_image_value.clone(),
            avatar_image_url: avatar_image_value,
            banner_image_url: banner_image_value,
        },
        field_selectors: SubmitVerifyFieldSelectors {
            username: json_array_to_strings(&recipe_field_selectors["username"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["username"])).chain(fallback_field_selectors.username).collect(),
            email: json_array_to_strings(&recipe_field_selectors["email"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["email"])).chain(fallback_field_selectors.email).collect(),
            display_name: json_array_to_strings(&recipe_field_selectors["displayName"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["displayName"])).chain(fallback_field_selectors.display_name).collect(),
            bio: json_array_to_strings(&recipe_field_selectors["bio"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["bio"])).chain(fallback_field_selectors.bio).collect(),
            website_url: json_array_to_strings(&recipe_field_selectors["websiteUrl"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["websiteUrl"])).chain(fallback_field_selectors.website_url).collect(),
            company: json_array_to_strings(&recipe_field_selectors["company"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["company"])).chain(fallback_field_selectors.company).collect(),
            location: json_array_to_strings(&recipe_field_selectors["location"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["location"])).chain(fallback_field_selectors.location).collect(),
            social_links: json_array_to_strings(&recipe_field_selectors["socialLinks"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["socialLinks"])).chain(fallback_field_selectors.social_links).collect(),
            profile_image: json_array_to_strings(&recipe_field_selectors["profileImage"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["profileImage"])).chain(fallback_field_selectors.profile_image).collect(),
            avatar_image_url: json_array_to_strings(&recipe_field_selectors["avatarImageUrl"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["avatarImageUrl"])).chain(fallback_field_selectors.avatar_image_url).collect(),
            banner_image_url: json_array_to_strings(&recipe_field_selectors["bannerImageUrl"]).into_iter().chain(json_array_to_strings(&payload["fieldSelectors"]["bannerImageUrl"])).chain(fallback_field_selectors.banner_image_url).collect(),
        },
        required_fields: if required_fields.is_empty() { required_fields_for_platform(&account.platform_id, &account.platform_name) } else { required_fields },
        requires_captcha_token: recipe
            .as_ref()
            .map(|item| item.requires_captcha_token)
            .unwrap_or_else(|| payload["requiresCaptchaToken"].as_bool().unwrap_or(true)),
        submit_selectors: if submit_selectors.is_empty() { fallback_selectors.0 } else { submit_selectors },
        verify_selectors: if verify_selectors.is_empty() { fallback_selectors.1 } else { verify_selectors },
        evidence_capture: payload["evidenceCapture"].as_str().unwrap_or("current_url").to_string(),
        notes: payload["message"].as_str().unwrap_or("Submit or verify the account, then capture current URL as evidence.").to_string(),
        execution_steps: {
            let payload_steps = json_array_to_strings(&payload["executionSteps"]);
            if payload_steps.is_empty() { execution_steps_for_platform(&account.platform_id) } else { payload_steps }
        },
        save_text_selector: payload["saveTextSelector"].as_str()
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| save_text_selector_for_platform(&account.platform_id, &account.platform_name)),
        media_confirm_selector: payload["mediaConfirmSelector"].as_str()
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| media_confirm_selector_for_platform(&account.platform_id, &account.platform_name)),
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

    if request.success && (account.evidence_url.starts_with("https://") || account.evidence_url.starts_with("http://")) {
        connection
            .execute(
                "INSERT INTO indexing_queue (
                    id, url, source_platform, account_id, status, attempt_count,
                    last_error, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, 'queued', 0, '', ?5, ?5)
                 ON CONFLICT(id) DO UPDATE SET
                    url = excluded.url,
                    source_platform = excluded.source_platform,
                    account_id = excluded.account_id,
                    status = CASE WHEN indexing_queue.status = 'indexed' THEN 'indexed' ELSE 'queued' END,
                    updated_at = excluded.updated_at",
                params![
                    format!("index-{}", account.id),
                    account.evidence_url,
                    account.platform_name,
                    account.id,
                    timestamp
                ],
            )
            .map_err(|error| error.to_string())?;
    }

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

fn proxy_secret_account(proxy_id: &str) -> String {
    format!("proxy:{proxy_id}")
}

fn bundled_extension_directory(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_root = app_handle.path().resource_dir().map_err(|error| error.to_string())?;
    let candidates = [
        resource_root.join("resources").join("extension"),
        resource_root.join("extension"),
    ];
    candidates.into_iter().find(|path| path.join("manifest.json").is_file()).ok_or_else(|| {
        format!("Không tìm thấy Bridge trong resource directory {} (đã kiểm tra resources/extension và extension).", resource_root.display())
    })
}

fn browser_executable(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Ok(resource_root) = app_handle.path().resource_dir() {
        candidates.push(resource_root.join("resources").join("chromium").join("chrome.exe"));
        candidates.push(resource_root.join("chromium").join("chrome.exe"));
    }
    #[cfg(target_os = "windows")]
    {
        for variable in ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"] {
            if let Ok(root) = std::env::var(variable) {
                candidates.push(PathBuf::from(&root).join("Google/Chrome/Application/chrome.exe"));
                candidates.push(PathBuf::from(&root).join("Microsoft/Edge/Application/msedge.exe"));
            }
        }
    }
    #[cfg(target_os = "macos")]
    candidates.push(PathBuf::from("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"));
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        candidates.push(PathBuf::from("/usr/bin/google-chrome"));
        candidates.push(PathBuf::from("/usr/bin/chromium"));
        candidates.push(PathBuf::from("/usr/bin/chromium-browser"));
    }
    candidates.into_iter().find(|path| path.is_file()).ok_or_else(|| {
        "Không tìm thấy Managed Chromium đã đóng gói hoặc Chrome/Edge dự phòng. Hãy cài bản EntityManager mới nhất.".to_string()
    })
}

fn proxy_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProxyRecord> {
    let id: String = row.get(0)?;
    Ok(ProxyRecord {
        has_password: has_secret(&proxy_secret_account(&id)),
        id,
        name: row.get(1)?, protocol: row.get(2)?, host: row.get(3)?, port: row.get(4)?, username: row.get(5)?,
        password: String::new(), country_code: row.get(6)?, status: row.get(7)?, latency_ms: row.get(8)?, exit_ip: row.get(9)?,
        last_error: row.get(10)?, last_checked_at: row.get(11)?, is_enabled: row.get::<_, i64>(12)? != 0,
        created_at: row.get(13)?, updated_at: row.get(14)?,
    })
}

#[tauri::command]
fn get_proxy_records(app_handle: tauri::AppHandle) -> Result<Vec<ProxyRecord>, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    let mut statement = connection.prepare("SELECT id,name,protocol,host,port,username,country_code,status,latency_ms,exit_ip,last_error,last_checked_at,is_enabled,created_at,updated_at FROM proxy_records ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    let rows = statement.query_map([], proxy_from_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn gmail_oauth_status_record(connection: &Connection) -> Result<GmailOAuthStatus, String> {
    connection.query_row(
        "SELECT client_id,account_email,status,last_message,last_checked_at,current_auth_url,client_secret_protected,refresh_token_protected FROM gmail_oauth_state WHERE id=1",
        [],
        |row| {
            let client_id: String = row.get(0)?;
            let stored_status: String = row.get(2)?;
            let protected_secret: String = row.get(6)?;
            let protected_refresh_token: String = row.get(7)?;
            let configured = !client_id.trim().is_empty() && (has_secret(GMAIL_CLIENT_SECRET_KEY) || !protected_secret.trim().is_empty());
            let connected = stored_status == "connected" && (has_secret(GMAIL_REFRESH_TOKEN_KEY) || !protected_refresh_token.trim().is_empty());
            let status = if connected { "connected" } else if configured { stored_status.as_str() } else { "not_configured" }.to_string();
            Ok(GmailOAuthStatus {
                configured,
                connected,
                client_id,
                account_email: row.get(1)?,
                status,
                last_message: row.get(3)?,
                last_checked_at: row.get(4)?,
                authorization_url: row.get(5)?,
            })
        },
    ).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_gmail_oauth_status(app_handle: tauri::AppHandle) -> Result<GmailOAuthStatus, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    gmail_oauth_status_record(&connection)
}

#[tauri::command]
fn save_gmail_oauth_config(app_handle: tauri::AppHandle, config: GmailOAuthConfigInput) -> Result<GmailOAuthStatus, String> {
    let client_id = config.client_id.trim();
    if client_id.is_empty() || !client_id.ends_with(".apps.googleusercontent.com") {
        return Err("Google OAuth Client ID không hợp lệ; giá trị phải kết thúc bằng .apps.googleusercontent.com".to_string());
    }
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    let existing_protected: String = connection.query_row("SELECT client_secret_protected FROM gmail_oauth_state WHERE id=1", [], |row| row.get(0)).unwrap_or_default();
    let protected_secret = if !config.client_secret.trim().is_empty() {
        let encrypted = protect_for_current_windows_user(config.client_secret.trim())?;
        let _ = save_secret(GMAIL_CLIENT_SECRET_KEY, &config.client_secret);
        encrypted
    } else if has_secret(GMAIL_CLIENT_SECRET_KEY) || !existing_protected.trim().is_empty() {
        existing_protected
    } else {
        return Err("Hãy nhập Client Secret của OAuth Desktop app trong lần cấu hình đầu tiên.".to_string());
    };
    let timestamp = now_string();
    connection.execute(
        "UPDATE gmail_oauth_state SET client_id=?1,client_secret_protected=?2,status='configured',last_message='Đã lưu cấu hình OAuth; chưa kết nối Gmail.',updated_at=?3 WHERE id=1",
        params![client_id, protected_secret, timestamp],
    ).map_err(|error| error.to_string())?;
    gmail_oauth_status_record(&connection)
}

#[tauri::command]
fn start_gmail_oauth(app_handle: tauri::AppHandle) -> Result<GmailOAuthStatus, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    let status = gmail_oauth_status_record(&connection)?;
    if !status.configured {
        return Err("Hãy lưu Google OAuth Client ID và Client Secret trước.".to_string());
    }

    let listener = TcpListener::bind("127.0.0.1:17322")
        .map_err(|error| format!("Không mở được OAuth callback 127.0.0.1:17322: {error}"))?;
    listener.set_nonblocking(true).map_err(|error| error.to_string())?;
    let verifier: String = rand::thread_rng().sample_iter(&Alphanumeric).take(64).map(char::from).collect();
    let state: String = rand::thread_rng().sample_iter(&Alphanumeric).take(32).map(char::from).collect();
    let challenge = general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let redirect_uri = "http://127.0.0.1:17322/oauth/callback";
    let mut auth_url = url::Url::parse("https://accounts.google.com/o/oauth2/v2/auth").map_err(|error| error.to_string())?;
    auth_url.query_pairs_mut()
        .append_pair("client_id", &status.client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", "openid email https://www.googleapis.com/auth/gmail.readonly")
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256");

    connection.execute(
        "UPDATE gmail_oauth_state SET status='authorizing',last_message='Đang chờ anh chấp thuận quyền Gmail trên trang Google.',current_auth_url=?1,updated_at=?2 WHERE id=1",
        params![auth_url.as_str(), now_string()],
    ).map_err(|error| error.to_string())?;

    let callback_app = app_handle.clone();
    let client_id = status.client_id.clone();
    std::thread::spawn(move || {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(300);
        loop {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let mut buffer = [0_u8; 16_384];
                    let read = stream.read(&mut buffer).unwrap_or(0);
                    let request = String::from_utf8_lossy(&buffer[..read]);
                    let target = request.lines().next().and_then(|line| line.split_whitespace().nth(1)).unwrap_or("");
                    let parsed = url::Url::parse(&format!("http://127.0.0.1{target}"));
                    let result = parsed.map_err(|error| error.to_string()).and_then(|url| {
                        let values = url.query_pairs().collect::<std::collections::HashMap<_, _>>();
                        if values.get("state").map(|value| value.as_ref()) != Some(state.as_str()) {
                            return Err("OAuth state không khớp; yêu cầu đã bị hủy để bảo vệ tài khoản.".to_string());
                        }
                        let code = values.get("code").map(|value| value.to_string()).ok_or_else(|| {
                            values.get("error").map(|value| format!("Google OAuth từ chối: {value}")).unwrap_or_else(|| "Google không trả về authorization code.".to_string())
                        })?;
                        complete_gmail_oauth(&callback_app, &client_id, &code, &verifier, redirect_uri)
                    });
                    let (title, message) = match result {
                        Ok(email) => ("Kết nối Gmail thành công", format!("EntityManager đã được cấp quyền đọc email cho {email}. Anh có thể đóng tab này.")),
                        Err(error) => {
                            if let Ok(connection) = open_database(&callback_app) {
                                let _ = connection.execute("UPDATE gmail_oauth_state SET status='error',last_message=?1,updated_at=?2 WHERE id=1", params![&error, now_string()]);
                            }
                            ("Kết nối Gmail thất bại", format!("{error} Hãy quay lại EntityManager và thử lại."))
                        }
                    };
                    let body = format!("<!doctype html><meta charset='utf-8'><title>{title}</title><style>body{{font:16px system-ui;max-width:720px;margin:80px auto;padding:24px}}h1{{color:#163a5f}}</style><h1>{title}</h1><p>{message}</p>");
                    let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
                    let _ = stream.write_all(response.as_bytes());
                    break;
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    if std::time::Instant::now() >= deadline {
                        if let Ok(connection) = open_database(&callback_app) {
                            let _ = connection.execute("UPDATE gmail_oauth_state SET status='configured',last_message='OAuth hết thời gian chờ; hãy bấm Kết nối Gmail lại.',updated_at=?1 WHERE id=1", params![now_string()]);
                        }
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(250));
                }
                Err(_) => break,
            }
        }
    });
    // Google blocks sign-in from automation-controlled Chrome/Chromium. OAuth must
    // be completed in the user's normal system browser; the managed runtime is
    // reserved for platform provisioning after a refresh token is available.
    if let Err(error) = open_external_url(auth_url.to_string()) {
        connection.execute(
            "UPDATE gmail_oauth_state SET last_message=?1,updated_at=?2 WHERE id=1",
            params![format!("Windows không tự mở được trang Google OAuth ({error}). Hãy bấm Mở trang Google OAuth hoặc copy URL dự phòng."), now_string()],
        ).map_err(|db_error| db_error.to_string())?;
    }
    gmail_oauth_status_record(&connection)
}

fn complete_gmail_oauth(app_handle: &tauri::AppHandle, client_id: &str, code: &str, verifier: &str, redirect_uri: &str) -> Result<String, String> {
    let client_secret = read_gmail_client_secret(app_handle)?;
    let response = reqwest::blocking::Client::new().post("https://oauth2.googleapis.com/token").form(&[
        ("client_id", client_id), ("client_secret", client_secret.as_str()), ("code", code),
        ("code_verifier", verifier), ("grant_type", "authorization_code"), ("redirect_uri", redirect_uri),
    ]).send().map_err(|error| format!("Không đổi được OAuth code: {error}"))?
        .error_for_status().map_err(|error| format!("Google từ chối OAuth token: {error}"))?
        .json::<serde_json::Value>().map_err(|error| error.to_string())?;
    let refresh_token = response["refresh_token"].as_str().ok_or_else(|| "Google không cấp refresh token. Hãy thu hồi quyền cũ rồi kết nối lại với prompt consent.".to_string())?;
    let access_token = response["access_token"].as_str().ok_or_else(|| "Google không trả về access token.".to_string())?;
    let protected_refresh_token = protect_for_current_windows_user(refresh_token)?;
    let _ = save_secret(GMAIL_REFRESH_TOKEN_KEY, refresh_token);
    let email = reqwest::blocking::Client::new().get("https://openidconnect.googleapis.com/v1/userinfo")
        .bearer_auth(access_token).send().map_err(|error| error.to_string())?
        .error_for_status().map_err(|error| error.to_string())?
        .json::<serde_json::Value>().map_err(|error| error.to_string())?["email"].as_str().unwrap_or("").to_string();
    let connection = open_database(app_handle)?;
    connection.execute(
        "UPDATE gmail_oauth_state SET account_email=?1,refresh_token_protected=?2,status='connected',last_message='Gmail OAuth đã kết nối; worker có thể đọc email xác minh Medium.',last_checked_at=?3,current_auth_url='',updated_at=?3 WHERE id=1",
        params![email, protected_refresh_token, now_string()],
    ).map_err(|error| error.to_string())?;
    Ok(email)
}

fn gmail_access_token(app_handle: &tauri::AppHandle) -> Result<String, String> {
    let connection = open_database(app_handle)?;
    ensure_schema(&connection)?;
    let status = gmail_oauth_status_record(&connection)?;
    if !status.connected { return Err("Gmail OAuth chưa kết nối.".to_string()); }
    let refresh_token = read_gmail_refresh_token(app_handle)?;
    let client_secret = read_gmail_client_secret(app_handle)?;
    let response = reqwest::blocking::Client::new().post("https://oauth2.googleapis.com/token").form(&[
        ("client_id", status.client_id.as_str()), ("client_secret", client_secret.as_str()),
        ("refresh_token", refresh_token.as_str()), ("grant_type", "refresh_token"),
    ]).send().map_err(|error| format!("Không làm mới được Gmail token: {error}"))?
        .error_for_status().map_err(|error| format!("Google từ chối refresh token: {error}"))?
        .json::<serde_json::Value>().map_err(|error| error.to_string())?;
    response["access_token"].as_str().map(str::to_string).ok_or_else(|| "Google không trả về access token mới.".to_string())
}

#[tauri::command]
fn test_gmail_connection(app_handle: tauri::AppHandle) -> Result<String, String> {
    let access_token = gmail_access_token(&app_handle)?;
    let response = reqwest::blocking::Client::new()
        .get("https://gmail.googleapis.com/gmail/v1/users/me/profile")
        .bearer_auth(access_token)
        .send().map_err(|error| format!("Không gọi được Gmail API: {error}"))?
        .error_for_status().map_err(|error| format!("Gmail API từ chối quyền: {error}"))?
        .json::<serde_json::Value>().map_err(|error| error.to_string())?;
    let email = response["emailAddress"].as_str().unwrap_or("Gmail đã cấp quyền");
    let total = response["messagesTotal"].as_i64().unwrap_or(0);
    Ok(format!("Gmail API hoạt động cho {email}; hộp thư có khoảng {total} email."))
}

fn medium_verification_link(raw_message: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(raw_message).replace("=\r\n", "").replace("&amp;", "&");
    let pattern = Regex::new(r#"https://[^\s\"'<>]+"#).ok()?;
    let result = pattern.find_iter(&text).map(|item| item.as_str().trim_end_matches(['.', ')', ']', ';']).to_string()).find(|url| {
        let lower = url.to_ascii_lowercase();
        lower.contains("medium.com") && ["verify", "callback", "signin", "email"].iter().any(|needle| lower.contains(needle))
    });
    result
}

fn poll_medium_verification(app_handle: &tauri::AppHandle) -> Result<String, String> {
    let connection = open_database(app_handle)?;
    ensure_schema(&connection)?;
    let job: (String, String, i64) = connection.query_row(
        "SELECT id,account_id,CAST(updated_at AS INTEGER) FROM provisioning_jobs WHERE platform_id='medium' AND stage='email_verification' AND status IN ('waiting_user','running') ORDER BY CAST(updated_at AS INTEGER) DESC LIMIT 1",
        [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|error| if matches!(error, rusqlite::Error::QueryReturnedNoRows) { "Không có Medium checkpoint đang chờ email xác minh.".to_string() } else { error.to_string() })?;
    let access_token = gmail_access_token(app_handle)?;
    let client = reqwest::blocking::Client::new();
    let query = "from:(medium.com) newer_than:7d";
    let list = client.get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
        .bearer_auth(&access_token).query(&[("q", query), ("maxResults", "10")]).send()
        .map_err(|error| format!("Không đọc được Gmail: {error}"))?.error_for_status().map_err(|error| error.to_string())?
        .json::<serde_json::Value>().map_err(|error| error.to_string())?;
    let messages = list["messages"].as_array().cloned().unwrap_or_default();
    for message in messages {
        let Some(id) = message["id"].as_str() else { continue };
        let payload = client.get(format!("https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}"))
            .bearer_auth(&access_token).query(&[("format", "raw")]).send().map_err(|error| error.to_string())?
            .error_for_status().map_err(|error| error.to_string())?.json::<serde_json::Value>().map_err(|error| error.to_string())?;
        let message_time_ms = payload["internalDate"].as_str().and_then(|value| value.parse::<i64>().ok()).unwrap_or(0);
        if message_time_ms > 0 && message_time_ms < job.2.saturating_mul(1000) { continue; }
        let Some(raw) = payload["raw"].as_str() else { continue };
        let bytes = general_purpose::URL_SAFE_NO_PAD.decode(raw).or_else(|_| general_purpose::URL_SAFE.decode(raw)).unwrap_or_default();
        if let Some(link) = medium_verification_link(&bytes) {
            let session_id: String = connection.query_row(
                "SELECT id FROM browser_sessions WHERE job_id=?1 AND status='running' ORDER BY updated_at DESC LIMIT 1",
                params![job.0], |row| row.get(0),
            ).map_err(|_| "Đã tìm thấy link Medium nhưng Managed Browser session không còn chạy.".to_string())?;
            open_managed_browser_url(app_handle.clone(), session_id, link)?;
            let timestamp = now_string();
            connection.execute("UPDATE provisioning_jobs SET stage='login',status='running',last_message='Gmail OAuth đã tìm thấy và mở link xác minh Medium.',updated_at=?1 WHERE id=?2", params![timestamp,job.0]).map_err(|error| error.to_string())?;
            connection.execute("UPDATE gmail_oauth_state SET last_message='Đã mở link xác minh Medium trong Managed Browser.',last_checked_at=?1,updated_at=?1 WHERE id=1", params![timestamp]).map_err(|error| error.to_string())?;
            return Ok("Đã tìm thấy email và mở link xác minh Medium trong đúng Managed Browser profile.".to_string());
        }
    }
    connection.execute("UPDATE gmail_oauth_state SET last_message='Chưa tìm thấy email xác minh Medium; worker sẽ thử lại.',last_checked_at=?1,updated_at=?1 WHERE id=1", params![now_string()]).map_err(|error| error.to_string())?;
    Ok("Chưa tìm thấy email xác minh Medium; worker sẽ tự thử lại.".to_string())
}

#[tauri::command]
fn poll_medium_verification_now(app_handle: tauri::AppHandle) -> Result<String, String> {
    poll_medium_verification(&app_handle)
}

fn start_gmail_verification_worker(app_handle: tauri::AppHandle) {
    if GMAIL_VERIFICATION_WORKER_STARTED.swap(true, Ordering::SeqCst) { return; }
    std::thread::spawn(move || loop {
        let _ = poll_medium_verification(&app_handle);
        std::thread::sleep(std::time::Duration::from_secs(20));
    });
}

#[tauri::command]
fn run_system_diagnostics(app_handle: tauri::AppHandle) -> Result<Vec<SystemDiagnosticCheck>, String> {
    let mut checks = Vec::new();
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    checks.push(SystemDiagnosticCheck {
        id: "sqlite".to_string(), label: "SQLite local database".to_string(), status: "ok".to_string(),
        message: "Đã mở database và cập nhật schema thành công.".to_string(),
    });

    let resource_result = bundled_extension_directory(&app_handle);
    checks.push(SystemDiagnosticCheck {
        id: "extension".to_string(), label: "Managed Browser Bridge".to_string(),
        status: if resource_result.is_ok() { "ok" } else { "error" }.to_string(),
        message: resource_result.map(|path| format!("Extension đã được đóng gói tại {}.", path.display())).unwrap_or_else(|error| error),
    });

    checks.push(match browser_executable(&app_handle) {
        Ok(path) => {
            let managed = path.to_string_lossy().contains("EntityManager") && path.to_string_lossy().contains("chromium");
            SystemDiagnosticCheck { id: "browser".to_string(), label: "Chromium runtime".to_string(), status: if managed { "ok" } else { "warning" }.to_string(), message: if managed { format!("Managed Chromium đã được đóng gói tại {}.", path.display()) } else { format!("Đang dùng browser dự phòng tại {}; nên cài bản có Managed Chromium.", path.display()) } }
        },
        Err(error) => SystemDiagnosticCheck { id: "browser".to_string(), label: "Chromium runtime".to_string(), status: "error".to_string(), message: error },
    });

    let bridge_ready = "127.0.0.1:17321".parse().ok().and_then(|address| TcpStream::connect_timeout(&address, std::time::Duration::from_millis(500)).ok()).is_some();
    checks.push(SystemDiagnosticCheck {
        id: "bridge".to_string(), label: "Desktop ↔ Extension bridge".to_string(), status: if bridge_ready { "ok" } else { "warning" }.to_string(),
        message: if bridge_ready { "Bridge đang lắng nghe tại 127.0.0.1:17321.".to_string() } else { "Bridge chưa lắng nghe; khởi động lại Desktop rồi kiểm tra lại.".to_string() },
    });

    let gmail = gmail_oauth_status_record(&connection)?;
    checks.push(SystemDiagnosticCheck {
        id: "gmail_config".to_string(), label: "Gmail OAuth configuration".to_string(), status: if gmail.configured { "ok" } else { "error" }.to_string(),
        message: if gmail.configured { "Client ID và Client Secret đã sẵn sàng.".to_string() } else { "Thiếu Client ID hoặc Client Secret trong Credential Manager.".to_string() },
    });
    checks.push(SystemDiagnosticCheck {
        id: "gmail_connection".to_string(), label: "Gmail authorization".to_string(), status: if gmail.connected { "ok" } else if gmail.status == "authorizing" { "warning" } else { "not_tested" }.to_string(),
        message: if gmail.connected { format!("Đã kết nối {}.", gmail.account_email) } else if gmail.status == "authorizing" { "Đang chờ hoàn tất trang Google OAuth; có thể mở lại URL dự phòng.".to_string() } else { "Chưa có refresh token; cần cấp quyền Google một lần.".to_string() },
    });

    let running_sessions: i64 = connection.query_row("SELECT COUNT(*) FROM browser_sessions WHERE status='running'", [], |row| row.get(0)).unwrap_or(0);
    checks.push(SystemDiagnosticCheck {
        id: "browser_sessions".to_string(), label: "Managed Browser sessions".to_string(), status: if running_sessions > 0 { "ok" } else { "not_tested" }.to_string(),
        message: if running_sessions > 0 { format!("Có {running_sessions} browser session đang chạy.") } else { "Chưa có session đang chạy; đây không phải lỗi trước khi bắt đầu campaign.".to_string() },
    });
    let waiting_medium: i64 = connection.query_row("SELECT COUNT(*) FROM provisioning_jobs WHERE platform_id='medium' AND stage='email_verification' AND status IN ('waiting_user','running')", [], |row| row.get(0)).unwrap_or(0);
    checks.push(SystemDiagnosticCheck {
        id: "medium_checkpoint".to_string(), label: "Medium verification checkpoint".to_string(), status: if waiting_medium > 0 { "warning" } else { "not_tested" }.to_string(),
        message: if waiting_medium > 0 { format!("Có {waiting_medium} job đang chờ Gmail worker.") } else { "Không có Medium job đang chờ email ở thời điểm kiểm tra.".to_string() },
    });
    let queued_index: i64 = connection.query_row("SELECT COUNT(*) FROM indexing_queue WHERE status IN ('queued','retry')", [], |row| row.get(0)).unwrap_or(0);
    checks.push(SystemDiagnosticCheck {
        id: "indexing".to_string(), label: "Indexing queue".to_string(), status: "not_tested".to_string(),
        message: format!("Có {queued_index} URL đang chờ. Diagnostic chỉ xác minh hàng đợi; adapter index live cần provider hợp lệ."),
    });
    Ok(checks)
}

#[tauri::command]
fn save_proxy_record(app_handle: tauri::AppHandle, proxy: ProxyRecord) -> Result<ProxyRecord, String> {
    if proxy.host.trim().is_empty() || !(1..=65535).contains(&proxy.port) { return Err("Proxy cần host và port hợp lệ.".to_string()); }
    if !["http", "https", "socks5"].contains(&proxy.protocol.as_str()) { return Err("Proxy protocol phải là http, https hoặc socks5.".to_string()); }
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    let timestamp = now_string();
    if !proxy.password.trim().is_empty() {
        save_secret(&proxy_secret_account(&proxy.id), proxy.password.trim()).map_err(|e| format!("Không lưu được mật khẩu proxy an toàn: {e}"))?;
    }
    connection.execute("INSERT INTO proxy_records (id,name,protocol,host,port,username,country_code,status,latency_ms,exit_ip,last_error,last_checked_at,is_enabled,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'untested',0,'','','',?8,?9,?9) ON CONFLICT(id) DO UPDATE SET name=excluded.name,protocol=excluded.protocol,host=excluded.host,port=excluded.port,username=excluded.username,country_code=excluded.country_code,is_enabled=excluded.is_enabled,updated_at=excluded.updated_at",
        params![proxy.id,proxy.name,proxy.protocol,proxy.host,proxy.port,proxy.username,proxy.country_code,proxy.is_enabled as i64,timestamp]).map_err(|e| e.to_string())?;
    get_proxy_records(app_handle)?.into_iter().find(|item| item.id == proxy.id).ok_or_else(|| "Không đọc lại được proxy vừa lưu.".to_string())
}

#[tauri::command]
fn test_proxy_record(app_handle: tauri::AppHandle, proxy_id: String) -> Result<ProxyRecord, String> {
    let connection = open_database(&app_handle)?;
    ensure_schema(&connection)?;
    let proxy = get_proxy_records(app_handle.clone())?.into_iter().find(|item| item.id == proxy_id).ok_or_else(|| "Không tìm thấy proxy.".to_string())?;
    let address = format!("{}://{}:{}", proxy.protocol, proxy.host, proxy.port);
    let mut reqwest_proxy = reqwest::Proxy::all(&address).map_err(|e| e.to_string())?;
    if !proxy.username.is_empty() {
        let password = read_secret(&proxy_secret_account(&proxy.id)).unwrap_or_default();
        reqwest_proxy = reqwest_proxy.basic_auth(&proxy.username, &password);
    }
    let started = std::time::Instant::now();
    let result = reqwest::blocking::Client::builder().proxy(reqwest_proxy).timeout(std::time::Duration::from_secs(12)).build().and_then(|client| client.get("https://api.ipify.org?format=json").send()).and_then(|response| response.error_for_status()).and_then(|response| response.json::<serde_json::Value>());
    let timestamp = now_string();
    let (status, exit_ip, error) = match result { Ok(value) => ("healthy", value["ip"].as_str().unwrap_or("").to_string(), String::new()), Err(error) => ("failed", String::new(), error.to_string()) };
    connection.execute("UPDATE proxy_records SET status=?1,latency_ms=?2,exit_ip=?3,last_error=?4,last_checked_at=?5,updated_at=?5 WHERE id=?6", params![status,started.elapsed().as_millis() as i64,exit_ip,error,timestamp,proxy.id]).map_err(|e| e.to_string())?;
    get_proxy_records(app_handle)?.into_iter().find(|item| item.id == proxy.id).ok_or_else(|| "Không đọc được kết quả proxy.".to_string())
}

fn browser_session_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BrowserSessionRecord> {
    Ok(BrowserSessionRecord { id: row.get(0)?, campaign_id: row.get(1)?, job_id: row.get(2)?, account_id: row.get(3)?, platform_id: row.get(4)?, profile_directory: row.get(5)?, proxy_id: row.get(6)?, process_id: row.get(7)?, status: row.get(8)?, visibility: row.get(9)?, current_url: row.get(10)?, last_message: row.get(11)?, created_at: row.get(12)?, updated_at: row.get(13)? })
}

#[tauri::command]
fn get_browser_sessions(app_handle: tauri::AppHandle) -> Result<Vec<BrowserSessionRecord>, String> {
    let connection = open_database(&app_handle)?; ensure_schema(&connection)?;
    let mut statement = connection.prepare("SELECT id,campaign_id,job_id,account_id,platform_id,profile_directory,proxy_id,process_id,status,visibility,current_url,last_message,created_at,updated_at FROM browser_sessions ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    let rows = statement.query_map([], browser_session_from_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn launch_managed_browser(app_handle: tauri::AppHandle, request: BrowserLaunchRequest) -> Result<BrowserSessionRecord, String> {
    if !(request.url.starts_with("https://") || request.url.starts_with("http://")) { return Err("Managed Browser chỉ mở URL http/https.".to_string()); }
    let executable = browser_executable(&app_handle)?;
    let root = app_handle.path().app_data_dir().map_err(|e| e.to_string())?.join("browser-profiles").join(&request.account_id);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let extension_directory = bundled_extension_directory(&app_handle)?;
    let mut command = Command::new(executable);
    command.arg(format!("--user-data-dir={}", root.display()))
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--remote-debugging-port=0")
        .arg("--disable-features=DisableLoadExtensionCommandLineSwitch")
        .arg(format!("--disable-extensions-except={}", extension_directory.display()))
        .arg(format!("--load-extension={}", extension_directory.display()));
    if !request.visible { command.arg("--start-minimized"); }
    if !request.proxy_id.is_empty() {
        let proxy = get_proxy_records(app_handle.clone())?.into_iter().find(|item| item.id == request.proxy_id).ok_or_else(|| "Proxy được chọn không tồn tại.".to_string())?;
        if proxy.status != "healthy" || !proxy.is_enabled { return Err("Proxy phải được bật và kiểm tra Healthy trước khi chạy browser.".to_string()); }
        command.arg(format!("--proxy-server={}://{}:{}", proxy.protocol, proxy.host, proxy.port));
    }
    let child = command.arg(&request.url).spawn().map_err(|e| format!("Không khởi chạy được Managed Browser: {e}"))?;
    let timestamp = now_string();
    let session = BrowserSessionRecord { id: request.session_id, campaign_id: request.campaign_id, job_id: request.job_id, account_id: request.account_id, platform_id: request.platform_id, profile_directory: root.to_string_lossy().to_string(), proxy_id: request.proxy_id, process_id: child.id() as i64, status: "running".to_string(), visibility: if request.visible { "visible" } else { "hidden" }.to_string(), current_url: request.url, last_message: "Managed Chromium đã khởi chạy với persistent profile và Bridge tích hợp.".to_string(), created_at: timestamp.clone(), updated_at: timestamp };
    let connection = open_database(&app_handle)?; ensure_schema(&connection)?;
    connection.execute("INSERT INTO browser_sessions (id,campaign_id,job_id,account_id,platform_id,profile_directory,proxy_id,process_id,status,visibility,current_url,last_message,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14) ON CONFLICT(id) DO UPDATE SET process_id=excluded.process_id,status=excluded.status,visibility=excluded.visibility,current_url=excluded.current_url,last_message=excluded.last_message,updated_at=excluded.updated_at", params![session.id,session.campaign_id,session.job_id,session.account_id,session.platform_id,session.profile_directory,session.proxy_id,session.process_id,session.status,session.visibility,session.current_url,session.last_message,session.created_at,session.updated_at]).map_err(|e| e.to_string())?;
    Ok(session)
}

#[tauri::command]
fn open_managed_browser_url(app_handle: tauri::AppHandle, session_id: String, url: String) -> Result<BrowserSessionRecord, String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) { return Err("Chỉ cho phép mở URL http/https.".to_string()); }
    let mut session = get_browser_sessions(app_handle.clone())?.into_iter().find(|item| item.id == session_id).ok_or_else(|| "Không tìm thấy browser session.".to_string())?;
    if session.status != "running" { return Err("Browser session không còn chạy.".to_string()); }
    let executable = browser_executable(&app_handle)?;
    Command::new(executable).arg(format!("--user-data-dir={}", session.profile_directory)).arg(&url).spawn().map_err(|e| format!("Không mở được URL trong Managed Browser: {e}"))?;
    let timestamp = now_string();
    session.current_url = url;
    session.last_message = "Đã mở URL trong persistent browser profile.".to_string();
    session.updated_at = timestamp.clone();
    let connection = open_database(&app_handle)?;
    connection.execute("UPDATE browser_sessions SET current_url=?1,last_message=?2,updated_at=?3 WHERE id=?4", params![session.current_url,session.last_message,timestamp,session.id]).map_err(|e| e.to_string())?;
    Ok(session)
}

#[tauri::command]
fn stop_managed_browser(app_handle: tauri::AppHandle, session_id: String) -> Result<BrowserSessionRecord, String> {
    let session = get_browser_sessions(app_handle.clone())?.into_iter().find(|item| item.id == session_id).ok_or_else(|| "Không tìm thấy browser session.".to_string())?;
    #[cfg(target_os = "windows")]
    let _ = Command::new("taskkill").args(["/PID", &session.process_id.to_string(), "/T", "/F"]).output();
    #[cfg(not(target_os = "windows"))]
    let _ = Command::new("kill").arg(session.process_id.to_string()).output();
    let connection = open_database(&app_handle)?; let timestamp = now_string();
    connection.execute("UPDATE browser_sessions SET status='stopped',last_message='Managed Browser đã dừng.',updated_at=?1 WHERE id=?2", params![timestamp,session_id]).map_err(|e| e.to_string())?;
    get_browser_sessions(app_handle)?.into_iter().find(|item| item.id == session.id).ok_or_else(|| "Không đọc được browser session.".to_string())
}

#[tauri::command]
fn set_managed_browser_visibility(app_handle: tauri::AppHandle, session_id: String, visible: bool) -> Result<BrowserSessionRecord, String> {
    let session = get_browser_sessions(app_handle.clone())?.into_iter().find(|item| item.id == session_id).ok_or_else(|| "Không tìm thấy browser session.".to_string())?;
    #[cfg(target_os = "windows")]
    {
        let show_code = if visible { 5 } else { 0 };
        let script = format!("$signature='[DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);'; Add-Type -MemberDefinition $signature -Name Win32ShowWindow -Namespace EntityManager; $p=Get-Process -Id {} -ErrorAction Stop; [EntityManager.Win32ShowWindow]::ShowWindowAsync($p.MainWindowHandle,{}) | Out-Null", session.process_id, show_code);
        let output = Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command", &script]).output().map_err(|e| format!("Không đổi được trạng thái cửa sổ browser: {e}"))?;
        if !output.status.success() { return Err("Chrome chưa tạo cửa sổ có thể ẩn/hiện; hãy thử lại sau vài giây.".to_string()); }
    }
    #[cfg(not(target_os = "windows"))]
    return Err("Ẩn/hiện Managed Browser hiện được tối ưu cho Windows.".to_string());

    #[cfg(target_os = "windows")]
    {
        let connection = open_database(&app_handle)?; let timestamp = now_string();
        let visibility = if visible { "visible" } else { "hidden" };
        connection.execute("UPDATE browser_sessions SET visibility=?1,last_message=?2,updated_at=?3 WHERE id=?4", params![visibility, if visible { "Đã hiển thị browser để thao tác." } else { "Browser đang chạy ẩn." },timestamp,session_id]).map_err(|e| e.to_string())?;
        get_browser_sessions(app_handle)?.into_iter().find(|item| item.id == session.id).ok_or_else(|| "Không đọc được browser session.".to_string())
    }
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
                trust_signals TEXT NOT NULL,
                avatar_image_url TEXT NOT NULL DEFAULT '',
                banner_image_url TEXT NOT NULL DEFAULT ''
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

            CREATE TABLE IF NOT EXISTS provisioning_campaigns (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                total_jobs INTEGER NOT NULL DEFAULT 0,
                current_position INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS provisioning_jobs (
                id TEXT PRIMARY KEY,
                campaign_id TEXT NOT NULL,
                account_id TEXT NOT NULL,
                platform_id TEXT NOT NULL,
                platform_name TEXT NOT NULL,
                position INTEGER NOT NULL,
                stage TEXT NOT NULL DEFAULT 'signup',
                status TEXT NOT NULL DEFAULT 'queued',
                signup_url TEXT NOT NULL DEFAULT '',
                profile_url TEXT NOT NULL DEFAULT '',
                evidence_url TEXT NOT NULL DEFAULT '',
                last_message TEXT NOT NULL DEFAULT '',
                attempt_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_provisioning_jobs_campaign_position
                ON provisioning_jobs(campaign_id, position);

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

            CREATE TABLE IF NOT EXISTS platform_validation (
                platform_id TEXT PRIMARY KEY,
                platform_name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'not_tested',
                dry_run_checked_at TEXT NOT NULL DEFAULT '',
                text_saved_at TEXT NOT NULL DEFAULT '',
                media_uploaded_at TEXT NOT NULL DEFAULT '',
                evidence_saved_at TEXT NOT NULL DEFAULT '',
                certified_at TEXT NOT NULL DEFAULT '',
                last_tested_url TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS indexing_queue (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL UNIQUE,
                source_platform TEXT NOT NULL,
                account_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued',
                attempt_count INTEGER NOT NULL DEFAULT 0,
                last_error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS proxy_records (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                protocol TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL,
                username TEXT NOT NULL DEFAULT '',
                country_code TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'untested',
                latency_ms INTEGER NOT NULL DEFAULT 0,
                exit_ip TEXT NOT NULL DEFAULT '',
                last_error TEXT NOT NULL DEFAULT '',
                last_checked_at TEXT NOT NULL DEFAULT '',
                is_enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS browser_sessions (
                id TEXT PRIMARY KEY,
                campaign_id TEXT NOT NULL,
                job_id TEXT NOT NULL,
                account_id TEXT NOT NULL,
                platform_id TEXT NOT NULL,
                profile_directory TEXT NOT NULL,
                proxy_id TEXT NOT NULL DEFAULT '',
                process_id INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'queued',
                visibility TEXT NOT NULL DEFAULT 'hidden',
                current_url TEXT NOT NULL DEFAULT '',
                last_message TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_browser_sessions_job ON browser_sessions(job_id, updated_at);

            CREATE TABLE IF NOT EXISTS gmail_oauth_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                client_id TEXT NOT NULL DEFAULT '',
                account_email TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'not_configured',
                last_message TEXT NOT NULL DEFAULT '',
                last_checked_at TEXT NOT NULL DEFAULT '',
                current_auth_url TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT ''
            );
            INSERT OR IGNORE INTO gmail_oauth_state (id) VALUES (1);
            ",
        )
        .map_err(|error| error.to_string())?;

    ensure_column(connection, "integration_settings", "key_status", "TEXT NOT NULL DEFAULT 'missing'")?;
    ensure_column(connection, "integration_settings", "last_test_at", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(connection, "entity_profiles", "avatar_image_url", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(connection, "entity_profiles", "banner_image_url", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(connection, "platform_validation", "evidence_saved_at", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(connection, "platform_validation", "certified_at", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(connection, "gmail_oauth_state", "current_auth_url", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(connection, "gmail_oauth_state", "client_secret_protected", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(connection, "gmail_oauth_state", "refresh_token_protected", "TEXT NOT NULL DEFAULT ''")?;

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
        let required_fields = required_fields_for_platform(&platform.id, &platform.name).join("\n");
        let recipe = SelectorRecipeRecord {
            platform_id: platform.id,
            platform_name: platform.name,
            field_selectors_json: serde_json::to_string(&json!({
                "username": field_selectors.username,
                "email": field_selectors.email,
                "displayName": field_selectors.display_name,
                "bio": field_selectors.bio,
                "websiteUrl": field_selectors.website_url,
                "company": field_selectors.company,
                "location": field_selectors.location,
                "socialLinks": field_selectors.social_links,
                "profileImage": field_selectors.profile_image,
                "avatarImageUrl": field_selectors.avatar_image_url,
                "bannerImageUrl": field_selectors.banner_image_url
            }))
            .unwrap_or_else(|_| "{}".to_string()),
            submit_selectors: submit_verify.0.join("\n"),
            verify_selectors: submit_verify.1.join("\n"),
            required_fields,
            requires_captcha_token: platform.requires_captcha,
            updated_at: BUILTIN_SELECTOR_RECIPE_VERSION.to_string(),
        };

        let existing_updated_at = connection
            .query_row(
                "SELECT updated_at FROM selector_recipes WHERE platform_id = ?1",
                params![&recipe.platform_id],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(0);
        let should_upgrade_builtin_recipe = matches!(recipe.platform_id.as_str(), "github" | "medium" | "aboutme" | "tumblr")
            && existing_updated_at > 0
            && existing_updated_at < BUILTIN_SELECTOR_RECIPE_VERSION;

        if should_upgrade_builtin_recipe {
            save_selector_recipe_record(connection, &recipe)?;
        } else {
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
                    topical_niche, expertise_proof, trust_signals, avatar_image_url, banner_image_url
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
                    avatar_image_url: row.get(16)?,
                    banner_image_url: row.get(17)?,
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

fn ensure_default_platform_validation(connection: &Connection) -> Result<(), String> {
    let platforms = get_platform_records(connection)?;
    let timestamp = now_string();
    for platform in platforms
        .into_iter()
        .filter(|platform| matches!(platform.id.as_str(), "github" | "medium" | "aboutme" | "tumblr"))
    {
        let record = PlatformValidationRecord {
            platform_id: platform.id,
            platform_name: platform.name,
            status: "not_tested".to_string(),
            dry_run_checked_at: "".to_string(),
            text_saved_at: "".to_string(),
            media_uploaded_at: "".to_string(),
            evidence_saved_at: "".to_string(),
            certified_at: "".to_string(),
            last_tested_url: "".to_string(),
            notes: "".to_string(),
            updated_at: timestamp.clone(),
        };
        connection
            .execute(
                "INSERT OR IGNORE INTO platform_validation (
                    platform_id, platform_name, status, dry_run_checked_at, text_saved_at,
                    media_uploaded_at, evidence_saved_at, certified_at, last_tested_url, notes, updated_at
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    record.platform_id,
                    record.platform_name,
                    record.status,
                    record.dry_run_checked_at,
                    record.text_saved_at,
                    record.media_uploaded_at,
                    record.evidence_saved_at,
                    record.certified_at,
                    record.last_tested_url,
                    record.notes,
                    record.updated_at
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn get_platform_validation_record(connection: &Connection, platform_id: &str) -> Result<PlatformValidationRecord, String> {
    connection
        .query_row(
            "SELECT platform_id, platform_name, status, dry_run_checked_at, text_saved_at,
                    media_uploaded_at, evidence_saved_at, certified_at, last_tested_url, notes, updated_at
             FROM platform_validation
             WHERE platform_id = ?1",
            params![platform_id],
            |row| {
                Ok(PlatformValidationRecord {
                    platform_id: row.get(0)?,
                    platform_name: row.get(1)?,
                    status: row.get(2)?,
                    dry_run_checked_at: row.get(3)?,
                    text_saved_at: row.get(4)?,
                    media_uploaded_at: row.get(5)?,
                    evidence_saved_at: row.get(6)?,
                    certified_at: row.get(7)?,
                    last_tested_url: row.get(8)?,
                    notes: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

fn normalize_platform_validation_status(status: &str) -> String {
    match status {
        "dry_run_ok" | "text_saved" | "media_uploaded" | "needs_recipe_fix" => status.to_string(),
        _ => "not_tested".to_string(),
    }
}

fn platform_validation_note(report: &PlatformValidationSyncReport) -> String {
    let missing = if report.missing_checks.is_empty() {
        "none".to_string()
    } else {
        report.missing_checks.join(", ")
    };
    format!("Auto-sync {}: {} Missing: {}", report.step, report.message, missing)
}

fn save_platform_validation_record_to_db(connection: &Connection, record: &PlatformValidationRecord) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO platform_validation (
                platform_id, platform_name, status, dry_run_checked_at, text_saved_at,
                media_uploaded_at, evidence_saved_at, certified_at, last_tested_url, notes, updated_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(platform_id)
             DO UPDATE SET platform_name = excluded.platform_name,
                           status = excluded.status,
                           dry_run_checked_at = excluded.dry_run_checked_at,
                           text_saved_at = excluded.text_saved_at,
                           media_uploaded_at = excluded.media_uploaded_at,
                           evidence_saved_at = excluded.evidence_saved_at,
                           certified_at = excluded.certified_at,
                           last_tested_url = excluded.last_tested_url,
                           notes = excluded.notes,
                           updated_at = excluded.updated_at",
            params![
                record.platform_id,
                record.platform_name,
                record.status,
                record.dry_run_checked_at,
                record.text_saved_at,
                record.media_uploaded_at,
                record.evidence_saved_at,
                record.certified_at,
                record.last_tested_url,
                record.notes,
                record.updated_at
            ],
        )
        .map_err(|error| error.to_string())?;
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

fn required_fields_for_platform(platform_id: &str, platform_name: &str) -> Vec<String> {
    let key = platform_id.to_lowercase();
    let name = platform_name.to_lowercase();

    let fields = if key == "github" || name.contains("github") {
        vec!["displayName", "bio", "websiteUrl", "company", "location", "socialLinks"]
    } else if key == "medium" || name.contains("medium") {
        vec!["displayName", "bio", "websiteUrl", "avatarImageUrl"]
    } else if key == "aboutme" || name.contains("about.me") || name.contains("about me") {
        vec!["displayName", "bio", "websiteUrl", "socialLinks", "avatarImageUrl"]
    } else if key == "tumblr" || name.contains("tumblr") {
        vec!["username", "displayName", "bio", "websiteUrl", "avatarImageUrl", "bannerImageUrl"]
    } else {
        vec!["username", "email", "displayName", "bio", "websiteUrl"]
    };

    fields.into_iter().map(str::to_string).collect()
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
        company: vec![
            "input[name='company']".to_string(),
            "input[id*='company' i]".to_string(),
            "input[name*='organization' i]".to_string(),
            "input[id*='organization' i]".to_string(),
        ],
        location: vec![
            "input[name='location']".to_string(),
            "input[id*='location' i]".to_string(),
            "input[name*='address' i]".to_string(),
            "input[id*='address' i]".to_string(),
        ],
        social_links: vec![
            "input[name*='social' i]".to_string(),
            "input[id*='social' i]".to_string(),
            "input[placeholder*='social' i]".to_string(),
            "input[placeholder*='profile' i]".to_string(),
        ],
        profile_image: vec![
            "input[type='file'][accept*='image' i]".to_string(),
            "input[type='file'][name*='avatar' i]".to_string(),
            "input[type='file'][name*='photo' i]".to_string(),
            "input[type='file'][name*='image' i]".to_string(),
        ],
        avatar_image_url: vec![
            "input[type='file'][accept*='image' i]".to_string(),
            "input[type='file'][name*='avatar' i]".to_string(),
            "input[type='file'][name*='photo' i]".to_string(),
            "input[type='file'][name*='image' i]".to_string(),
        ],
        banner_image_url: vec![
            "input[type='file'][name*='banner' i]".to_string(),
            "input[type='file'][name*='cover' i]".to_string(),
            "input[type='file'][name*='header' i]".to_string(),
            "input[type='file'][accept*='image' i]".to_string(),
        ],
    };
    let key = platform_id.to_lowercase();
    let name = platform_name.to_lowercase();

    if key == "github" || name.contains("github") {
        selectors.username.insert(0, "input[name='user[login]']".to_string());
        selectors.email.insert(0, "input[name='user[email]']".to_string());
        // GitHub profile settings use these names, rather than generic name/bio/website selectors.
        selectors.display_name.insert(0, "input[name='user[profile_name]']".to_string());
        selectors.bio.insert(0, "textarea[name='user[profile_bio]']".to_string());
        selectors.website_url.insert(0, "input[name='user[profile_blog]']".to_string());
        selectors.company.insert(0, "input[name='user[profile_company]']".to_string());
        selectors.location.insert(0, "input[name='user[profile_location]']".to_string());
        selectors.social_links.insert(0, "input[name='user[profile_social_accounts][]']".to_string());
        selectors.social_links.insert(1, "input[placeholder^='Link to social profile' i]".to_string());
        selectors.profile_image.insert(0, "input[type='file'][name='user[profile_picture]']".to_string());
        selectors.avatar_image_url.insert(0, "input[type='file'][name='user[profile_picture]']".to_string());
    }

    if key == "medium" || name.contains("medium") {
        selectors.email.insert(0, "input[name='email']".to_string());
        selectors.username.insert(0, "input[name='username']".to_string());
        selectors.username.insert(1, "input[aria-label*='username' i]".to_string());
        selectors.display_name.insert(0, "input[name='name']".to_string());
        selectors.display_name.insert(1, "input[aria-label*='name' i]".to_string());
        selectors.display_name.insert(2, "input[placeholder*='name' i]".to_string());
        selectors.display_name.insert(3, "input[data-testid*='name' i]".to_string());
        selectors.bio.insert(0, "textarea[aria-label*='bio' i]".to_string());
        selectors.bio.insert(1, "textarea[placeholder*='bio' i]".to_string());
        selectors.bio.insert(2, "textarea[name*='bio' i]".to_string());
        selectors.website_url.insert(0, "input[name*='url' i]".to_string());
        selectors.website_url.insert(1, "input[aria-label*='website' i]".to_string());
        selectors.website_url.insert(2, "input[placeholder*='website' i]".to_string());
        selectors.website_url.insert(3, "input[aria-label*='url' i]".to_string());
        selectors.website_url.insert(4, "input[placeholder*='url' i]".to_string());
        selectors.social_links.insert(0, "input[aria-label*='twitter' i]".to_string());
        selectors.social_links.insert(1, "input[aria-label*='x.com' i]".to_string());
        selectors.avatar_image_url.insert(0, "input[type='file'][accept*='image' i]".to_string());
        selectors.avatar_image_url.insert(1, "input[type='file'][name*='image' i]".to_string());
        selectors.profile_image.insert(0, "input[type='file'][accept*='image' i]".to_string());
    }

    if key == "tumblr" || name.contains("tumblr") {
        selectors.email.insert(0, "input[name='email']".to_string());
        selectors.username.insert(0, "input[name='tumblelog[name]']".to_string());
        selectors.username.insert(1, "input[name='blogName']".to_string());
        selectors.username.insert(2, "input[aria-label*='username' i]".to_string());
        selectors.display_name.insert(0, "input[name='title']".to_string());
        selectors.display_name.insert(1, "input[name*='title' i]".to_string());
        selectors.display_name.insert(2, "input[aria-label*='title' i]".to_string());
        selectors.display_name.insert(3, "input[placeholder*='title' i]".to_string());
        selectors.bio.insert(0, "textarea[name='description']".to_string());
        selectors.bio.insert(1, "textarea[name*='description' i]".to_string());
        selectors.bio.insert(2, "textarea[aria-label*='description' i]".to_string());
        selectors.bio.insert(3, "textarea[placeholder*='description' i]".to_string());
        selectors.website_url.insert(0, "input[name='url']".to_string());
        selectors.website_url.insert(1, "input[name*='url' i]".to_string());
        selectors.website_url.insert(2, "input[aria-label*='website' i]".to_string());
        selectors.social_links.insert(0, "input[name*='link' i]".to_string());
        selectors.avatar_image_url.insert(0, "input[type='file'][accept*='image' i]".to_string());
        selectors.avatar_image_url.insert(1, "input[type='file'][name*='avatar' i]".to_string());
        selectors.banner_image_url.insert(0, "input[type='file'][name*='header' i]".to_string());
        selectors.banner_image_url.insert(1, "input[type='file'][name*='banner' i]".to_string());
        selectors.banner_image_url.insert(2, "input[type='file'][name*='cover' i]".to_string());
        selectors.banner_image_url.insert(3, "input[type='file'][accept*='image' i]".to_string());
    }

    if key == "aboutme" || name.contains("about.me") || name.contains("about me") {
        selectors.username.insert(0, "input[name*='slug' i]".to_string());
        selectors.username.insert(1, "input[name*='username' i]".to_string());
        selectors.email.insert(0, "input[type='email']".to_string());
        selectors.display_name.insert(0, "input[name='name']".to_string());
        selectors.display_name.insert(1, "input[name*='display' i]".to_string());
        selectors.display_name.insert(2, "input[name*='name' i]".to_string());
        selectors.display_name.insert(3, "input[aria-label*='name' i]".to_string());
        selectors.bio.insert(0, "textarea[name='bio']".to_string());
        selectors.bio.insert(1, "textarea[name*='bio' i]".to_string());
        selectors.bio.insert(2, "textarea[aria-label*='bio' i]".to_string());
        selectors.bio.insert(3, "textarea[placeholder*='about' i]".to_string());
        selectors.website_url.insert(0, "input[name='website']".to_string());
        selectors.website_url.insert(1, "input[name*='website' i]".to_string());
        selectors.website_url.insert(2, "input[aria-label*='website' i]".to_string());
        selectors.website_url.insert(3, "input[placeholder*='website' i]".to_string());
        selectors.social_links.insert(0, "input[name*='link' i]".to_string());
        selectors.social_links.insert(1, "input[aria-label*='link' i]".to_string());
        selectors.social_links.insert(2, "input[placeholder*='link' i]".to_string());
        selectors.avatar_image_url.insert(0, "input[type='file'][accept*='image' i]".to_string());
        selectors.avatar_image_url.insert(1, "input[type='file'][name*='avatar' i]".to_string());
        selectors.avatar_image_url.insert(2, "input[type='file'][name*='photo' i]".to_string());
        selectors.profile_image.insert(0, "input[type='file'][accept*='image' i]".to_string());
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
                "button[data-testid*='save' i]".to_string(),
                "button[aria-label*='save' i]".to_string(),
                "button[data-action='save']".to_string(),
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
                "button[aria-label*='save' i]".to_string(),
                "button[data-testid*='save' i]".to_string(),
                "button[data-test-id*='save' i]".to_string(),
                "button[aria-label*='sign up' i]".to_string(),
                "button[data-testid*='signup' i]".to_string(),
                "button[type='submit']".to_string(),
            ],
            generic_verify,
        );
    }

    if key == "aboutme" || name.contains("about.me") || name.contains("about me") {
        return (
            vec![
                "button[aria-label*='save' i]".to_string(),
                "button[data-testid*='save' i]".to_string(),
                "button[data-test*='save' i]".to_string(),
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

fn execution_steps_for_platform(platform_id: &str) -> Vec<String> {
    let key = platform_id.to_lowercase();
    if key == "github" || key == "medium" || key == "aboutme" || key == "tumblr" {
        return vec![
            "dry_run".to_string(),
            "fill_text".to_string(),
            "upload_media".to_string(),
            "submit_verify".to_string(),
        ];
    }

    vec![
        "dry_run".to_string(),
        "fill_text".to_string(),
        "submit_verify".to_string(),
    ]
}

fn save_text_selector_for_platform(platform_id: &str, platform_name: &str) -> String {
    let key = platform_id.to_lowercase();
    let name = platform_name.to_lowercase();

    if key == "github" || name.contains("github") {
        return "button[type='submit']".to_string();
    }

    if key == "medium" || name.contains("medium") {
        return "button[data-testid*='save' i], button[aria-label*='save' i], button[data-action='save'], button[type='submit']".to_string();
    }

    if key == "aboutme" || name.contains("about.me") || name.contains("about me") {
        return "button[aria-label*='save' i], button[data-testid*='save' i], button[data-test*='save' i], button[type='submit']".to_string();
    }

    if key == "tumblr" || name.contains("tumblr") {
        return "button[aria-label*='save' i], button[data-testid*='save' i], button[data-test-id*='save' i], button[type='submit']".to_string();
    }

    String::new()
}

fn media_confirm_selector_for_platform(platform_id: &str, platform_name: &str) -> String {
    let key = platform_id.to_lowercase();
    let name = platform_name.to_lowercase();

    if key == "github" || name.contains("github") {
        return String::new();
    }

    if key == "medium" || name.contains("medium") || key == "aboutme" || name.contains("about.me") || key == "tumblr" || name.contains("tumblr") {
        return "button[aria-label*='save' i], button[aria-label*='apply' i], button[aria-label*='done' i], button[data-testid*='save' i], button[data-test-id*='save' i], button[type='submit']".to_string();
    }

    String::new()
}

fn handle_extension_bridge_stream(mut stream: TcpStream, app_handle: tauri::AppHandle) {
    let mut buffer = vec![0; 32 * 1024];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(value) => value,
        Err(_) => return,
    };
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let request_target = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("");
    let request_path = request_target.split_once('?').map_or(request_target, |(path, _)| path);

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

    if request.starts_with("GET ") && request_path == "/account/submit-verify/preview" {
        let requested_platform_id = request_target.split_once('?')
            .and_then(|(_, query)| query.split('&').find_map(|part| {
                let (key, value) = part.split_once('=')?;
                (key == "platformId").then_some(value)
            }));
        let response = match get_dry_run_preview_payload_record(&app_handle, requested_platform_id) {
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
        let response = match get_next_submit_verify_payload_record(&app_handle, None) {
            Ok(payload) => serde_json::to_string(&payload).unwrap_or_else(|_| "{\"ok\":true}".to_string()),
            Err(error) => {
                let _ = write_http_response(&mut stream, 404, &json!({ "error": error }).to_string());
                return;
            }
        };

        let _ = write_http_response(&mut stream, 200, &response);
        return;
    }

    if request.starts_with("GET ") && request_path == "/account/submit-verify/platform" {
        let requested_platform_id = request_target.split_once('?')
            .and_then(|(_, query)| query.split('&').find_map(|part| {
                let (key, value) = part.split_once('=')?;
                (key == "platformId").then_some(value)
            }));
        let Some(platform_id) = requested_platform_id else {
            let _ = write_http_response(&mut stream, 400, "{\"error\":\"platformId is required\"}");
            return;
        };
        let response = match get_next_submit_verify_payload_record(&app_handle, Some(platform_id)) {
            Ok(payload) => serde_json::to_string(&payload).unwrap_or_else(|_| "{\"ok\":true}".to_string()),
            Err(error) => {
                let _ = write_http_response(&mut stream, 404, &json!({ "error": error }).to_string());
                return;
            }
        };
        let _ = write_http_response(&mut stream, 200, &response);
        return;
    }

    if request.starts_with("GET ") && request_path == "/provisioning/job/platform" {
        let requested_platform_id = request_target.split_once('?')
            .and_then(|(_, query)| query.split('&').find_map(|part| {
                let (key, value) = part.split_once('=')?;
                (key == "platformId").then_some(value)
            }));
        let Some(platform_id) = requested_platform_id else {
            let _ = write_http_response(&mut stream, 400, "{\"error\":\"platformId is required\"}");
            return;
        };
        let response = match open_database(&app_handle).and_then(|connection| {
            ensure_schema(&connection)?;
            get_active_provisioning_job_record(&connection, platform_id)
        }) {
            Ok(job) => serde_json::to_string(&job).unwrap_or_else(|_| "{\"ok\":true}".to_string()),
            Err(error) => {
                let _ = write_http_response(&mut stream, 404, &json!({ "error": error }).to_string());
                return;
            }
        };
        let _ = write_http_response(&mut stream, 200, &response);
        return;
    }

    if request.starts_with("POST /provisioning/job/checkpoint ") {
        let Some(body) = request.split("\r\n\r\n").nth(1) else {
            let _ = write_http_response(&mut stream, 400, "{\"error\":\"missing body\"}");
            return;
        };
        let response = match serde_json::from_str::<ProvisioningCheckpointRequest>(body) {
            Ok(payload) => match update_provisioning_checkpoint_record(&app_handle, payload) {
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

    if request.starts_with("POST /platform-validation/sync ") {
        let Some(body) = request.split("\r\n\r\n").nth(1) else {
            let _ = write_http_response(&mut stream, 400, "{\"error\":\"missing body\"}");
            return;
        };
        let response = match serde_json::from_str::<PlatformValidationSyncReport>(body) {
            Ok(report) => match sync_platform_validation_record(&app_handle, report) {
                Ok(record) => serde_json::to_string(&record).unwrap_or_else(|_| "{\"ok\":true}".to_string()),
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

fn secret_service(setting_type: &str) -> String {
    let safe_name: String = setting_type.chars().map(|character| {
        if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') { character } else { '-' }
    }).collect();
    format!("{SECRET_SERVICE}/{safe_name}")
}

fn secure_secret_entry(setting_type: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(&secret_service(setting_type), "EntityManager")
        .map_err(|error| format!("Failed to open isolated OS credential: {error}"))
}

fn save_secret(setting_type: &str, value: &str) -> Result<(), String> {
    let entry = secure_secret_entry(setting_type)?;
    entry
        .set_password(value.trim())
        .map_err(|error| format!("Failed to save encrypted API key: {error}"))?;
    let verified = entry.get_password().map_err(|error| format!("Credential was written but cannot be read back: {error}"))?;
    if verified == value.trim() { Ok(()) } else { Err("Credential verification failed after saving.".to_string()) }
}

fn read_secret(setting_type: &str) -> Result<String, String> {
    if let Ok(value) = secure_secret_entry(setting_type).and_then(|entry| entry.get_password().map_err(|error| error.to_string())) {
        if !value.trim().is_empty() { return Ok(value); }
    }
    let legacy = keyring::Entry::new(SECRET_SERVICE, &secret_account(setting_type))
        .map_err(|error| format!("Failed to open legacy OS credential: {error}"))?;
    legacy.get_password().map_err(|error| format!("Failed to read isolated or legacy credential: {error}"))
}

fn has_secret(setting_type: &str) -> bool {
    read_secret(setting_type)
        .map(|secret| !secret.trim().is_empty())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn run_windows_dpapi(script: &str, input: &str) -> Result<String, String> {
    let mut child = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Không khởi động được Windows DPAPI: {error}"))?;
    child.stdin.as_mut().ok_or_else(|| "Không mở được DPAPI input.".to_string())?
        .write_all(input.as_bytes()).map_err(|error| error.to_string())?;
    let output = child.wait_with_output().map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(format!("Windows DPAPI thất bại: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(target_os = "windows")]
fn protect_for_current_windows_user(value: &str) -> Result<String, String> {
    run_windows_dpapi(
        "$plain=[Console]::In.ReadToEnd(); Add-Type -AssemblyName System.Security; $bytes=[Text.Encoding]::UTF8.GetBytes($plain); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))",
        value,
    )
}

#[cfg(not(target_os = "windows"))]
fn protect_for_current_windows_user(value: &str) -> Result<String, String> {
    Ok(general_purpose::STANDARD.encode(value.as_bytes()))
}

#[cfg(target_os = "windows")]
fn unprotect_for_current_windows_user(value: &str) -> Result<String, String> {
    run_windows_dpapi(
        "$cipher=[Console]::In.ReadToEnd(); Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String($cipher.Trim()); [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))",
        value,
    )
}

#[cfg(not(target_os = "windows"))]
fn unprotect_for_current_windows_user(value: &str) -> Result<String, String> {
    let bytes = general_purpose::STANDARD.decode(value).map_err(|error| error.to_string())?;
    String::from_utf8(bytes).map_err(|error| error.to_string())
}

fn read_gmail_client_secret(app_handle: &tauri::AppHandle) -> Result<String, String> {
    if let Ok(secret) = read_secret(GMAIL_CLIENT_SECRET_KEY) {
        if !secret.trim().is_empty() { return Ok(secret); }
    }
    let connection = open_database(app_handle)?;
    ensure_schema(&connection)?;
    let protected: String = connection.query_row("SELECT client_secret_protected FROM gmail_oauth_state WHERE id=1", [], |row| row.get(0)).map_err(|error| error.to_string())?;
    if protected.trim().is_empty() { return Err("Chưa có Gmail Client Secret đã mã hóa.".to_string()); }
    unprotect_for_current_windows_user(&protected)
}

fn read_gmail_refresh_token(app_handle: &tauri::AppHandle) -> Result<String, String> {
    if let Ok(secret) = read_secret(GMAIL_REFRESH_TOKEN_KEY) {
        if !secret.trim().is_empty() { return Ok(secret); }
    }
    let connection = open_database(app_handle)?;
    ensure_schema(&connection)?;
    let protected: String = connection.query_row("SELECT refresh_token_protected FROM gmail_oauth_state WHERE id=1", [], |row| row.get(0)).map_err(|error| error.to_string())?;
    if protected.trim().is_empty() { return Err("Chưa có Gmail refresh token đã mã hóa.".to_string()); }
    unprotect_for_current_windows_user(&protected)
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
                topical_niche, expertise_proof, trust_signals, avatar_image_url, banner_image_url
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
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
                           trust_signals = excluded.trust_signals,
                           avatar_image_url = excluded.avatar_image_url,
                           banner_image_url = excluded.banner_image_url",
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
                profile.trust_signals,
                profile.avatar_image_url,
                profile.banner_image_url
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
        avatar_image_url: String::new(),
        banner_image_url: String::new(),
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
        .setup(|app| {
            start_gmail_verification_worker(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_health,
            get_indexing_queue_count,
            open_external_url,
            open_extension_download,
            open_latest_release_download,
            open_release_asset_download,
            start_extension_bridge_server,
            local_config_path,
            get_money_site,
            save_money_site,
            get_integration_settings,
            save_integration_setting,
            test_integration_setting,
            test_live_integration_setting,
            get_gmail_oauth_status,
            save_gmail_oauth_config,
            start_gmail_oauth,
            test_gmail_connection,
            poll_medium_verification_now,
            run_system_diagnostics,
            get_platforms,
            save_platform,
            get_selector_recipes,
            save_selector_recipe,
            get_dry_run_history,
            get_all_dry_run_history,
            save_json_export,
            get_dry_run_history_audit,
            save_dry_run_history,
            get_platform_validation_records,
            save_platform_validation_record,
            certify_platform,
            get_evidence_records,
            save_evidence_record,
            get_entity_profile,
            save_entity_profile,
            get_accounts,
            save_account,
            get_provisioning_campaigns,
            save_provisioning_campaign,
            get_provisioning_jobs,
            save_provisioning_job,
            get_workflow_runs,
            save_workflow_run,
            get_automation_queue,
            save_automation_queue_item,
            execute_captcha_queue_item,
            poll_captcha_queue_item,
            get_captcha_injection_payload,
            complete_captcha_injection,
            complete_account_submit_verify,
            get_proxy_records,
            save_proxy_record,
            test_proxy_record,
            get_browser_sessions,
            launch_managed_browser,
            open_managed_browser_url,
            stop_managed_browser,
            set_managed_browser_visibility
        ])
        .run(tauri::generate_context!())
        .expect("error while running EntityManager");
}
