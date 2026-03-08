use crate::models::Attachment;
use base64::Engine;
use futures::StreamExt;
use reqwest::{Client, Method, RequestBuilder, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone)]
pub struct LmStudioClient {
    client: Client,
    base_url: String,
    api_token: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LmStudioModel {
    #[serde(default = "default_model_type", rename = "type")]
    pub model_type: String,
    #[serde(default)]
    pub publisher: String,
    pub key: String,
    #[serde(default, rename = "display_name")]
    pub display_name: String,
    #[serde(default, rename = "size_bytes")]
    pub size_bytes: u64,
    #[serde(default, rename = "params_string")]
    pub params_string: Option<String>,
    #[serde(default, rename = "max_context_length")]
    pub max_context_length: Option<u32>,
    #[serde(default)]
    pub quantization: Option<LmStudioQuantization>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct LmStudioQuantization {
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct LmStudioChatResult {
    pub content: String,
    pub response_id: Option<String>,
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    input: Value,
    stream: bool,
    store: bool,
    temperature: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_prompt: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    previous_response_id: Option<&'a str>,
}

const ERROR_BODY_LIMIT: usize = 280;

fn default_model_type() -> String {
    "llm".to_string()
}

fn trim_error_body(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return "no response body".to_string();
    }

    let mut truncated = trimmed.chars().take(ERROR_BODY_LIMIT).collect::<String>();
    if trimmed.chars().count() > ERROR_BODY_LIMIT {
        truncated.push('…');
    }
    truncated
}

fn extract_error_message(payload: &Value) -> Option<String> {
    for pointer in [
        "/error/message",
        "/message",
        "/detail",
        "/data/error/message",
        "/data/message",
    ] {
        if let Some(message) = payload
            .pointer(pointer)
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|message| !message.is_empty())
        {
            return Some(message.to_string());
        }
    }

    None
}

fn extract_chat_content(payload: &Value) -> String {
    if let Some(text) = payload
        .get("content")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return text.to_string();
    }

    if let Some(text) = payload
        .get("output_text")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return text.to_string();
    }

    let mut combined = String::new();
    if let Some(items) = payload.get("output").and_then(|value| value.as_array()) {
        for item in items {
            if item.get("type").and_then(|value| value.as_str()) != Some("message") {
                continue;
            }

            if let Some(content) = item
                .get("content")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|content| !content.is_empty())
            {
                combined.push_str(content);
            }
        }
    }

    combined
}

fn parse_chat_result(payload: &Value) -> LmStudioChatResult {
    LmStudioChatResult {
        content: extract_chat_content(payload),
        response_id: payload
            .get("response_id")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string()),
    }
}

fn build_input(prompt: &str, attachments: &[Attachment]) -> Value {
    let image_parts: Vec<Value> = attachments
        .iter()
        .filter(|attachment| attachment.mime_type.starts_with("image/"))
        .map(|attachment| {
            let encoded = base64::engine::general_purpose::STANDARD.encode(&attachment.data);
            json!({
                "type": "image",
                "data_url": format!("data:{};base64,{}", attachment.mime_type, encoded),
            })
        })
        .collect();

    if image_parts.is_empty() {
        json!(prompt)
    } else {
        let mut input = Vec::with_capacity(image_parts.len() + 1);
        input.push(json!({
            "type": "message",
            "content": prompt,
        }));
        input.extend(image_parts);
        Value::Array(input)
    }
}

fn process_stream_event<F>(
    event_name: &str,
    data: &str,
    final_result: &mut LmStudioChatResult,
    on_chunk: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    if data.trim().is_empty() {
        return Ok(());
    }

    let payload: Value = serde_json::from_str(data)
        .map_err(|error| format!("Failed to parse LM Studio stream payload: {}", error))?;

    match event_name {
        "message.delta" => {
            if let Some(content) = payload
                .get("content")
                .and_then(|value| value.as_str())
                .filter(|content| !content.is_empty())
            {
                final_result.content.push_str(content);
                on_chunk(content);
            }
        }
        "chat.end" => {
            let result_payload = payload.get("result").unwrap_or(&payload);
            let result = parse_chat_result(result_payload);
            let LmStudioChatResult {
                content,
                response_id,
            } = result;
            if final_result.response_id.is_none() {
                final_result.response_id = response_id;
            }
            if final_result.content.is_empty() && !content.is_empty() {
                final_result.content = content;
            }
        }
        "error" => {
            return Err(
                extract_error_message(&payload)
                    .unwrap_or_else(|| "LM Studio returned a streaming error".to_string()),
            );
        }
        _ => {}
    }

    Ok(())
}

impl LmStudioModel {
    pub fn display_name_or_key(&self) -> String {
        if self.display_name.trim().is_empty() {
            self.key.clone()
        } else {
            self.display_name.clone()
        }
    }

    pub fn is_llm(&self) -> bool {
        self.model_type == "llm"
    }
}

impl LmStudioClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(300))
                .build()
                .unwrap_or_default(),
            base_url: base_url.trim_end_matches('/').to_string(),
            api_token: None,
        }
    }

    pub fn update_connection(&mut self, base_url: &str, api_token: Option<String>) {
        self.base_url = base_url.trim_end_matches('/').to_string();
        self.api_token = api_token
            .map(|token| token.trim().to_string())
            .filter(|token| !token.is_empty());
    }

    fn request(&self, method: Method, path: &str) -> RequestBuilder {
        let url = format!("{}/{}", self.base_url, path.trim_start_matches('/'));
        let request = self.client.request(method, url);

        if let Some(api_token) = &self.api_token {
            request.bearer_auth(api_token)
        } else {
            request
        }
    }

    fn transport_error(&self, action: &str, error: reqwest::Error) -> String {
        if error.is_timeout() {
            return format!(
                "{action} timed out while contacting LM Studio at {}",
                self.base_url
            );
        }
        if error.is_connect() {
            return format!(
                "{action} could not connect to LM Studio at {}. Verify host, port, and that the local server is enabled.",
                self.base_url
            );
        }

        format!("{action} failed: {error}")
    }

    fn status_error(&self, action: &str, status: StatusCode, body: &str) -> String {
        if matches!(status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN) {
            return "LM Studio authentication failed. Check the configured API token.".to_string();
        }
        if status == StatusCode::NOT_FOUND {
            return format!(
                "{action} failed ({status}). Verify the LM Studio base URL and API path."
            );
        }

        let detail = trim_error_body(body);
        if detail == "no response body" {
            return format!("{action} failed with status: {status}");
        }

        format!("{action} failed ({status}): {detail}")
    }

    pub async fn health_check(&self) -> Result<bool, String> {
        self.list_models().await.map(|_| true)
    }

    pub async fn list_models(&self) -> Result<Vec<LmStudioModel>, String> {
        let response = self
            .request(Method::GET, "/api/v1/models")
            .send()
            .await
            .map_err(|error| self.transport_error("LM Studio model listing", error))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(self.status_error("LM Studio model listing", status, &body));
        }

        let payload: Value = response
            .json()
            .await
            .map_err(|error| format!("Failed to parse LM Studio model response: {}", error))?;

        let models_value = if payload.is_array() {
            payload
        } else {
            payload
                .get("models")
                .cloned()
                .or_else(|| payload.get("data").cloned())
                .unwrap_or_else(|| Value::Array(Vec::new()))
        };

        let models: Vec<LmStudioModel> = serde_json::from_value(models_value)
            .map_err(|error| format!("Failed to decode LM Studio models: {}", error))?;

        Ok(models.into_iter().filter(|model| model.is_llm()).collect())
    }

    pub async fn chat(
        &self,
        model_id: &str,
        prompt: &str,
        attachments: &[Attachment],
        system_prompt: Option<&str>,
        temperature: f64,
        max_tokens: Option<u32>,
        previous_response_id: Option<&str>,
    ) -> Result<LmStudioChatResult, String> {
        let request = ChatRequest {
            model: model_id,
            input: build_input(prompt, attachments),
            stream: false,
            store: false,
            temperature: temperature.clamp(0.0, 2.0),
            system_prompt: system_prompt.filter(|prompt| !prompt.trim().is_empty()),
            max_output_tokens: max_tokens,
            previous_response_id,
        };

        let response = self
            .request(Method::POST, "/api/v1/chat")
            .json(&request)
            .send()
            .await
            .map_err(|error| self.transport_error("LM Studio chat request", error))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(self.status_error("LM Studio chat request", status, &body));
        }

        let payload: Value = response
            .json()
            .await
            .map_err(|error| format!("Failed to parse LM Studio chat response: {}", error))?;

        Ok(parse_chat_result(&payload))
    }

    pub async fn chat_stream_with_callback<F>(
        &self,
        model_id: &str,
        prompt: &str,
        attachments: &[Attachment],
        system_prompt: Option<&str>,
        temperature: f64,
        max_tokens: Option<u32>,
        previous_response_id: Option<&str>,
        mut on_chunk: F,
    ) -> Result<LmStudioChatResult, String>
    where
        F: FnMut(&str),
    {
        let request = ChatRequest {
            model: model_id,
            input: build_input(prompt, attachments),
            stream: true,
            store: false,
            temperature: temperature.clamp(0.0, 2.0),
            system_prompt: system_prompt.filter(|prompt| !prompt.trim().is_empty()),
            max_output_tokens: max_tokens,
            previous_response_id,
        };

        let response = self
            .request(Method::POST, "/api/v1/chat")
            .header("Accept", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .json(&request)
            .send()
            .await
            .map_err(|error| self.transport_error("LM Studio streaming chat request", error))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(self.status_error(
                "LM Studio streaming chat request",
                status,
                &body,
            ));
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut current_event = "message".to_string();
        let mut data_buffer = String::new();
        let mut final_result = LmStudioChatResult {
            content: String::new(),
            response_id: None,
        };

        while let Some(chunk) = stream.next().await {
            let chunk = chunk
                .map_err(|error| format!("LM Studio stream error: {}", error))?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].trim_end_matches('\r').to_string();
                buffer = buffer[newline_pos + 1..].to_string();

                if line.is_empty() {
                    process_stream_event(
                        &current_event,
                        data_buffer.trim(),
                        &mut final_result,
                        &mut on_chunk,
                    )?;
                    current_event = "message".to_string();
                    data_buffer.clear();
                    continue;
                }

                if let Some(event_name) = line.strip_prefix("event:") {
                    current_event = event_name.trim().to_string();
                    continue;
                }

                if let Some(data_line) = line.strip_prefix("data:") {
                    if !data_buffer.is_empty() {
                        data_buffer.push('\n');
                    }
                    data_buffer.push_str(data_line.trim());
                }
            }
        }

        if !data_buffer.trim().is_empty() {
            process_stream_event(
                &current_event,
                data_buffer.trim(),
                &mut final_result,
                &mut on_chunk,
            )?;
        }

        Ok(final_result)
    }
}
