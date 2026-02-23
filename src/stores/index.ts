import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  Conversation,
  Message,
  ModelParameters,
  OllamaModel,
  Connection,
  Project,
  AppSettings,
  View,
} from '../types';
import { invoke } from '@tauri-apps/api/core';

// ─── Connection Store ───
interface ConnectionState {
  connections: Connection[];
  activeConnection: Connection | null;
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  setConnections: (connections: Connection[]) => void;
  addConnection: (conn: Connection) => void;
  removeConnection: (id: string) => void;
  testConnection: (host: string, port: number, useHttps: boolean) => Promise<boolean>;
  checkStatus: () => Promise<boolean>;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: [
    {
      id: uuidv4(),
      name: 'Local Ollama',
      host: 'localhost',
      port: 11434,
      useHttps: false,
      isDefault: true,
      createdAt: new Date().toISOString(),
    },
  ],
  activeConnection: null,
  isConnected: false,
  isConnecting: false,
  connectionError: null,

  setConnections: (connections) => set({ connections }),

  addConnection: (conn) =>
    set((state) => ({ connections: [...state.connections, conn] })),

  removeConnection: (id) =>
    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
    })),

  testConnection: async (host, port, useHttps) => {
    set({ isConnecting: true, connectionError: null });
    try {
      const result = await invoke<boolean>('test_connection', {
        host,
        port,
        useHttps,
      });
      set({
        isConnected: result,
        isConnecting: false,
        activeConnection: get().connections.find(
          (c) => c.host === host && c.port === port
        ) ?? null,
      });
      return result;
    } catch (error) {
      set({
        isConnected: false,
        isConnecting: false,
        connectionError: String(error),
      });
      return false;
    }
  },

  checkStatus: async () => {
    try {
      const result = await invoke<boolean>('get_connection_status');
      set({ isConnected: result });
      return result;
    } catch {
      set({ isConnected: false });
      return false;
    }
  },
}));

// ─── Model Store ───
interface ModelState {
  models: OllamaModel[];
  selectedModel: string | null;
  isLoading: boolean;
  error: string | null;
  fetchModels: () => Promise<void>;
  setSelectedModel: (model: string) => void;
  pullModel: (name: string) => Promise<string>;
  deleteModel: (name: string) => Promise<void>;
}

export const useModelStore = create<ModelState>((set) => ({
  models: [],
  selectedModel: null,
  isLoading: false,
  error: null,

  fetchModels: async () => {
    set({ isLoading: true, error: null });
    try {
      const models = await invoke<OllamaModel[]>('list_models');
      set({ models, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  setSelectedModel: (model) => set({ selectedModel: model }),

  pullModel: async (name) => {
    const result = await invoke<string>('pull_model', { modelName: name });
    return result;
  },

  deleteModel: async (name) => {
    await invoke<void>('delete_model', { modelName: name });
  },
}));

// ─── Chat Store ───
interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isSending: boolean;
  isStreaming: boolean;
  createConversation: (modelName: string, projectId?: string) => string;
  setActiveConversation: (id: string | null) => void;
  deleteConversation: (id: string) => void;
  sendMessage: (content: string, attachments?: File[]) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => void;
  updateConversationModel: (id: string, model: string) => void;
  updateConversationParams: (id: string, params: ModelParameters) => void;
  updateSystemPrompt: (id: string, prompt: string) => void;
  toggleToolCalling: (id: string) => void;
  getActiveConversation: () => Conversation | undefined;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  isSending: false,
  isStreaming: false,

  createConversation: (modelName, projectId) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id,
      title: 'New Conversation',
      modelName,
      messages: [],
      createdAt: now,
      updatedAt: now,
      parameters: { temperature: 0.7, topK: 40, topP: 0.9 },
      projectId,
      toolCallingEnabled: false,
    };
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: id,
    }));
    return id;
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),

  deleteConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversationId:
        state.activeConversationId === id ? null : state.activeConversationId,
    })),

  sendMessage: async (content, _attachments) => {
    const state = get();
    const conv = state.conversations.find(
      (c) => c.id === state.activeConversationId
    );
    if (!conv) return;

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      isError: false,
      attachments: [],
      toolCalls: [],
      status: 'sent',
    };

    // Add user message
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conv.id
          ? { ...c, messages: [...c.messages, userMessage], updatedAt: new Date().toISOString() }
          : c
      ),
      isSending: true,
    }));

    try {
      // Build messages for API
      const allMessages = [...conv.messages, userMessage].map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        model_name: m.modelName ?? null,
        is_error: m.isError,
        token_count: m.tokenCount ?? null,
        attachments: [],
        tool_calls: [],
        status: m.status,
        status_message: m.statusMessage ?? null,
      }));

      const result = await invoke<{ content: string; eval_count?: number; total_duration?: number }>('send_message', {
        model: conv.modelName,
        messages: allMessages,
        systemPrompt: conv.systemPrompt ?? null,
        parameters: {
          temperature: conv.parameters.temperature,
          top_k: conv.parameters.topK ?? null,
          top_p: conv.parameters.topP ?? null,
          max_tokens: conv.parameters.maxTokens ?? null,
        },
        stream: false,
      });

      const assistantMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: result.content,
        timestamp: new Date().toISOString(),
        modelName: conv.modelName,
        isError: false,
        tokenCount: result.eval_count,
        attachments: [],
        toolCalls: [],
        status: 'sent',
      };

      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === conv.id
            ? { ...c, messages: [...c.messages, assistantMessage], updatedAt: new Date().toISOString() }
            : c
        ),
        isSending: false,
      }));

      // Auto-generate title for first message
      if (conv.messages.length === 0) {
        try {
          const title = await invoke<string>('generate_title', {
            model: conv.modelName,
            firstMessage: content,
          });
          set((s) => ({
            conversations: s.conversations.map((c) =>
              c.id === conv.id ? { ...c, title } : c
            ),
          }));
        } catch {
          // Title generation is non-critical
        }
      }
    } catch (error) {
      const errorMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: `Error: ${String(error)}`,
        timestamp: new Date().toISOString(),
        isError: true,
        attachments: [],
        toolCalls: [],
        status: 'failed',
      };

      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === conv.id
            ? { ...c, messages: [...c.messages, errorMessage], updatedAt: new Date().toISOString() }
            : c
        ),
        isSending: false,
      }));
    }
  },

  updateConversationTitle: (id, title) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    })),

  updateConversationModel: (id, model) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, modelName: model } : c
      ),
    })),

  updateConversationParams: (id, params) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, parameters: params } : c
      ),
    })),

  updateSystemPrompt: (id, prompt) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, systemPrompt: prompt } : c
      ),
    })),

  toggleToolCalling: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, toolCallingEnabled: !c.toolCallingEnabled } : c
      ),
    })),

  getActiveConversation: () => {
    const state = get();
    return state.conversations.find((c) => c.id === state.activeConversationId);
  },
}));

// ─── Project Store ───
interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  createProject: (name: string, description?: string) => string;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProjectId: null,

  createProject: (name, description) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    const project: Project = {
      id,
      name,
      description,
      color: '#6366f1',
      icon: 'folder',
      createdAt: now,
      updatedAt: now,
      isPinned: false,
    };
    set((state) => ({ projects: [...state.projects, project] }));
    return id;
  },

  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
      ),
    })),

  deleteProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
    })),

  setActiveProject: (id) => set({ activeProjectId: id }),
}));

// ─── Settings Store ───
interface SettingsState {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  updateToolConfig: (updates: Partial<AppSettings['toolConfig']>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: {
    theme: 'system',
    developerMode: false,
    toolConfig: {
      enabled: true,
      webSearchEnabled: false,
      maxSearchResults: 5,
      cacheSearchResults: true,
      maxToolCalls: 10,
    },
  },

  updateSettings: (updates) =>
    set((state) => ({
      settings: { ...state.settings, ...updates },
    })),

  updateToolConfig: (updates) =>
    set((state) => ({
      settings: {
        ...state.settings,
        toolConfig: { ...state.settings.toolConfig, ...updates },
      },
    })),
}));

// ─── UI Store ───
interface UIState {
  currentView: View;
  sidebarOpen: boolean;
  sidebarWidth: number;
  setView: (view: View) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentView: 'chat',
  sidebarOpen: true,
  sidebarWidth: 280,
  setView: (view) => set({ currentView: view }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
}));
