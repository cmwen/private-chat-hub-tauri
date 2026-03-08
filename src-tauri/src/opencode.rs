use reqwest::{Client, Method, RequestBuilder, StatusCode};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;

#[derive(Clone)]
pub struct OpencodeClient {
    client: Client,
    base_url: String,
    auth: Option<OpencodeAuth>,
}

#[derive(Clone)]
struct OpencodeAuth {
    username: String,
    password: String,
}

#[derive(Debug, Clone)]
pub struct OpencodeModel {
    pub provider_id: String,
    pub model_id: String,
    pub display_name: String,
}

#[derive(Debug, Clone)]
pub struct OpencodeModelRef {
    pub provider_id: String,
    pub model_id: String,
}

#[derive(Debug, Clone)]
pub struct OpencodePromptResult {
    pub content: String,
}

#[derive(Serialize)]
struct ModelSelection<'a> {
    #[serde(rename = "providerID")]
    provider_id: &'a str,
    #[serde(rename = "modelID")]
    model_id: &'a str,
}

#[derive(Serialize)]
struct TextPart<'a> {
    #[serde(rename = "type")]
    part_type: &'static str,
    text: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PromptRequest<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<ModelSelection<'a>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<&'a str>,
    parts: Vec<TextPart<'a>>,
}

const ERROR_BODY_LIMIT: usize = 280;

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

fn extract_prompt_error(payload: &Value) -> Option<String> {
    for pointer in [
        "/info/error/data/message",
        "/info/error/message",
        "/error/data/message",
        "/error/message",
        "/data/message",
    ] {
        if let Some(message) = payload
            .pointer(pointer)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|message| !message.is_empty())
        {
            return Some(message.to_string());
        }
    }

    payload
        .get("name")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(|name| name.to_string())
}

fn extract_prompt_content(payload: &Value) -> String {
    if let Some(text) = payload
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return text.to_string();
    }

    if let Some(items) = payload.as_array() {
        for item in items.iter().rev() {
            let content = extract_prompt_content(item);
            if !content.is_empty() {
                return content;
            }
        }
    }

    if let Some(parts) = payload.get("parts").and_then(|v| v.as_array()) {
        let mut primary = Vec::new();
        let mut fallback = Vec::new();

        for part in parts {
            let part_type = part.get("type").and_then(|t| t.as_str()).unwrap_or_default();
            let part_text = part
                .get("text")
                .and_then(|v| v.as_str())
                .or_else(|| part.get("content").and_then(|v| v.as_str()))
                .or_else(|| part.pointer("/state/output").and_then(|v| v.as_str()))
                .map(str::trim)
                .filter(|text| !text.is_empty());

            if let Some(text) = part_text {
                match part_type {
                    "text" => primary.push(text.to_string()),
                    "reasoning" | "tool" => fallback.push(text.to_string()),
                    _ => {}
                }
            }
        }

        if !primary.is_empty() {
            return primary.join("");
        }
        if !fallback.is_empty() {
            return fallback.join("\n");
        }
    }

    for pointer in ["/text", "/content", "/data/text", "/data/content"] {
        if let Some(text) = payload
            .pointer(pointer)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|text| !text.is_empty())
        {
            return text.to_string();
        }
    }

    String::new()
}

impl OpencodeClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(300))
                .build()
                .unwrap_or_default(),
            base_url: base_url.trim_end_matches('/').to_string(),
            auth: None,
        }
    }

    pub fn update_connection(
        &mut self,
        base_url: &str,
        username: Option<String>,
        password: Option<String>,
    ) {
        self.base_url = base_url.trim_end_matches('/').to_string();
        self.auth = password
            .filter(|pass| !pass.trim().is_empty())
            .map(|pass| OpencodeAuth {
                username: username
                    .filter(|user| !user.trim().is_empty())
                    .unwrap_or_else(|| "opencode".to_string()),
                password: pass,
            });
    }

    fn request(&self, method: Method, path: &str) -> RequestBuilder {
        let url = format!("{}/{}", self.base_url, path.trim_start_matches('/'));
        let request = self.client.request(method, url);
        if let Some(auth) = &self.auth {
            request.basic_auth(auth.username.clone(), Some(auth.password.clone()))
        } else {
            request
        }
    }

    fn transport_error(&self, action: &str, error: reqwest::Error) -> String {
        if error.is_timeout() {
            return format!(
                "{action} timed out while contacting OpenCode at {}",
                self.base_url
            );
        }
        if error.is_connect() {
            return format!(
                "{action} could not connect to OpenCode at {}. Verify host, port, and server availability.",
                self.base_url
            );
        }
        format!("{action} failed: {error}")
    }

    fn status_error(&self, action: &str, status: StatusCode, body: &str) -> String {
        if matches!(status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN) {
            return format!(
                "OpenCode authentication failed ({status}). Check username/password."
            );
        }
        if status == StatusCode::NOT_FOUND {
            return format!(
                "{action} failed ({status}). Verify the OpenCode base URL and API path."
            );
        }
        let detail = trim_error_body(body);
        if detail == "no response body" {
            return format!("{action} failed with status: {status}");
        }
        format!("{action} failed ({status}): {detail}")
    }

    pub async fn health_check(&self) -> Result<bool, String> {
        let response = self
            .request(Method::GET, "/global/health")
            .send()
            .await
            .map_err(|e| self.transport_error("OpenCode health check", e))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(self.status_error("OpenCode health check", status, &body));
        }

        let payload: Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse health response: {}", e))?;

        Ok(payload
            .get("healthy")
            .and_then(|v| v.as_bool())
            .unwrap_or(true))
    }

    pub async fn list_models(&self) -> Result<Vec<OpencodeModel>, String> {
        let response = self
            .request(Method::GET, "/provider")
            .send()
            .await
            .map_err(|e| self.transport_error("OpenCode provider listing", e))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(self.status_error("OpenCode provider listing", status, &body));
        }

        let payload: Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse provider response: {}", e))?;

        let connected: HashSet<String> = payload
            .get("connected")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|entry| entry.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        let defaults: HashSet<String> = payload
            .get("default")
            .and_then(|v| v.as_object())
            .map(|obj| obj.keys().cloned().collect())
            .unwrap_or_default();

        let all = payload
            .get("all")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "OpenCode provider response is missing 'all'".to_string())?;

        let allowed_providers: HashSet<String> = if !connected.is_empty() {
            connected.clone()
        } else {
            defaults
        };

        if allowed_providers.is_empty() {
            return Ok(Vec::new());
        }

        let mut models = Vec::new();

        for provider in all {
            let provider_id = provider
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or_default();

            if provider_id.is_empty() {
                continue;
            }

            if !allowed_providers.contains(provider_id) {
                continue;
            }

            let provider_models = match provider.get("models").and_then(|v| v.as_object()) {
                Some(m) => m,
                None => continue,
            };

            for (model_key, model_value) in provider_models {
                let model_id = model_value
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or(model_key)
                    .to_string();

                let display_name = model_value
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&model_id)
                    .to_string();

                models.push(OpencodeModel {
                    provider_id: provider_id.to_string(),
                    model_id,
                    display_name,
                });
            }
        }

        models.sort_by(|a, b| {
            let provider_order = a.provider_id.cmp(&b.provider_id);
            if provider_order == std::cmp::Ordering::Equal {
                a.model_id.cmp(&b.model_id)
            } else {
                provider_order
            }
        });

        Ok(models)
    }

    pub async fn create_session(&self, title: Option<&str>) -> Result<String, String> {
        let mut body = serde_json::Map::new();
        if let Some(title) = title {
            if !title.trim().is_empty() {
                body.insert("title".to_string(), Value::String(title.to_string()));
            }
        }

        let response = self
            .request(Method::POST, "/session")
            .json(&body)
            .send()
            .await
            .map_err(|e| self.transport_error("OpenCode session create", e))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(self.status_error("OpenCode session create", status, &body));
        }

        let payload: Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse OpenCode session response: {}", e))?;

        payload
            .get("id")
            .or_else(|| payload.pointer("/info/id"))
            .and_then(|v| v.as_str())
            .map(|id| id.to_string())
            .ok_or_else(|| "OpenCode session response missing id".to_string())
    }

    pub async fn prompt_session(
        &self,
        session_id: &str,
        text: &str,
        model: Option<&OpencodeModelRef>,
        system: Option<&str>,
    ) -> Result<OpencodePromptResult, String> {
        let request = PromptRequest {
            model: model.map(|m| ModelSelection {
                provider_id: &m.provider_id,
                model_id: &m.model_id,
            }),
            system,
            parts: vec![TextPart {
                part_type: "text",
                text,
            }],
        };

        let response = self
            .request(Method::POST, &format!("/session/{session_id}/message"))
            .json(&request)
            .send()
            .await
            .map_err(|e| self.transport_error("OpenCode prompt", e))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(self.status_error("OpenCode prompt", status, &body));
        }

        let response_body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read OpenCode prompt response: {}", e))?;
        let trimmed_body = response_body.trim();
        if trimmed_body.is_empty() {
            return Err("OpenCode prompt response body was empty".to_string());
        }

        let payload: Value = match serde_json::from_str(trimmed_body) {
            Ok(payload) => payload,
            Err(_) => {
                if trimmed_body.starts_with('<') {
                    return Err(
                        "OpenCode prompt returned HTML instead of JSON/text. Verify URL and authentication."
                            .to_string(),
                    );
                }
                return Ok(OpencodePromptResult {
                    content: trimmed_body.to_string(),
                });
            }
        };

        let content = extract_prompt_content(&payload);
        if !content.is_empty() {
            return Ok(OpencodePromptResult { content });
        }

        if let Some(message) = extract_prompt_error(&payload) {
            return Err(format!("OpenCode response error: {}", message));
        }

        Err("OpenCode prompt response did not include any text content".to_string())
    }
}
