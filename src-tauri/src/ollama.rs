use crate::models::*;
use reqwest::Client;
use futures::StreamExt;
use std::time::Instant;

pub struct OllamaClient {
    client: Client,
    base_url: String,
}

impl OllamaClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(300))
                .build()
                .unwrap_or_default(),
            base_url: base_url.trim_end_matches('/').to_string(),
        }
    }

    pub fn update_base_url(&mut self, base_url: &str) {
        self.base_url = base_url.trim_end_matches('/').to_string();
    }

    /// Check if the Ollama server is reachable
    pub async fn health_check(&self) -> Result<bool, String> {
        let url = format!("{}/api/tags", self.base_url);
        match self.client.get(&url).send().await {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(e) => Err(format!("Connection failed: {}", e)),
        }
    }

    /// List available models
    pub async fn list_models(&self) -> Result<Vec<OllamaModel>, String> {
        let url = format!("{}/api/tags", self.base_url);
        let resp = self.client.get(&url).send().await
            .map_err(|e| format!("Failed to connect: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Server returned status: {}", resp.status()));
        }

        let tags: OllamaTagsResponse = resp.json().await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        Ok(tags.models)
    }

    /// Send a chat message (non-streaming, returns full response)
    pub async fn chat(&self, request: &OllamaChatRequest) -> Result<OllamaChatResponse, String> {
        let url = format!("{}/api/chat", self.base_url);
        let mut req = request.clone();
        req.stream = Some(false);

        let resp = self.client.post(&url)
            .json(&req)
            .send()
            .await
            .map_err(|e| format!("Failed to send request: {}", e))?;

        if !resp.status().is_success() {
            let error_text = resp.text().await.unwrap_or_default();
            return Err(format!("Ollama error: {}", error_text));
        }

        resp.json().await
            .map_err(|e| format!("Failed to parse response: {}", e))
    }

    /// Send a chat message with streaming — collects chunks and returns them
    pub async fn chat_stream(&self, request: &OllamaChatRequest) -> Result<Vec<OllamaChatResponse>, String> {
        self.chat_stream_with_callback(request, |_| {}).await
    }

    /// Send a chat message with streaming and invoke callback for each parsed chunk
    pub async fn chat_stream_with_callback<F>(
        &self,
        request: &OllamaChatRequest,
        mut on_chunk: F,
    ) -> Result<Vec<OllamaChatResponse>, String>
    where
        F: FnMut(&OllamaChatResponse),
    {
        let url = format!("{}/api/chat", self.base_url);
        let mut req = request.clone();
        req.stream = Some(true);

        let resp = self.client.post(&url)
            .json(&req)
            .send()
            .await
            .map_err(|e| format!("Failed to send request: {}", e))?;

        if !resp.status().is_success() {
            let error_text = resp.text().await.unwrap_or_default();
            return Err(format!("Ollama error: {}", error_text));
        }

        let mut stream = resp.bytes_stream();
        let mut responses = Vec::new();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            // Process complete JSON lines
            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].trim().to_string();
                buffer = buffer[newline_pos + 1..].to_string();

                if line.is_empty() {
                    continue;
                }

                if let Ok(response) = serde_json::from_str::<OllamaChatResponse>(&line) {
                    on_chunk(&response);
                    responses.push(response);
                }
            }
        }

        // Process any remaining data in buffer
        let remaining = buffer.trim();
        if !remaining.is_empty() {
            if let Ok(response) = serde_json::from_str::<OllamaChatResponse>(remaining) {
                on_chunk(&response);
                responses.push(response);
            }
        }

        Ok(responses)
    }

    /// Generate a title for a conversation from the first message
    pub async fn generate_title(&self, model: &str, first_message: &str) -> Result<String, String> {
        let request = OllamaChatRequest {
            model: model.to_string(),
            messages: vec![OllamaChatMessage {
                role: "user".to_string(),
                content: format!(
                    "Generate a very short title (3-6 words, no quotes) for a conversation that starts with: {}",
                    &first_message[..first_message.len().min(200)]
                ),
                images: None,
            }],
            stream: Some(false),
            options: Some(OllamaOptions {
                temperature: Some(0.3),
                top_k: None,
                top_p: None,
                num_predict: Some(20),
            }),
        };

        let response = self.chat(&request).await?;
        let title = response.message
            .map(|m| m.content.trim().trim_matches('"').to_string())
            .unwrap_or_else(|| "New Conversation".to_string());

        Ok(title)
    }

    /// Pull (download) a model
    pub async fn pull_model(&self, model_name: &str) -> Result<String, String> {
        let url = format!("{}/api/pull", self.base_url);

        #[derive(Serialize)]
        struct PullRequest {
            name: String,
            stream: bool,
        }

        let resp = self.client.post(&url)
            .json(&PullRequest {
                name: model_name.to_string(),
                stream: false,
            })
            .send()
            .await
            .map_err(|e| format!("Failed to pull model: {}", e))?;

        if !resp.status().is_success() {
            let error_text = resp.text().await.unwrap_or_default();
            return Err(format!("Pull failed: {}", error_text));
        }

        Ok(format!("Successfully pulled {}", model_name))
    }

    /// Delete a model
    pub async fn delete_model(&self, model_name: &str) -> Result<(), String> {
        let url = format!("{}/api/delete", self.base_url);

        #[derive(Serialize)]
        struct DeleteRequest {
            name: String,
        }

        let resp = self.client.delete(&url)
            .json(&DeleteRequest {
                name: model_name.to_string(),
            })
            .send()
            .await
            .map_err(|e| format!("Failed to delete model: {}", e))?;

        if !resp.status().is_success() {
            let error_text = resp.text().await.unwrap_or_default();
            return Err(format!("Delete failed: {}", error_text));
        }

        Ok(())
    }

    /// Get model information
    pub async fn show_model(&self, model_name: &str) -> Result<serde_json::Value, String> {
        let url = format!("{}/api/show", self.base_url);

        #[derive(Serialize)]
        struct ShowRequest {
            name: String,
        }

        let resp = self.client.post(&url)
            .json(&ShowRequest {
                name: model_name.to_string(),
            })
            .send()
            .await
            .map_err(|e| format!("Failed to show model: {}", e))?;

        if !resp.status().is_success() {
            let error_text = resp.text().await.unwrap_or_default();
            return Err(format!("Show failed: {}", error_text));
        }

        resp.json().await
            .map_err(|e| format!("Failed to parse response: {}", e))
    }
}

/// Helper to convert app messages to Ollama format
pub fn messages_to_ollama(messages: &[Message], system_prompt: Option<&str>) -> Vec<OllamaChatMessage> {
    let mut ollama_messages = Vec::new();

    if let Some(prompt) = system_prompt {
        if !prompt.is_empty() {
            ollama_messages.push(OllamaChatMessage {
                role: "system".to_string(),
                content: prompt.to_string(),
                images: None,
            });
        }
    }

    for msg in messages {
        let role = match msg.role {
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::System => "system",
            MessageRole::Tool => "tool",
        };

        // Extract base64 image data from attachments
        let images: Vec<String> = msg.attachments.iter()
            .filter(|a| a.mime_type.starts_with("image/"))
            .map(|a| {
                use base64::Engine;
                base64::engine::general_purpose::STANDARD.encode(&a.data)
            })
            .collect();

        ollama_messages.push(OllamaChatMessage {
            role: role.to_string(),
            content: msg.content.clone(),
            images: if images.is_empty() { None } else { Some(images) },
        });
    }

    ollama_messages
}
