use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

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
            local_config_path,
            get_money_site,
            save_money_site,
            get_integration_settings,
            save_integration_setting,
            get_platforms,
            save_platform,
            get_entity_profile,
            save_entity_profile
        ])
        .run(tauri::generate_context!())
        .expect("error while running EntityManager");
}
