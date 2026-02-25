// Types mirroring the Rust models for the frontend

export interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  useHttps: boolean;
  isDefault: boolean;
  createdAt: string;
  lastConnectedAt?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  modelName?: string;
  isError: boolean;
  tokenCount?: number;
  attachments: Attachment[];
  toolCalls: ToolCall[];
  status: 'sent' | 'sending' | 'queued' | 'failed' | 'draft';
  statusMessage?: string;
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  data: number[];
  size: number;
}

export interface ToolCall {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: ToolResult;
  errorMessage?: string;
  executionTimeMs?: number;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  summary?: string;
}

export interface Conversation {
  id: string;
  title: string;
  modelName: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  systemPrompt?: string;
  parameters: ModelParameters;
  projectId?: string;
  toolCallingEnabled: boolean;
}

export interface ModelParameters {
  temperature: number;
  topK?: number;
  topP?: number;
  maxTokens?: number;
}

export const PARAMETER_PRESETS: Record<string, ModelParameters> = {
  balanced: { temperature: 0.7, topK: 40, topP: 0.9 },
  creative: { temperature: 1.2, topK: 80, topP: 0.95 },
  precise: { temperature: 0.2, topK: 10, topP: 0.5 },
  code: { temperature: 0.1, topK: 5, topP: 0.3 },
};

export interface Project {
  id: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  instructions?: string;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  isPinned: boolean;
}

export interface OllamaModel {
  name: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: OllamaModelDetails;
}

export interface OllamaModelDetails {
  format?: string;
  family?: string;
  families?: string[];
  parameter_size?: string;
  quantization_level?: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  defaultModel?: string;
  defaultConnectionId?: string;
  toolConfig: ToolConfig;
  developerMode: boolean;
}

export interface ToolConfig {
  enabled: boolean;
  maxToolCalls: number;
}

export interface CloudProvider {
  id: string;
  name: string;
  providerType: 'openai' | 'anthropic' | 'google';
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
  models: CloudModel[];
}

export interface CloudModel {
  id: string;
  name: string;
  maxContext: number;
  supportsVision: boolean;
  supportsTools: boolean;
  inputCostPer1k: number;
  outputCostPer1k: number;
}

export interface ComparisonResult {
  model1: {
    name: string;
    content: string;
    duration_ms: number;
  };
  model2: {
    name: string;
    content: string;
    duration_ms: number;
  };
}

export type View = 'chat' | 'settings' | 'projects' | 'project' | 'comparison' | 'models';
