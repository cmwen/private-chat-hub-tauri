use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// Ollama connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub use_https: bool,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub last_connected_at: Option<DateTime<Utc>>,
}

impl Connection {
    pub fn base_url(&self) -> String {
        let scheme = if self.use_https { "https" } else { "http" };
        format!("{}://{}:{}", scheme, self.host, self.port)
    }
}

impl Default for Connection {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Local Ollama".to_string(),
            host: "localhost".to_string(),
            port: 11434,
            use_https: false,
            is_default: true,
            created_at: Utc::now(),
            last_connected_at: None,
        }
    }
}

/// Chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub role: MessageRole,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub model_name: Option<String>,
    pub is_error: bool,
    pub token_count: Option<u32>,
    pub attachments: Vec<Attachment>,
    pub tool_calls: Vec<ToolCall>,
    pub status: MessageStatus,
    pub status_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
    System,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MessageStatus {
    Sent,
    Sending,
    Queued,
    Failed,
    Draft,
}

impl Default for MessageStatus {
    fn default() -> Self {
        Self::Sent
    }
}

/// File attachment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub data: Vec<u8>,
    pub size: u64,
}

/// Tool call in a message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
    pub status: ToolCallStatus,
    pub result: Option<ToolResult>,
    pub error_message: Option<String>,
    pub execution_time_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ToolCallStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub data: serde_json::Value,
    pub summary: Option<String>,
}

/// Conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub model_name: String,
    pub messages: Vec<Message>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub system_prompt: Option<String>,
    pub parameters: ModelParameters,
    pub project_id: Option<String>,
    pub tool_calling_enabled: bool,
}

/// Model parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelParameters {
    pub temperature: f64,
    pub top_k: Option<u32>,
    pub top_p: Option<f64>,
    pub max_tokens: Option<u32>,
}

impl Default for ModelParameters {
    fn default() -> Self {
        Self {
            temperature: 0.7,
            top_k: Some(40),
            top_p: Some(0.9),
            max_tokens: None,
        }
    }
}

impl ModelParameters {
    pub fn creative() -> Self {
        Self {
            temperature: 1.2,
            top_k: Some(80),
            top_p: Some(0.95),
            max_tokens: None,
        }
    }

    pub fn precise() -> Self {
        Self {
            temperature: 0.2,
            top_k: Some(10),
            top_p: Some(0.5),
            max_tokens: None,
        }
    }

    pub fn code() -> Self {
        Self {
            temperature: 0.1,
            top_k: Some(5),
            top_p: Some(0.3),
            max_tokens: None,
        }
    }
}

/// Project workspace
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub system_prompt: Option<String>,
    pub instructions: Option<String>,
    pub color: String,
    pub icon: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub is_pinned: bool,
}

/// Ollama model info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub modified_at: Option<String>,
    pub size: Option<u64>,
    pub digest: Option<String>,
    pub details: Option<OllamaModelDetails>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaModelDetails {
    pub format: Option<String>,
    pub family: Option<String>,
    pub families: Option<Vec<String>>,
    pub parameter_size: Option<String>,
    pub quantization_level: Option<String>,
}

/// Ollama API response types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaTagsResponse {
    pub models: Vec<OllamaModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaChatRequest {
    pub model: String,
    pub messages: Vec<OllamaChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<OllamaOptions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_predict: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaChatResponse {
    pub model: Option<String>,
    pub message: Option<OllamaChatMessage>,
    pub done: Option<bool>,
    pub done_reason: Option<String>,
    pub total_duration: Option<u64>,
    pub load_duration: Option<u64>,
    pub prompt_eval_count: Option<u32>,
    pub prompt_eval_duration: Option<u64>,
    pub eval_count: Option<u32>,
    pub eval_duration: Option<u64>,
}

/// Cloud API provider configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudProvider {
    pub id: String,
    pub name: String,
    pub provider_type: CloudProviderType,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub enabled: bool,
    pub models: Vec<CloudModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CloudProviderType {
    OpenAI,
    Anthropic,
    Google,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudModel {
    pub id: String,
    pub name: String,
    pub max_context: u32,
    pub supports_vision: bool,
    pub supports_tools: bool,
    pub input_cost_per_1k: f64,
    pub output_cost_per_1k: f64,
}

/// Tool configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolConfig {
    pub enabled: bool,
    pub web_search_enabled: bool,
    pub jina_api_key: Option<String>,
    pub max_search_results: u32,
    pub cache_search_results: bool,
    pub max_tool_calls: u32,
}

impl Default for ToolConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            web_search_enabled: false,
            jina_api_key: None,
            max_search_results: 5,
            cache_search_results: true,
            max_tool_calls: 10,
        }
    }
}

/// App settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: Theme,
    pub default_model: Option<String>,
    pub default_connection_id: Option<String>,
    pub tool_config: ToolConfig,
    pub developer_mode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    System,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            default_model: None,
            default_connection_id: None,
            tool_config: ToolConfig::default(),
            developer_mode: false,
        }
    }
}

/// Model comparison
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComparisonResult {
    pub id: String,
    pub prompt: String,
    pub model1_name: String,
    pub model1_response: String,
    pub model1_duration_ms: u64,
    pub model2_name: String,
    pub model2_response: String,
    pub model2_duration_ms: u64,
    pub created_at: DateTime<Utc>,
}
