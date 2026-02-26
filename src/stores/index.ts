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
  SyncConfig,
  View,
} from '../types';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LazyStore } from '@tauri-apps/plugin-store';

type PersistedState = {
  version: number;
  connection: {
    connections: Connection[];
    activeConnectionId: string | null;
  };
  model: {
    selectedModel: string | null;
  };
  chat: {
    conversations: Conversation[];
    activeConversationId: string | null;
  };
  project: {
    projects: Project[];
    activeProjectId: string | null;
  };
  settings: {
    settings: AppSettings;
  };
  ui: {
    currentView: View;
    sidebarOpen: boolean;
    sidebarWidth: number;
  };
};

type ChatStreamChunkEvent = {
  requestId: string;
  content: string;
  done: boolean;
  evalCount?: number;
  totalDuration?: number;
  error?: string;
};

const appStore = new LazyStore('app-state.json');
const CURRENT_PERSISTENCE_VERSION = 1;

let hasHydrated = false;
let subscriptionsInitialized = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let streamListenerInitialized = false;

const activeStreams = new Map<string, { conversationId: string; assistantMessageId: string; modelName: string }>();
const streamsWithChunks = new Set<string>();

const schedulePersist = () => {
  if (!hasHydrated) return;

  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistState();
  }, 200);
};

const persistState = async () => {
  try {
    const connectionState = useConnectionStore.getState();
    const modelState = useModelStore.getState();
    const chatState = useChatStore.getState();
    const projectState = useProjectStore.getState();
    const settingsState = useSettingsStore.getState();
    const uiState = useUIStore.getState();

    const payload: PersistedState = {
      version: CURRENT_PERSISTENCE_VERSION,
      connection: {
        connections: connectionState.connections,
        activeConnectionId: connectionState.activeConnection?.id ?? null,
      },
      model: {
        selectedModel: modelState.selectedModel,
      },
      chat: {
        conversations: chatState.conversations,
        activeConversationId: chatState.activeConversationId,
      },
      project: {
        projects: projectState.projects,
        activeProjectId: projectState.activeProjectId,
      },
      settings: {
        settings: settingsState.settings,
      },
      ui: {
        currentView: uiState.currentView,
        sidebarOpen: uiState.sidebarOpen,
        sidebarWidth: uiState.sidebarWidth,
      },
    };

    await appStore.set('state', payload);
    await appStore.save();
  } catch {
    // Non-fatal persistence failure
  }
};

const initPersistenceSubscriptions = () => {
  if (subscriptionsInitialized) return;
  subscriptionsInitialized = true;

  useConnectionStore.subscribe(() => schedulePersist());
  useModelStore.subscribe(() => schedulePersist());
  useChatStore.subscribe(() => schedulePersist());
  useProjectStore.subscribe(() => schedulePersist());
  useSettingsStore.subscribe(() => schedulePersist());
  useUIStore.subscribe(() => schedulePersist());
};

const initStreamingListener = () => {
  if (streamListenerInitialized) return;
  streamListenerInitialized = true;

  void listen<ChatStreamChunkEvent>('chat_stream_chunk', (event) => {
    const payload = event.payload;
    const stream = activeStreams.get(payload.requestId);
    if (!stream) return;

    if (payload.content) {
      streamsWithChunks.add(payload.requestId);
      useChatStore.setState((state) => ({
        conversations: state.conversations.map((conversation) => {
          if (conversation.id !== stream.conversationId) return conversation;
          return {
            ...conversation,
            updatedAt: new Date().toISOString(),
            messages: conversation.messages.map((message) =>
              message.id === stream.assistantMessageId
                ? {
                    ...message,
                    content: `${message.content}${payload.content}`,
                    status: 'sending',
                  }
                : message
            ),
          };
        }),
      }));
    }

    if (payload.done || payload.error) {
      useChatStore.setState((state) => ({
        conversations: state.conversations.map((conversation) => {
          if (conversation.id !== stream.conversationId) return conversation;
          return {
            ...conversation,
            updatedAt: new Date().toISOString(),
            messages: conversation.messages.map((message) =>
              message.id === stream.assistantMessageId
                ? {
                    ...message,
                    modelName: stream.modelName,
                    tokenCount: payload.evalCount,
                    status: payload.error ? 'failed' : 'sent',
                    isError: Boolean(payload.error),
                    content: payload.error ? `Error: ${payload.error}` : message.content,
                  }
                : message
            ),
          };
        }),
        sendingConversationIds: (() => { const ns = new Set(state.sendingConversationIds); ns.delete(stream.conversationId); return ns; })(),
        streamingConversationIds: (() => { const ns = new Set(state.streamingConversationIds); ns.delete(stream.conversationId); return ns; })(),
      }));

      activeStreams.delete(payload.requestId);
      streamsWithChunks.delete(payload.requestId);
    }
  });
};

export async function hydratePersistedState(): Promise<void> {
  initPersistenceSubscriptions();
  initStreamingListener();

  if (hasHydrated) return;

  try {
    const persisted = await appStore.get<PersistedState>('state');
    if (!persisted || persisted.version !== CURRENT_PERSISTENCE_VERSION) {
      hasHydrated = true;
      return;
    }

    useConnectionStore.setState((state) => {
      const connections = persisted.connection.connections?.length
        ? persisted.connection.connections
        : state.connections;
      const activeConnection =
        connections.find((connection: Connection) => connection.id === persisted.connection.activeConnectionId) ?? null;
      return {
        ...state,
        connections,
        activeConnection,
      };
    });

    useModelStore.setState((state) => ({
      ...state,
      selectedModel: persisted.model.selectedModel,
    }));

    useChatStore.setState((state) => ({
      ...state,
      conversations: persisted.chat.conversations ?? [],
      activeConversationId: persisted.chat.activeConversationId,
    }));

    useProjectStore.setState((state) => ({
      ...state,
      projects: persisted.project.projects ?? [],
      activeProjectId: persisted.project.activeProjectId,
    }));

    useSettingsStore.setState((state) => ({
      ...state,
      settings: {
        ...state.settings,
        ...persisted.settings.settings,
        // Ensure new fields always have defaults when loading old persisted state
        syncConfig: persisted.settings.settings.syncConfig ?? state.settings.syncConfig,
      },
    }));

    // Auto-start sync server if it was enabled
    const syncConfig = persisted.settings.settings.syncConfig;
    if (syncConfig?.enabled) {
      void useSyncStore.getState().startServer(syncConfig).catch(() => {/* non-fatal */});
    }

    useUIStore.setState((state) => ({
      ...state,
      currentView: persisted.ui.currentView,
      sidebarOpen: persisted.ui.sidebarOpen,
      sidebarWidth: persisted.ui.sidebarWidth,
    }));
  } catch {
    // Non-fatal hydration failure
  } finally {
    hasHydrated = true;
  }
}

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
  updateConnection: (id: string, updates: Partial<Connection>) => void;
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

  updateConnection: (id, updates) =>
    set((state) => ({
      connections: state.connections.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
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
  sendingConversationIds: Set<string>;
  streamingConversationIds: Set<string>;
  isConversationSending: (id: string) => boolean;
  createConversation: (modelName: string, projectId?: string) => string;
  setActiveConversation: (id: string | null) => void;
  deleteConversation: (id: string) => void;
  sendMessage: (content: string, attachments?: File[]) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => void;
  updateConversationModel: (id: string, model: string) => void;
  updateConversationParams: (id: string, params: ModelParameters) => void;
  updateSystemPrompt: (id: string, prompt: string) => void;
  stopResponse: (conversationId: string) => void;
  toggleToolCalling: (id: string) => void;
  getActiveConversation: () => Conversation | undefined;
  exportConversations: () => Promise<void>;
  importConversations: () => Promise<{ imported: number; skipped: number }>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  sendingConversationIds: new Set<string>(),
  streamingConversationIds: new Set<string>(),

  isConversationSending: (id) => {
    return get().sendingConversationIds.has(id);
  },

  createConversation: (modelName, projectId) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    const projectStore = useProjectStore.getState();
    const project = projectId ? projectStore.projects.find(p => p.id === projectId) : undefined;
    // Combine project system prompt and instructions
    let systemPrompt = project?.systemPrompt;
    if (project?.instructions) {
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n## Instructions\n${project.instructions}`
        : project.instructions;
    }
    const conversation: Conversation = {
      id,
      title: 'New Conversation',
      modelName,
      messages: [],
      createdAt: now,
      updatedAt: now,
      parameters: { temperature: 0.7, topK: 40, topP: 0.9 },
      systemPrompt,
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

  sendMessage: async (content, attachments) => {
    initStreamingListener();

    const state = get();
    const conv = state.conversations.find(
      (c) => c.id === state.activeConversationId
    );
    if (!conv) return;

    const requestId = uuidv4();
    const assistantMessageId = uuidv4();

    // Convert File objects to Attachment format for image attachments
    const messageAttachments: import('../types').Attachment[] = [];
    if (attachments && attachments.length > 0) {
      for (const file of attachments) {
        const arrayBuffer = await file.arrayBuffer();
        const data = Array.from(new Uint8Array(arrayBuffer));
        messageAttachments.push({
          id: uuidv4(),
          name: file.name,
          mimeType: file.type,
          data,
          size: file.size,
        });
      }
    }

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      isError: false,
      attachments: messageAttachments,
      toolCalls: [],
      status: 'sent',
    };

    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      modelName: conv.modelName,
      isError: false,
      attachments: [],
      toolCalls: [],
      status: 'sending',
    };

    // Add user message
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conv.id
          ? {
              ...c,
              messages: [...c.messages, userMessage, assistantMessage],
              updatedAt: new Date().toISOString(),
            }
          : c
      ),
      sendingConversationIds: new Set([...s.sendingConversationIds, conv.id]),
      streamingConversationIds: new Set([...s.streamingConversationIds, conv.id]),
    }));

    activeStreams.set(requestId, {
      conversationId: conv.id,
      assistantMessageId,
      modelName: conv.modelName,
    });

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
        attachments: m.attachments.map((a) => ({
          id: a.id,
          name: a.name,
          mime_type: a.mimeType,
          data: a.data,
          size: a.size,
        })),
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
        stream: true,
        requestId,
      });

      const streamedAnyChunks = streamsWithChunks.has(requestId);
      if (!streamedAnyChunks) {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conv.id
              ? {
                  ...c,
                  updatedAt: new Date().toISOString(),
                  messages: c.messages.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          content: result.content,
                          status: 'sent',
                          tokenCount: result.eval_count,
                        }
                      : m
                  ),
                }
              : c
          ),
          sendingConversationIds: (() => { const ns = new Set(s.sendingConversationIds); ns.delete(conv.id); return ns; })(),
          streamingConversationIds: (() => { const ns = new Set(s.streamingConversationIds); ns.delete(conv.id); return ns; })(),
        }));
      }

      activeStreams.delete(requestId);
      streamsWithChunks.delete(requestId);

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
            ? {
                ...c,
                updatedAt: new Date().toISOString(),
                messages: c.messages.map((m) =>
                  m.id === assistantMessageId ? errorMessage : m
                ),
              }
            : c
        ),
        sendingConversationIds: (() => { const ns = new Set(s.sendingConversationIds); ns.delete(conv.id); return ns; })(),
        streamingConversationIds: (() => { const ns = new Set(s.streamingConversationIds); ns.delete(conv.id); return ns; })(),
      }));

      activeStreams.delete(requestId);
      streamsWithChunks.delete(requestId);
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

  stopResponse: (conversationId) => {
    for (const [requestId, stream] of activeStreams.entries()) {
      if (stream.conversationId === conversationId) {
        activeStreams.delete(requestId);
        streamsWithChunks.delete(requestId);
        break;
      }
    }

    set((s) => {
      const newSending = new Set(s.sendingConversationIds);
      newSending.delete(conversationId);
      const newStreaming = new Set(s.streamingConversationIds);
      newStreaming.delete(conversationId);

      return {
        conversations: s.conversations.map((c) => {
          if (c.id !== conversationId) return c;
          return {
            ...c,
            updatedAt: new Date().toISOString(),
            messages: c.messages.map((m) =>
              m.status === 'sending'
                ? { ...m, status: 'sent' as const }
                : m
            ),
          };
        }),
        sendingConversationIds: newSending,
        streamingConversationIds: newStreaming,
      };
    });
  },

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

  exportConversations: async () => {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');

    const state = get();
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      conversations: state.conversations,
    };

    const filePath = await save({
      defaultPath: `chat-history-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });

    if (filePath) {
      await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
    }
  },

  importConversations: async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');

    const filePath = await open({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      multiple: false,
    });

    if (filePath && typeof filePath === 'string') {
      const content = await readTextFile(filePath);
      const importData = JSON.parse(content);

      if (!importData.conversations || !Array.isArray(importData.conversations)) {
        throw new Error('Invalid chat history file');
      }

      const existingIds = new Set(get().conversations.map(c => c.id));
      const newConversations = importData.conversations.filter(
        (c: any) => c && c.id && c.title && c.messages && !existingIds.has(c.id)
      );
      
      if (newConversations.length > 0) {
        set((s) => ({
          conversations: [...newConversations, ...s.conversations],
        }));
      }
      
      const skipped = importData.conversations.length - newConversations.length;
      return { imported: newConversations.length, skipped };
    }
    return { imported: 0, skipped: 0 };
  },
}));

// ─── Project Store ───
interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  createProject: (name: string, description?: string, systemPrompt?: string, instructions?: string) => string;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProjectId: null,

  createProject: (name, description, systemPrompt, instructions) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    const project: Project = {
      id,
      name,
      description,
      systemPrompt,
      instructions,
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

  deleteProject: (id) => {
    // Also unlink conversations from this project
    useChatStore.setState((s) => ({
      conversations: s.conversations.map((c) =>
        c.projectId === id ? { ...c, projectId: undefined } : c
      ),
    }));
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
    }));
  },

  setActiveProject: (id) => set({ activeProjectId: id }),
}));

// ─── Settings Store ───
interface SettingsState {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  updateToolConfig: (updates: Partial<AppSettings['toolConfig']>) => void;
  updateSyncConfig: (updates: Partial<SyncConfig>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: {
    theme: 'system',
    developerMode: false,
    toolConfig: {
      enabled: true,
      maxToolCalls: 10,
    },
    syncConfig: {
      enabled: false,
      port: 9876,
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

  updateSyncConfig: (updates) =>
    set((state) => ({
      settings: {
        ...state.settings,
        syncConfig: { ...state.settings.syncConfig, ...updates },
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

// ─── Tool Functions ───
export async function fetchWebpage(url: string): Promise<{ url: string; status: number; content_type: string; content: string; length: number }> {
  return invoke('fetch_webpage', { url });
}

// ─── Sync Store ───
interface SyncState {
  serverRunning: boolean;
  localIp: string | null;
  lastSyncedAt: string | null;
  startServer: (config: SyncConfig) => Promise<void>;
  stopServer: () => Promise<void>;
  refreshServerStatus: () => Promise<void>;
  fetchLocalIp: () => Promise<void>;
  pushDataToServer: () => Promise<void>;
}

let syncPushListener: (() => void) | null = null;

export const useSyncStore = create<SyncState>((set) => ({
  serverRunning: false,
  localIp: null,
  lastSyncedAt: null,

  startServer: async (config) => {
    try {
      await invoke('start_sync_server', { port: config.port, pin: config.pin ?? null });
      set({ serverRunning: true });
      // Push current data to server immediately
      await useSyncStore.getState().pushDataToServer();
      // Set up listener for push events from Android
      if (!syncPushListener) {
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten = await listen<{ conversations: Conversation[]; projects: Project[] }>(
          'sync_push_received',
          (event) => {
            mergeSyncPush(event.payload.conversations, event.payload.projects);
          }
        );
        syncPushListener = unlisten;
      }
    } catch (err) {
      throw new Error(`Failed to start sync server: ${String(err)}`);
    }
  },

  stopServer: async () => {
    await invoke('stop_sync_server');
    set({ serverRunning: false });
    if (syncPushListener) {
      syncPushListener();
      syncPushListener = null;
    }
  },

  refreshServerStatus: async () => {
    const running: boolean = await invoke('is_sync_server_running');
    set({ serverRunning: running });
  },

  fetchLocalIp: async () => {
    const ip: string = await invoke('get_local_ip');
    set({ localIp: ip });
  },

  pushDataToServer: async () => {
    const conversations = useChatStore.getState().conversations;
    const projects = useProjectStore.getState().projects;
    await invoke('update_sync_data', { conversations, projects });
  },
}));

// Subscribe chat/project stores to keep sync data up-to-date while server runs
const scheduleSyncDataPush = () => {
  const { serverRunning, pushDataToServer } = useSyncStore.getState();
  if (serverRunning) {
    void pushDataToServer();
  }
};

useChatStore.subscribe(scheduleSyncDataPush);
useProjectStore.subscribe(scheduleSyncDataPush);

// Merge conversations+projects pushed from Android into local state
function mergeSyncPush(incomingConvs: Conversation[], incomingProjects: Project[]) {
  if (incomingConvs.length > 0) {
    useChatStore.setState((state) => {
      const localMap = new Map(state.conversations.map((c) => [c.id, c]));
      for (const incoming of incomingConvs) {
        const local = localMap.get(incoming.id);
        if (!local || incoming.updatedAt > local.updatedAt) {
          // Union messages by ID (append-only)
          const localMsgIds = new Set(local?.messages.map((m) => m.id) ?? []);
          const mergedMessages = [
            ...(local?.messages ?? []),
            ...incoming.messages.filter((m) => !localMsgIds.has(m.id)),
          ];
          localMap.set(incoming.id, { ...incoming, messages: mergedMessages });
        }
      }
      return { conversations: Array.from(localMap.values()) };
    });
  }

  if (incomingProjects.length > 0) {
    useProjectStore.setState((state) => {
      const localMap = new Map(state.projects.map((p) => [p.id, p]));
      for (const incoming of incomingProjects) {
        const local = localMap.get(incoming.id);
        if (!local || incoming.updatedAt > local.updatedAt) {
          localMap.set(incoming.id, incoming);
        }
      }
      return { projects: Array.from(localMap.values()) };
    });
  }

  useSyncStore.setState({ lastSyncedAt: new Date().toISOString() });
}
