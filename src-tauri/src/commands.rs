use crate::models::*;
use crate::lm_studio::LmStudioClient;
use crate::ollama::{OllamaClient, messages_to_ollama};
use crate::opencode::{OpencodeClient, OpencodeModelRef};
use std::sync::Mutex;
use tauri::State;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BackendKind {
    Ollama,
    Opencode,
    LmStudio,
}

impl BackendKind {
    fn parse(value: Option<&str>) -> Option<Self> {
        match value
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(|v| v.to_lowercase())
            .as_deref()
        {
            Some("opencode") => Some(Self::Opencode),
            Some("ollama") => Some(Self::Ollama),
            Some("lmstudio") | Some("lm-studio") | Some("lm_studio") => Some(Self::LmStudio),
            _ => None,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Ollama => "Ollama",
            Self::Opencode => "OpenCode",
            Self::LmStudio => "LM Studio",
        }
    }

}

pub struct AppState {
    pub ollama_client: Mutex<OllamaClient>,
    pub opencode_client: Mutex<OpencodeClient>,
    pub lm_studio_client: Mutex<LmStudioClient>,
    pub connected: Mutex<bool>,
    active_backend: Mutex<BackendKind>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            ollama_client: Mutex::new(OllamaClient::new("http://localhost:11434")),
            opencode_client: Mutex::new(OpencodeClient::new("http://localhost:4096")),
            lm_studio_client: Mutex::new(LmStudioClient::new("http://localhost:1234")),
            connected: Mutex::new(false),
            active_backend: Mutex::new(BackendKind::Ollama),
        }
    }
}

fn get_ollama_client(state: &State<'_, AppState>) -> Result<OllamaClient, String> {
    let client = state.ollama_client.lock().map_err(|e| e.to_string())?.clone();
    Ok(client)
}

fn get_opencode_client(state: &State<'_, AppState>) -> Result<OpencodeClient, String> {
    let client = state.opencode_client.lock().map_err(|e| e.to_string())?.clone();
    Ok(client)
}

fn get_lm_studio_client(state: &State<'_, AppState>) -> Result<LmStudioClient, String> {
    let client = state.lm_studio_client.lock().map_err(|e| e.to_string())?.clone();
    Ok(client)
}

fn get_active_backend(state: &State<'_, AppState>) -> Result<BackendKind, String> {
    let backend = *state.active_backend.lock().map_err(|e| e.to_string())?;
    Ok(backend)
}

fn parse_model_selector(model: &str) -> Option<OpencodeModelRef> {
    let (provider_id, model_id) = model.split_once('/')?;
    if provider_id.trim().is_empty() || model_id.trim().is_empty() {
        return None;
    }

    Some(OpencodeModelRef {
        provider_id: provider_id.to_string(),
        model_id: model_id.to_string(),
    })
}

fn strip_lm_studio_prefix(model: &str) -> &str {
    model.strip_prefix("lmstudio:").unwrap_or(model)
}

fn latest_user_text(messages: &[Message]) -> Option<String> {
    messages
        .iter()
        .rev()
        .find(|message| message.role == MessageRole::User)
        .map(|message| message.content.trim().to_string())
        .filter(|message| !message.is_empty())
}

fn latest_user_attachments(messages: &[Message]) -> Vec<Attachment> {
    messages
        .iter()
        .rev()
        .find(|message| message.role == MessageRole::User)
        .map(|message| message.attachments.clone())
        .unwrap_or_default()
}

fn build_lm_studio_prompt(messages: &[Message]) -> String {
    let mut lines = Vec::new();

    for message in messages {
        let content = message.content.trim();
        if content.is_empty() {
            continue;
        }

        let role = match message.role {
            MessageRole::User => "User",
            MessageRole::Assistant => "Assistant",
            MessageRole::System => "System",
            MessageRole::Tool => "Tool",
        };

        lines.push(format!("{role}: {content}"));
    }

    lines.join("\n")
}

fn simple_title(first_message: &str) -> String {
    let title = first_message
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .chars()
        .take(60)
        .collect::<String>();

    if title.is_empty() {
        "New Conversation".to_string()
    } else {
        title
    }
}

/// Test connection to backend server
#[tauri::command]
pub async fn test_connection(
    state: State<'_, AppState>,
    host: String,
    port: u16,
    use_https: bool,
    backend: Option<String>,
    backend_type: Option<String>,
    username: Option<String>,
    password: Option<String>,
    api_token: Option<String>,
) -> Result<bool, String> {
    let backend_kind = BackendKind::parse(backend.as_deref().or(backend_type.as_deref()))
        .unwrap_or(get_active_backend(&state)?);
    let scheme = if use_https { "https" } else { "http" };
    let base_url = format!("{}://{}:{}", scheme, host, port);

    let result = match backend_kind {
        BackendKind::Ollama => {
            let client = OllamaClient::new(&base_url);
            let result = client.health_check().await?;
            if result {
                let mut ollama = state.ollama_client.lock().map_err(|e| e.to_string())?;
                ollama.update_base_url(&base_url);
            }
            result
        }
        BackendKind::Opencode => {
            let mut client = OpencodeClient::new(&base_url);
            client.update_connection(&base_url, username, password);
            let result = client.health_check().await?;
            if result {
                let mut opencode = state.opencode_client.lock().map_err(|e| e.to_string())?;
                *opencode = client;
            }
            result
        }
        BackendKind::LmStudio => {
            let mut client = LmStudioClient::new(&base_url);
            client.update_connection(&base_url, api_token);
            let result = client.health_check().await?;
            if result {
                let mut lm_studio = state.lm_studio_client.lock().map_err(|e| e.to_string())?;
                *lm_studio = client;
            }
            result
        }
    };

    {
        let mut connected = state.connected.lock().map_err(|e| e.to_string())?;
        *connected = result;
    }

    if result {
        let mut active_backend = state.active_backend.lock().map_err(|e| e.to_string())?;
        *active_backend = backend_kind;
    }

    Ok(result)
}

/// Get current connection status
#[tauri::command]
pub async fn get_connection_status(state: State<'_, AppState>) -> Result<bool, String> {
    let backend = get_active_backend(&state)?;
    let result = match backend {
        BackendKind::Ollama => {
            let ollama = get_ollama_client(&state)?;
            ollama.health_check().await
        }
        BackendKind::Opencode => {
            let opencode = get_opencode_client(&state)?;
            opencode.health_check().await
        }
        BackendKind::LmStudio => {
            let lm_studio = get_lm_studio_client(&state)?;
            lm_studio.health_check().await
        }
    };

    match result {
        Ok(healthy) => {
            let mut connected = state.connected.lock().map_err(|e| e.to_string())?;
            *connected = healthy;
            Ok(healthy)
        }
        Err(_) => {
            let mut connected = state.connected.lock().map_err(|e| e.to_string())?;
            *connected = false;
            Ok(false)
        }
    }
}

/// List available models from active backend
#[tauri::command]
pub async fn list_models(state: State<'_, AppState>) -> Result<Vec<OllamaModel>, String> {
    match get_active_backend(&state)? {
        BackendKind::Ollama => {
            let ollama = get_ollama_client(&state)?;
            ollama.list_models().await
        }
        BackendKind::Opencode => {
            let opencode = get_opencode_client(&state)?;
            let models = opencode.list_models().await?;
            Ok(models
                .into_iter()
                .map(|m| OllamaModel {
                    name: format!("{}/{}", m.provider_id, m.model_id),
                    modified_at: None,
                    size: None,
                    digest: None,
                    details: Some(OllamaModelDetails {
                        format: Some("opencode".to_string()),
                        family: Some(m.provider_id),
                        families: None,
                        parameter_size: None,
                        quantization_level: Some(m.display_name),
                    }),
                })
                .collect())
        }
        BackendKind::LmStudio => {
            let lm_studio = get_lm_studio_client(&state)?;
            let models = lm_studio.list_models().await?;
            Ok(models
                .into_iter()
                .map(|model| {
                    let model_key = model.key.clone();
                    let family = model.publisher.clone();
                    let display_name = model.display_name_or_key();
                    let parameter_size = model
                        .params_string
                        .clone()
                        .or_else(|| model.max_context_length.map(|value| format!("{value} ctx")));
                    let quantization_level = model
                        .quantization
                        .as_ref()
                        .and_then(|quantization| quantization.name.clone());

                    OllamaModel {
                        name: format!("lmstudio:{}", model_key),
                        modified_at: None,
                        size: Some(model.size_bytes),
                        digest: None,
                        details: Some(OllamaModelDetails {
                            format: Some("lmstudio".to_string()),
                            family: Some(family),
                            families: None,
                            parameter_size,
                            quantization_level: quantization_level
                                .or_else(|| Some(display_name)),
                        }),
                    }
                })
                .collect())
        }
    }
}

/// Show model details
#[tauri::command]
pub async fn show_model(
    state: State<'_, AppState>,
    model_name: String,
) -> Result<serde_json::Value, String> {
    let backend = get_active_backend(&state)?;
    if backend != BackendKind::Ollama {
        return Err(format!(
            "Model details are only available for Ollama. Current backend: {}",
            backend.label()
        ));
    }
    let ollama = get_ollama_client(&state)?;
    ollama.show_model(&model_name).await
}

/// Pull (download) a model
#[tauri::command]
pub async fn pull_model(
    state: State<'_, AppState>,
    model_name: String,
) -> Result<String, String> {
    let backend = get_active_backend(&state)?;
    if backend != BackendKind::Ollama {
        return Err(format!(
            "Pulling models is only supported for Ollama. Current backend: {}",
            backend.label()
        ));
    }
    let ollama = get_ollama_client(&state)?;
    ollama.pull_model(&model_name).await
}

/// Delete a model
#[tauri::command]
pub async fn delete_model(
    state: State<'_, AppState>,
    model_name: String,
) -> Result<(), String> {
    let backend = get_active_backend(&state)?;
    if backend != BackendKind::Ollama {
        return Err(format!(
            "Deleting models is only supported for Ollama. Current backend: {}",
            backend.label()
        ));
    }
    let ollama = get_ollama_client(&state)?;
    ollama.delete_model(&model_name).await
}

/// Send a chat message and get response
#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    state: State<'_, AppState>,
    model: String,
    messages: Vec<Message>,
    system_prompt: Option<String>,
    parameters: Option<ModelParameters>,
    stream: Option<bool>,
    request_id: Option<String>,
    session_id: Option<String>,
    backend: Option<String>,
    backend_type: Option<String>,
    backend_session_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let active_backend = get_active_backend(&state)?;
    let backend_kind = BackendKind::parse(backend.as_deref().or(backend_type.as_deref()))
        .unwrap_or(active_backend);

    match backend_kind {
        BackendKind::Ollama => {
            let ollama = get_ollama_client(&state)?;
            let params = parameters.unwrap_or_default();

            let ollama_messages = messages_to_ollama(&messages, system_prompt.as_deref());

            let request = OllamaChatRequest {
                model,
                messages: ollama_messages,
                stream: stream.or(Some(false)),
                options: Some(OllamaOptions {
                    temperature: Some(params.temperature),
                    top_k: params.top_k,
                    top_p: params.top_p,
                    num_predict: params.max_tokens,
                }),
            };

            if stream.unwrap_or(false) {
                let mut full_content = String::new();
                let mut eval_count = 0u32;
                let mut total_duration = 0u64;

                let request_id_for_emit = request_id.clone();

                let streaming_result = ollama.chat_stream_with_callback(&request, |chunk| {
                    if let Some(msg) = &chunk.message {
                        full_content.push_str(&msg.content);
                        if let Some(req_id) = &request_id_for_emit {
                            let _ = app.emit("chat_stream_chunk", serde_json::json!({
                                "requestId": req_id,
                                "content": msg.content,
                                "done": false,
                            }));
                        }
                    }

                    if let Some(ec) = chunk.eval_count {
                        eval_count = ec;
                    }
                    if let Some(td) = chunk.total_duration {
                        total_duration = td;
                    }
                }).await;

                if let Err(error) = streaming_result {
                    let error_message = error.to_string();

                    if let Some(req_id) = request_id {
                        let _ = app.emit("chat_stream_chunk", serde_json::json!({
                            "requestId": req_id,
                            "content": "",
                            "done": true,
                            "error": &error_message,
                        }));
                    }

                    return Err(error_message);
                }

                if let Some(req_id) = request_id {
                    let _ = app.emit("chat_stream_chunk", serde_json::json!({
                        "requestId": req_id,
                        "content": "",
                        "done": true,
                        "evalCount": eval_count,
                        "totalDuration": total_duration,
                    }));
                }

                Ok(serde_json::json!({
                    "content": full_content,
                    "eval_count": eval_count,
                    "total_duration": total_duration,
                    "done": true,
                }))
            } else {
                let response = ollama.chat(&request).await?;
                let content = response.message
                    .map(|m| m.content)
                    .unwrap_or_default();

                Ok(serde_json::json!({
                    "content": content,
                    "eval_count": response.eval_count,
                    "total_duration": response.total_duration,
                    "done": true,
                }))
            }
        }
        BackendKind::Opencode => {
            let opencode = get_opencode_client(&state)?;
            let user_text = messages
                .iter()
                .rev()
                .find(|message| message.role == MessageRole::User)
                .map(|message| message.content.trim().to_string())
                .unwrap_or_default();

            if user_text.is_empty() {
                return Err("No user message found to send".to_string());
            }

            let model_selection = parse_model_selector(&model);
            let resolved_session_id = match session_id.or(backend_session_id) {
                Some(id) if !id.trim().is_empty() => id,
                _ => opencode.create_session(None).await?,
            };

            let response = opencode
                .prompt_session(
                    &resolved_session_id,
                    &user_text,
                    model_selection.as_ref(),
                    system_prompt.as_deref(),
                )
                .await?;

            Ok(serde_json::json!({
                "content": response.content,
                "done": true,
                "session_id": resolved_session_id,
            }))
        }
        BackendKind::LmStudio => {
            let lm_studio = get_lm_studio_client(&state)?;
            let params = parameters.unwrap_or_default();
            let previous_response_id = session_id
                .or(backend_session_id)
                .filter(|id| !id.trim().is_empty());
            let prompt = if previous_response_id.is_some() {
                latest_user_text(&messages).unwrap_or_default()
            } else {
                build_lm_studio_prompt(&messages)
            };

            if prompt.trim().is_empty() {
                return Err("No user message found to send".to_string());
            }

            let attachments = latest_user_attachments(&messages);
            let model_id = strip_lm_studio_prefix(&model).to_string();

            if stream.unwrap_or(true) {
                let mut full_content = String::new();
                let request_id_for_emit = request_id.clone();

                let response = lm_studio
                    .chat_stream_with_callback(
                        &model_id,
                        &prompt,
                        &attachments,
                        system_prompt.as_deref(),
                        params.temperature,
                        params.max_tokens,
                        previous_response_id.as_deref(),
                        |chunk| {
                            full_content.push_str(chunk);
                            if let Some(req_id) = &request_id_for_emit {
                                let _ = app.emit("chat_stream_chunk", serde_json::json!({
                                    "requestId": req_id,
                                    "content": chunk,
                                    "done": false,
                                }));
                            }
                        },
                    )
                    .await;

                let response = match response {
                    Ok(response) => response,
                    Err(error) => {
                        if let Some(req_id) = request_id {
                            let _ = app.emit("chat_stream_chunk", serde_json::json!({
                                "requestId": req_id,
                                "content": "",
                                "done": true,
                                "error": &error,
                            }));
                        }

                        return Err(error);
                    }
                };

                let session_id = response.response_id;
                let final_content = if full_content.is_empty() {
                    response.content
                } else {
                    full_content
                };

                if let Some(req_id) = request_id {
                    let _ = app.emit("chat_stream_chunk", serde_json::json!({
                        "requestId": req_id,
                        "content": "",
                        "done": true,
                    }));
                }

                Ok(serde_json::json!({
                    "content": final_content,
                    "done": true,
                    "session_id": session_id,
                }))
            } else {
                let response = lm_studio
                    .chat(
                        &model_id,
                        &prompt,
                        &attachments,
                        system_prompt.as_deref(),
                        params.temperature,
                        params.max_tokens,
                        previous_response_id.as_deref(),
                    )
                    .await?;
                let session_id = response.response_id;
                let content = response.content;

                Ok(serde_json::json!({
                    "content": content,
                    "done": true,
                    "session_id": session_id,
                }))
            }
        }
    }
}

/// Generate a title for a conversation
#[tauri::command]
pub async fn generate_title(
    state: State<'_, AppState>,
    model: String,
    first_message: String,
) -> Result<String, String> {
    if get_active_backend(&state)? != BackendKind::Ollama {
        return Ok(simple_title(&first_message));
    }

    let ollama = get_ollama_client(&state)?;
    ollama.generate_title(&model, &first_message).await
}

/// Fetch a web page and return its text content
#[tauri::command]
pub async fn fetch_webpage(url: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (compatible; PrivateChatHub/0.1)")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let text = if content_type.contains("text/html") {
        strip_html_tags(&body)
    } else {
        body
    };

    let length = text.len();

    Ok(serde_json::json!({
        "url": url,
        "status": status,
        "content_type": content_type,
        "content": text,
        "length": length,
    }))
}

/// Simple HTML tag stripper
fn strip_html_tags(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;
    let mut in_script = false;
    let mut in_style = false;
    let mut last_was_whitespace = false;

    let lower = html.to_lowercase();
    let chars: Vec<char> = html.chars().collect();
    let lower_chars: Vec<char> = lower.chars().collect();

    let mut i = 0;
    while i < chars.len() {
        if !in_tag && i + 7 < lower_chars.len() && &lower[i..i + 7] == "<script" {
            in_script = true;
            in_tag = true;
        } else if !in_tag && i + 6 < lower_chars.len() && &lower[i..i + 6] == "<style" {
            in_style = true;
            in_tag = true;
        } else if in_script && i + 9 <= lower_chars.len() && &lower[i..i + 9] == "</script>" {
            in_script = false;
            i += 9;
            continue;
        } else if in_style && i + 8 <= lower_chars.len() && &lower[i..i + 8] == "</style>" {
            in_style = false;
            i += 8;
            continue;
        } else if chars[i] == '<' {
            in_tag = true;
        } else if chars[i] == '>' {
            in_tag = false;
            i += 1;
            continue;
        }

        if !in_tag && !in_script && !in_style {
            let ch = chars[i];
            if ch.is_whitespace() {
                if !last_was_whitespace {
                    result.push(' ');
                    last_was_whitespace = true;
                }
            } else {
                result.push(ch);
                last_was_whitespace = false;
            }
        }

        i += 1;
    }

    result.trim().to_string()
}

/// Compare two models with the same prompt
#[tauri::command]
pub async fn compare_models(
    state: State<'_, AppState>,
    model1: String,
    model2: String,
    messages: Vec<Message>,
    system_prompt: Option<String>,
    parameters: Option<ModelParameters>,
) -> Result<serde_json::Value, String> {
    if get_active_backend(&state)? != BackendKind::Ollama {
        return Err("Model comparison is only available with Ollama backend".to_string());
    }

    let ollama = get_ollama_client(&state)?;
    let params = parameters.unwrap_or_default();
    let ollama_messages = messages_to_ollama(&messages, system_prompt.as_deref());

    let request1 = OllamaChatRequest {
        model: model1.clone(),
        messages: ollama_messages.clone(),
        stream: Some(false),
        options: Some(OllamaOptions {
            temperature: Some(params.temperature),
            top_k: params.top_k,
            top_p: params.top_p,
            num_predict: params.max_tokens,
        }),
    };

    let mut request2 = request1.clone();
    request2.model = model2.clone();

    let start1 = std::time::Instant::now();
    let response1 = ollama.chat(&request1).await;
    let duration1 = start1.elapsed().as_millis() as u64;

    let start2 = std::time::Instant::now();
    let response2 = ollama.chat(&request2).await;
    let duration2 = start2.elapsed().as_millis() as u64;

    let content1 = response1
        .map(|r| r.message.map(|m| m.content).unwrap_or_default())
        .unwrap_or_else(|e| format!("Error: {}", e));

    let content2 = response2
        .map(|r| r.message.map(|m| m.content).unwrap_or_default())
        .unwrap_or_else(|e| format!("Error: {}", e));

    Ok(serde_json::json!({
        "model1": {
            "name": model1,
            "content": content1,
            "duration_ms": duration1,
        },
        "model2": {
            "name": model2,
            "content": content2,
            "duration_ms": duration2,
        },
    }))
}

// ─── LAN Sync Commands ────────────────────────────────────────────────────────

/// Start the embedded HTTP sync server on the given port.
#[tauri::command]
pub async fn start_sync_server(
    port: u16,
    pin: Option<String>,
    app_handle: AppHandle,
) -> Result<(), String> {
    crate::sync_server::start(port, pin, app_handle).await
}

/// Stop the sync server if it is running.
#[tauri::command]
pub fn stop_sync_server() -> Result<(), String> {
    crate::sync_server::stop();
    Ok(())
}

/// Returns true if the sync server is currently running.
#[tauri::command]
pub fn is_sync_server_running() -> bool {
    crate::sync_server::is_running()
}

/// Returns the primary local LAN IP address (shown to user for pairing).
#[tauri::command]
pub fn get_local_ip() -> String {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "unknown".to_string())
}

/// Called by the frontend whenever conversations or projects change while the
/// sync server is running, so the server always serves up-to-date data.
#[tauri::command]
pub fn update_sync_data(
    conversations: Vec<serde_json::Value>,
    projects: Vec<serde_json::Value>,
) -> Result<(), String> {
    let data = crate::sync_server::shared_data();
    let mut guard = data.lock().map_err(|e| e.to_string())?;
    guard.conversations = conversations;
    guard.projects = projects;
    Ok(())
}

#[tauri::command]
pub fn prepare_folder_sync(
    base_path: String,
) -> Result<crate::folder_sync::FolderSyncStatus, String> {
    crate::folder_sync::prepare_folder_sync(base_path)
}

#[tauri::command]
pub fn save_folder_sync_snapshot(
    base_path: String,
    snapshot: crate::folder_sync::FolderSyncSnapshot,
) -> Result<crate::folder_sync::FolderSyncStatus, String> {
    crate::folder_sync::save_folder_sync_snapshot(base_path, snapshot)
}

#[tauri::command]
pub fn load_folder_sync_snapshot(
    base_path: String,
) -> Result<crate::folder_sync::FolderSyncSnapshot, String> {
    crate::folder_sync::load_folder_sync_snapshot(base_path)
}
