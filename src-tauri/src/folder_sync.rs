use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};

const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSyncStatus {
    pub schema_version: u32,
    pub base_path: String,
    pub conversation_count: usize,
    pub project_count: usize,
    pub active_conversation_id: Option<String>,
    pub active_project_id: Option<String>,
    pub last_written_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSyncSnapshot {
    pub schema_version: u32,
    pub base_path: String,
    pub conversations: Vec<PortableConversation>,
    pub projects: Vec<PortableProject>,
    pub active_conversation_id: Option<String>,
    pub active_project_id: Option<String>,
    pub last_written_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableConversation {
    pub id: String,
    pub title: String,
    pub model_name: String,
    pub backend_type: Option<String>,
    pub backend_session_id: Option<String>,
    pub messages: Vec<PortableMessage>,
    pub created_at: String,
    pub updated_at: String,
    pub system_prompt: Option<String>,
    pub parameters: PortableModelParameters,
    pub project_id: Option<String>,
    pub tool_calling_enabled: bool,
    pub restored_from_folder: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub timestamp: String,
    pub model_name: Option<String>,
    pub backend_type: Option<String>,
    pub is_error: bool,
    pub token_count: Option<u32>,
    pub attachments: Vec<PortableAttachment>,
    pub tool_calls: Vec<PortableToolCall>,
    pub status: String,
    pub status_message: Option<String>,
    pub reasoning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableAttachment {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub data: Vec<u8>,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableToolCall {
    pub id: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
    pub status: String,
    pub result: Option<PortableToolResult>,
    pub error_message: Option<String>,
    pub execution_time_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableToolResult {
    pub success: bool,
    pub data: serde_json::Value,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableModelParameters {
    pub temperature: f64,
    pub top_k: Option<u32>,
    pub top_p: Option<f64>,
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableProject {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub system_prompt: Option<String>,
    pub instructions: Option<String>,
    pub color: String,
    pub icon: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncMetaFile {
    schema_version: u32,
    app_version: String,
    last_written_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceStateFile {
    schema_version: u32,
    active_conversation_id: Option<String>,
    active_project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConversationMetaFile {
    schema_version: u32,
    id: String,
    title: String,
    model_name: String,
    backend_type: Option<String>,
    backend_session_id: Option<String>,
    created_at: String,
    updated_at: String,
    system_prompt: Option<String>,
    parameters: PortableModelParameters,
    project_id: Option<String>,
    tool_calling_enabled: bool,
    message_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConversationMessagesFile {
    schema_version: u32,
    conversation_id: String,
    messages: Vec<ConversationMessageFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConversationMessageFile {
    id: String,
    role: String,
    content: String,
    timestamp: String,
    model_name: Option<String>,
    backend_type: Option<String>,
    is_error: bool,
    token_count: Option<u32>,
    attachments: Vec<AttachmentReferenceFile>,
    tool_calls: Vec<PortableToolCall>,
    status: String,
    status_message: Option<String>,
    reasoning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentReferenceFile {
    id: String,
    name: String,
    mime_type: String,
    size: u64,
    storage_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFile {
    schema_version: u32,
    project: PortableProject,
}

pub fn prepare_folder_sync(base_path: String) -> Result<FolderSyncStatus, String> {
    let root = ensure_root(&base_path)?;
    ensure_layout(&root)?;
    if !root.join("sync-meta.json").exists() {
        let now = Utc::now().to_rfc3339();
        write_json(
            &root.join("sync-meta.json"),
            &SyncMetaFile {
                schema_version: SCHEMA_VERSION,
                app_version: env!("CARGO_PKG_VERSION").to_string(),
                last_written_at: now,
            },
        )?;
    }
    if !root.join("workspace-state.json").exists() {
        write_json(
            &root.join("workspace-state.json"),
            &WorkspaceStateFile {
                schema_version: SCHEMA_VERSION,
                active_conversation_id: None,
                active_project_id: None,
            },
        )?;
    }
    let snapshot = load_folder_sync_snapshot(base_path)?;
    Ok(snapshot_to_status(&snapshot))
}

pub fn save_folder_sync_snapshot(
    base_path: String,
    snapshot: FolderSyncSnapshot,
) -> Result<FolderSyncStatus, String> {
    let root = ensure_root(&base_path)?;
    ensure_layout(&root)?;

    let conversations_root = root.join("conversations");
    let projects_root = root.join("projects");

    let expected_conversation_dirs = snapshot
        .conversations
        .iter()
        .map(|conversation| sanitize_path_segment(&conversation.id))
        .collect::<HashSet<_>>();
    cleanup_extra_directories(&conversations_root, &expected_conversation_dirs)?;

    let expected_project_files = snapshot
        .projects
        .iter()
        .map(|project| format!("{}.json", sanitize_path_segment(&project.id)))
        .collect::<HashSet<_>>();
    cleanup_extra_files(&projects_root, &expected_project_files)?;

    for project in &snapshot.projects {
        let project_path =
            projects_root.join(format!("{}.json", sanitize_path_segment(&project.id)));
        write_json(
            &project_path,
            &ProjectFile {
                schema_version: SCHEMA_VERSION,
                project: project.clone(),
            },
        )?;
    }

    for conversation in &snapshot.conversations {
        let conversation_dir = conversations_root.join(sanitize_path_segment(&conversation.id));
        ensure_layout(&conversation_dir)?;

        write_json(
            &conversation_dir.join("meta.json"),
            &ConversationMetaFile {
                schema_version: SCHEMA_VERSION,
                id: conversation.id.clone(),
                title: conversation.title.clone(),
                model_name: conversation.model_name.clone(),
                backend_type: conversation.backend_type.clone(),
                backend_session_id: conversation.backend_session_id.clone(),
                created_at: conversation.created_at.clone(),
                updated_at: conversation.updated_at.clone(),
                system_prompt: conversation.system_prompt.clone(),
                parameters: conversation.parameters.clone(),
                project_id: conversation.project_id.clone(),
                tool_calling_enabled: conversation.tool_calling_enabled,
                message_count: conversation.messages.len(),
            },
        )?;

        let attachments_dir = conversation_dir.join("attachments");
        if attachments_dir.exists() {
            fs::remove_dir_all(&attachments_dir).map_err(|error| {
                format!(
                    "Failed to clean attachments for conversation {}: {error}",
                    conversation.id
                )
            })?;
        }
        ensure_layout(&attachments_dir)?;

        let messages = conversation
            .messages
            .iter()
            .map(|message| {
                let attachments = message
                    .attachments
                    .iter()
                    .map(|attachment| {
                        let file_name = attachment_file_name(attachment);
                        let relative_path = format!("attachments/{file_name}");
                        fs::write(attachments_dir.join(&file_name), &attachment.data).map_err(
                            |error| {
                                format!(
                                    "Failed to write attachment {} for conversation {}: {error}",
                                    attachment.name, conversation.id
                                )
                            },
                        )?;

                        Ok(AttachmentReferenceFile {
                            id: attachment.id.clone(),
                            name: attachment.name.clone(),
                            mime_type: attachment.mime_type.clone(),
                            size: attachment.size,
                            storage_path: relative_path,
                        })
                    })
                    .collect::<Result<Vec<_>, String>>()?;

                Ok(ConversationMessageFile {
                    id: message.id.clone(),
                    role: message.role.clone(),
                    content: message.content.clone(),
                    timestamp: message.timestamp.clone(),
                    model_name: message.model_name.clone(),
                    backend_type: message.backend_type.clone(),
                    is_error: message.is_error,
                    token_count: message.token_count,
                    attachments,
                    tool_calls: message.tool_calls.clone(),
                    status: message.status.clone(),
                    status_message: message.status_message.clone(),
                    reasoning: message.reasoning.clone(),
                })
            })
            .collect::<Result<Vec<_>, String>>()?;

        write_json(
            &conversation_dir.join("messages.json"),
            &ConversationMessagesFile {
                schema_version: SCHEMA_VERSION,
                conversation_id: conversation.id.clone(),
                messages,
            },
        )?;
    }

    let now = Utc::now().to_rfc3339();
    write_json(
        &root.join("sync-meta.json"),
        &SyncMetaFile {
            schema_version: SCHEMA_VERSION,
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            last_written_at: now.clone(),
        },
    )?;
    write_json(
        &root.join("workspace-state.json"),
        &WorkspaceStateFile {
            schema_version: SCHEMA_VERSION,
            active_conversation_id: snapshot.active_conversation_id.clone(),
            active_project_id: snapshot.active_project_id.clone(),
        },
    )?;

    Ok(FolderSyncStatus {
        schema_version: SCHEMA_VERSION,
        base_path,
        conversation_count: snapshot.conversations.len(),
        project_count: snapshot.projects.len(),
        active_conversation_id: snapshot.active_conversation_id,
        active_project_id: snapshot.active_project_id,
        last_written_at: Some(now),
    })
}

pub fn load_folder_sync_snapshot(base_path: String) -> Result<FolderSyncSnapshot, String> {
    let root = ensure_root(&base_path)?;
    ensure_layout(&root)?;

    let conversations_root = root.join("conversations");
    let projects_root = root.join("projects");

    let meta = read_optional_json::<SyncMetaFile>(&root.join("sync-meta.json"))?;
    let workspace = read_optional_json::<WorkspaceStateFile>(&root.join("workspace-state.json"))?;

    let mut projects = read_project_files(&projects_root)?;
    projects.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    let mut conversations = read_conversation_directories(&conversations_root)?;
    conversations.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(FolderSyncSnapshot {
        schema_version: SCHEMA_VERSION,
        base_path,
        conversations,
        projects,
        active_conversation_id: workspace
            .as_ref()
            .and_then(|state| state.active_conversation_id.clone()),
        active_project_id: workspace
            .as_ref()
            .and_then(|state| state.active_project_id.clone()),
        last_written_at: meta.map(|value| value.last_written_at),
    })
}

fn snapshot_to_status(snapshot: &FolderSyncSnapshot) -> FolderSyncStatus {
    FolderSyncStatus {
        schema_version: snapshot.schema_version,
        base_path: snapshot.base_path.clone(),
        conversation_count: snapshot.conversations.len(),
        project_count: snapshot.projects.len(),
        active_conversation_id: snapshot.active_conversation_id.clone(),
        active_project_id: snapshot.active_project_id.clone(),
        last_written_at: snapshot.last_written_at.clone(),
    }
}

fn read_project_files(projects_root: &Path) -> Result<Vec<PortableProject>, String> {
    let mut projects = Vec::new();
    for entry in read_dir_sorted(projects_root)? {
        if !entry.path().is_file() {
            continue;
        }
        if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let project_file: ProjectFile = read_json(&entry.path())?;
        ensure_schema(project_file.schema_version, &entry.path())?;
        projects.push(project_file.project);
    }
    Ok(projects)
}

fn read_conversation_directories(
    conversations_root: &Path,
) -> Result<Vec<PortableConversation>, String> {
    let mut conversations = Vec::new();
    for entry in read_dir_sorted(conversations_root)? {
        if !entry.path().is_dir() {
            continue;
        }
        let conversation_dir = entry.path();
        let meta: ConversationMetaFile = read_json(&conversation_dir.join("meta.json"))?;
        ensure_schema(meta.schema_version, &conversation_dir.join("meta.json"))?;

        let messages_file: ConversationMessagesFile =
            read_json(&conversation_dir.join("messages.json"))?;
        ensure_schema(
            messages_file.schema_version,
            &conversation_dir.join("messages.json"),
        )?;

        let messages = messages_file
            .messages
            .into_iter()
            .map(|message| {
                let attachments = message
                    .attachments
                    .into_iter()
                    .map(|attachment| {
                        let attachment_path =
                            resolve_attachment_path(&conversation_dir, &attachment.storage_path)?;
                        let data = fs::read(&attachment_path).map_err(|error| {
                            format!(
                                "Failed to read attachment {} for conversation {}: {error}",
                                attachment.name, meta.id
                            )
                        })?;
                        Ok(PortableAttachment {
                            id: attachment.id,
                            name: attachment.name,
                            mime_type: attachment.mime_type,
                            data,
                            size: attachment.size,
                        })
                    })
                    .collect::<Result<Vec<_>, String>>()?;

                Ok(PortableMessage {
                    id: message.id,
                    role: message.role,
                    content: message.content,
                    timestamp: message.timestamp,
                    model_name: message.model_name,
                    backend_type: message.backend_type.or_else(|| meta.backend_type.clone()),
                    is_error: message.is_error,
                    token_count: message.token_count,
                    attachments,
                    tool_calls: message.tool_calls,
                    status: message.status,
                    status_message: message.status_message,
                    reasoning: message.reasoning,
                })
            })
            .collect::<Result<Vec<_>, String>>()?;

        conversations.push(PortableConversation {
            id: meta.id,
            title: meta.title,
            model_name: meta.model_name,
            backend_type: meta.backend_type,
            backend_session_id: meta.backend_session_id,
            messages,
            created_at: meta.created_at,
            updated_at: meta.updated_at,
            system_prompt: meta.system_prompt,
            parameters: meta.parameters,
            project_id: meta.project_id,
            tool_calling_enabled: meta.tool_calling_enabled,
            restored_from_folder: Some(true),
        });
    }
    Ok(conversations)
}

fn ensure_root(base_path: &str) -> Result<PathBuf, String> {
    let trimmed = base_path.trim();
    if trimmed.is_empty() {
        return Err("Folder sync path is required.".to_string());
    }
    Ok(PathBuf::from(trimmed))
}

fn ensure_layout(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("Failed to create {}: {error}", path.display()))
}

fn cleanup_extra_directories(root: &Path, expected_names: &HashSet<String>) -> Result<(), String> {
    for entry in read_dir_sorted(root)? {
        if !entry.path().is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if !expected_names.contains(&name) {
            fs::remove_dir_all(entry.path()).map_err(|error| {
                format!(
                    "Failed to remove stale directory {}: {error}",
                    entry.path().display()
                )
            })?;
        }
    }
    Ok(())
}

fn cleanup_extra_files(root: &Path, expected_names: &HashSet<String>) -> Result<(), String> {
    for entry in read_dir_sorted(root)? {
        if !entry.path().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if !expected_names.contains(&name) {
            fs::remove_file(entry.path()).map_err(|error| {
                format!(
                    "Failed to remove stale file {}: {error}",
                    entry.path().display()
                )
            })?;
        }
    }
    Ok(())
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Missing parent directory for {}", path.display()))?;
    ensure_layout(parent)?;
    let temp_path = path.with_extension("tmp");
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Failed to serialize {}: {error}", path.display()))?;
    fs::write(&temp_path, bytes)
        .map_err(|error| format!("Failed to write {}: {error}", temp_path.display()))?;
    fs::rename(&temp_path, path)
        .map_err(|error| format!("Failed to finalize {}: {error}", path.display()))
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse {}: {error}", path.display()))
}

fn read_optional_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }
    read_json(path).map(Some)
}

fn ensure_schema(version: u32, path: &Path) -> Result<(), String> {
    if version != SCHEMA_VERSION {
        return Err(format!(
            "Unsupported schema version {} in {}. Expected {}.",
            version,
            path.display(),
            SCHEMA_VERSION
        ));
    }
    Ok(())
}

fn read_dir_sorted(path: &Path) -> Result<Vec<fs::DirEntry>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let mut entries = fs::read_dir(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to list {}: {error}", path.display()))?;
    entries.sort_by_key(|entry| entry.file_name());
    Ok(entries)
}

fn attachment_file_name(attachment: &PortableAttachment) -> String {
    let sanitized_name = sanitize_path_segment(&attachment.name);
    if sanitized_name.is_empty() {
        format!("{}-attachment.bin", sanitize_path_segment(&attachment.id))
    } else {
        format!("{}-{sanitized_name}", sanitize_path_segment(&attachment.id))
    }
}

fn sanitize_path_segment(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '-' | '_' => character,
            _ => '_',
        })
        .collect::<String>()
        .trim_matches('_')
        .chars()
        .take(120)
        .collect()
}

fn resolve_attachment_path(conversation_dir: &Path, storage_path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(storage_path);
    if relative.is_absolute() {
        return Err("Attachment paths must be relative.".to_string());
    }
    if relative.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(format!(
            "Attachment path contains unsafe traversal: {storage_path}"
        ));
    }
    let full_path = conversation_dir.join(relative);
    if !full_path.starts_with(conversation_dir.join("attachments")) {
        return Err(format!(
            "Attachment path must stay within the attachments directory: {storage_path}"
        ));
    }
    Ok(full_path)
}
