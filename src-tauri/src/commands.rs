use crate::models::*;
use crate::ollama::{OllamaClient, messages_to_ollama};
use std::sync::Mutex;
use tauri::State;
use tauri::{AppHandle, Emitter};

pub struct AppState {
    pub ollama_client: Mutex<OllamaClient>,
    pub connected: Mutex<bool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            ollama_client: Mutex::new(OllamaClient::new("http://localhost:11434")),
            connected: Mutex::new(false),
        }
    }
}

fn get_ollama_client(state: &State<'_, AppState>) -> Result<OllamaClient, String> {
    let client = state.ollama_client.lock().map_err(|e| e.to_string())?.clone();
    Ok(client)
}

/// Test connection to Ollama server
#[tauri::command]
pub async fn test_connection(
    state: State<'_, AppState>,
    host: String,
    port: u16,
    use_https: bool,
) -> Result<bool, String> {
    let scheme = if use_https { "https" } else { "http" };
    let base_url = format!("{}://{}:{}", scheme, host, port);

    let client = OllamaClient::new(&base_url);
    let result = client.health_check().await?;

    if result {
        let mut ollama = state.ollama_client.lock().map_err(|e| e.to_string())?;
        ollama.update_base_url(&base_url);
        let mut connected = state.connected.lock().map_err(|e| e.to_string())?;
        *connected = true;
    }

    Ok(result)
}

/// Get current connection status
#[tauri::command]
pub async fn get_connection_status(state: State<'_, AppState>) -> Result<bool, String> {
    let ollama = get_ollama_client(&state)?;
    match ollama.health_check().await {
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

/// List available models from Ollama
#[tauri::command]
pub async fn list_models(state: State<'_, AppState>) -> Result<Vec<OllamaModel>, String> {
    let ollama = get_ollama_client(&state)?;
    ollama.list_models().await
}

/// Show model details
#[tauri::command]
pub async fn show_model(
    state: State<'_, AppState>,
    model_name: String,
) -> Result<serde_json::Value, String> {
    let ollama = get_ollama_client(&state)?;
    ollama.show_model(&model_name).await
}

/// Pull (download) a model
#[tauri::command]
pub async fn pull_model(
    state: State<'_, AppState>,
    model_name: String,
) -> Result<String, String> {
    let ollama = get_ollama_client(&state)?;
    ollama.pull_model(&model_name).await
}

/// Delete a model
#[tauri::command]
pub async fn delete_model(
    state: State<'_, AppState>,
    model_name: String,
) -> Result<(), String> {
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
) -> Result<serde_json::Value, String> {
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

/// Generate a title for a conversation
#[tauri::command]
pub async fn generate_title(
    state: State<'_, AppState>,
    model: String,
    first_message: String,
) -> Result<String, String> {
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
