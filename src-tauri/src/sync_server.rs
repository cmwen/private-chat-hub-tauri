// LAN sync server – serves chat history to the Android app over HTTP.
// Canonical JSON format uses camelCase field names (same as the TypeScript
// frontend). Android adapts field names (text ↔ content, colorValue ↔ color).

use axum::{
    Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::{Mutex, OnceLock};
use tauri::Emitter;
use tokio::task::JoinHandle;

// ─── Shared state stored at module level ─────────────────────────────────────

#[derive(Default)]
pub struct SyncData {
    pub conversations: Vec<Value>,
    pub projects: Vec<Value>,
}

static SYNC_DATA: OnceLock<std::sync::Arc<Mutex<SyncData>>> = OnceLock::new();
static SERVER_HANDLE: OnceLock<Mutex<Option<JoinHandle<()>>>> = OnceLock::new();
static SYNC_PIN: OnceLock<Mutex<Option<String>>> = OnceLock::new();

pub fn shared_data() -> std::sync::Arc<Mutex<SyncData>> {
    SYNC_DATA
        .get_or_init(|| std::sync::Arc::new(Mutex::new(SyncData::default())))
        .clone()
}

fn server_handle() -> &'static Mutex<Option<JoinHandle<()>>> {
    SERVER_HANDLE.get_or_init(|| Mutex::new(None))
}

fn sync_pin() -> &'static Mutex<Option<String>> {
    SYNC_PIN.get_or_init(|| Mutex::new(None))
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

pub fn is_running() -> bool {
    server_handle()
        .lock()
        .unwrap()
        .as_ref()
        .map(|h| !h.is_finished())
        .unwrap_or(false)
}

pub async fn start(
    port: u16,
    pin: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // Stop any existing server before starting a new one.
    stop();

    *sync_pin().lock().unwrap() = pin;

    let state = AxumState {
        data: shared_data(),
        app_handle,
    };

    let router = Router::new()
        .route("/api/sync/status", get(handle_status))
        .route("/api/sync/manifest", get(handle_manifest))
        .route("/api/sync/pull", post(handle_pull))
        .route("/api/sync/push", post(handle_push))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .map_err(|e| format!("Cannot bind port {port}: {e}"))?;

    let handle = tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });

    *server_handle().lock().unwrap() = Some(handle);
    Ok(())
}

pub fn stop() {
    if let Some(h) = server_handle().lock().unwrap().take() {
        h.abort();
    }
}

// ─── Axum state ───────────────────────────────────────────────────────────────

#[derive(Clone)]
struct AxumState {
    data: std::sync::Arc<Mutex<SyncData>>,
    app_handle: tauri::AppHandle,
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

fn auth_ok(headers: &HeaderMap) -> bool {
    let pin_guard = sync_pin().lock().unwrap();
    match pin_guard.as_ref() {
        None => true,
        Some(required) => headers
            .get("x-sync-pin")
            .and_then(|v| v.to_str().ok())
            .map(|v| v == required)
            .unwrap_or(false),
    }
}

fn get_str(v: &Value, field: &str) -> String {
    v.get(field)
        .and_then(|f| f.as_str())
        .unwrap_or_default()
        .to_string()
}

// ─── Request / Response types ─────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusResponse {
    version: u32,
    server_name: String,
    conversation_count: usize,
    project_count: usize,
    has_pin: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestItem {
    id: String,
    updated_at: String,
    message_count: usize,
    #[serde(rename = "type")]
    item_type: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct KnownItem {
    id: String,
    updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequest {
    known_items: Vec<KnownItem>,
}

#[derive(Serialize)]
struct PullResponse {
    conversations: Vec<Value>,
    projects: Vec<Value>,
}

#[derive(Deserialize, Serialize, Clone)]
struct PushRequest {
    conversations: Vec<Value>,
    projects: Vec<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PushResponse {
    merged_conversations: usize,
    merged_projects: usize,
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async fn handle_status(State(s): State<AxumState>) -> Json<StatusResponse> {
    let data = s.data.lock().unwrap();
    Json(StatusResponse {
        version: 1,
        server_name: "Private Chat Hub Desktop".to_string(),
        conversation_count: data.conversations.len(),
        project_count: data.projects.len(),
        has_pin: sync_pin().lock().unwrap().is_some(),
    })
}

async fn handle_manifest(
    State(s): State<AxumState>,
    headers: HeaderMap,
) -> Result<Json<Vec<ManifestItem>>, StatusCode> {
    if !auth_ok(&headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let data = s.data.lock().unwrap();

    let mut items: Vec<ManifestItem> = data
        .conversations
        .iter()
        .map(|c| ManifestItem {
            id: get_str(c, "id"),
            updated_at: get_str(c, "updatedAt"),
            message_count: c
                .get("messages")
                .and_then(|m| m.as_array())
                .map(|a| a.len())
                .unwrap_or(0),
            item_type: "conversation".to_string(),
        })
        .collect();

    for p in &data.projects {
        items.push(ManifestItem {
            id: get_str(p, "id"),
            updated_at: get_str(p, "updatedAt"),
            message_count: 0,
            item_type: "project".to_string(),
        });
    }

    Ok(Json(items))
}

async fn handle_pull(
    State(s): State<AxumState>,
    headers: HeaderMap,
    Json(req): Json<PullRequest>,
) -> Result<Json<PullResponse>, StatusCode> {
    if !auth_ok(&headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let data = s.data.lock().unwrap();

    let known: std::collections::HashMap<String, String> = req
        .known_items
        .into_iter()
        .map(|item| (item.id, item.updated_at))
        .collect();

    let conversations: Vec<Value> = data
        .conversations
        .iter()
        .filter(|c| {
            let id = get_str(c, "id");
            let updated_at = get_str(c, "updatedAt");
            known.get(&id).map(|k| updated_at > *k).unwrap_or(true)
        })
        .cloned()
        .collect();

    let projects: Vec<Value> = data
        .projects
        .iter()
        .filter(|p| {
            let id = get_str(p, "id");
            let updated_at = get_str(p, "updatedAt");
            known.get(&id).map(|k| updated_at > *k).unwrap_or(true)
        })
        .cloned()
        .collect();

    Ok(Json(PullResponse {
        conversations,
        projects,
    }))
}

async fn handle_push(
    State(s): State<AxumState>,
    headers: HeaderMap,
    Json(req): Json<PushRequest>,
) -> Result<Json<PushResponse>, StatusCode> {
    if !auth_ok(&headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let merged_conversations = req.conversations.len();
    let merged_projects = req.projects.len();

    // Emit to the frontend which handles the actual merge into its Zustand store.
    let _ = s.app_handle.emit("sync_push_received", &req);

    Ok(Json(PushResponse {
        merged_conversations,
        merged_projects,
    }))
}
