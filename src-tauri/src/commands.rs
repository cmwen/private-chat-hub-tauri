use crate::models::*;
use crate::ollama::{OllamaClient, messages_to_ollama};
use std::sync::Mutex;
use tauri::State;

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
    let ollama = state.ollama_client.lock().map_err(|e| e.to_string())?;
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
    let ollama = state.ollama_client.lock().map_err(|e| e.to_string())?;
    ollama.list_models().await
}

/// Show model details
#[tauri::command]
pub async fn show_model(
    state: State<'_, AppState>,
    model_name: String,
) -> Result<serde_json::Value, String> {
    let ollama = state.ollama_client.lock().map_err(|e| e.to_string())?;
    ollama.show_model(&model_name).await
}

/// Pull (download) a model
#[tauri::command]
pub async fn pull_model(
    state: State<'_, AppState>,
    model_name: String,
) -> Result<String, String> {
    let ollama = state.ollama_client.lock().map_err(|e| e.to_string())?;
    ollama.pull_model(&model_name).await
}

/// Delete a model
#[tauri::command]
pub async fn delete_model(
    state: State<'_, AppState>,
    model_name: String,
) -> Result<(), String> {
    let ollama = state.ollama_client.lock().map_err(|e| e.to_string())?;
    ollama.delete_model(&model_name).await
}

/// Send a chat message and get response
#[tauri::command]
pub async fn send_message(
    state: State<'_, AppState>,
    model: String,
    messages: Vec<Message>,
    system_prompt: Option<String>,
    parameters: Option<ModelParameters>,
    stream: Option<bool>,
) -> Result<serde_json::Value, String> {
    let ollama = state.ollama_client.lock().map_err(|e| e.to_string())?;
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
        // Streaming: collect all chunks and return full content
        let chunks = ollama.chat_stream(&request).await?;
        let mut full_content = String::new();
        let mut eval_count = 0u32;
        let mut total_duration = 0u64;

        for chunk in &chunks {
            if let Some(msg) = &chunk.message {
                full_content.push_str(&msg.content);
            }
            if let Some(ec) = chunk.eval_count {
                eval_count = ec;
            }
            if let Some(td) = chunk.total_duration {
                total_duration = td;
            }
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
    let ollama = state.ollama_client.lock().map_err(|e| e.to_string())?;
    ollama.generate_title(&model, &first_message).await
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
    let ollama = state.ollama_client.lock().map_err(|e| e.to_string())?;
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
