import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  Send,
  Loader2,
  Copy,
  Check,
  Trash2,
  Bot,
  User,
  Settings2,
  Image,
  Wrench,
  Square,
} from 'lucide-react';
import { useChatStore, useModelStore, useConnectionStore } from '../../stores';
import { formatTime, supportsVision, supportsTools } from '../../utils/format';
import type { Message, ModelParameters } from '../../types';
import { PARAMETER_PRESETS } from '../../types';
import TextareaAutosize from 'react-textarea-autosize';

export function ChatView() {
  const {
    activeConversationId,
    conversations,
    sendingConversationIds,
    streamingConversationIds,
    sendMessage,
    stopResponse,
    updateConversationModel,
    deleteConversation,
    toggleToolCalling,
  } = useChatStore();

  const { models } = useModelStore();
  const { isConnected } = useConnectionStore();
  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const isSending = activeConv ? sendingConversationIds.has(activeConv.id) : false;
  const isStreaming = activeConv ? streamingConversationIds.has(activeConv.id) : false;
  const modelSupportsVision = activeConv ? supportsVision(activeConv.modelName) : false;
  const modelSupportsTools = activeConv ? supportsTools(activeConv.modelName) : false;

  if (!activeConv) {
    return <EmptyState />;
  }

  return (
    <div className="chat-view">
      <ChatHeader
        conversation={activeConv}
        models={models.map((m) => m.name)}
        onModelChange={(model) => updateConversationModel(activeConv.id, model)}
        onDelete={() => deleteConversation(activeConv.id)}
      />
      <MessageList messages={activeConv.messages} isLoading={isSending} />
      <ChatInput
        onSend={sendMessage}
        isDisabled={isSending || !isConnected}
        isSending={isSending}
        isStreaming={isStreaming}
        onStop={() => activeConv && stopResponse(activeConv.id)}
        supportsVision={modelSupportsVision}
        supportsTools={modelSupportsTools}
        toolCallingEnabled={activeConv.toolCallingEnabled}
        onToggleToolCalling={() => toggleToolCalling(activeConv.id)}
      />
    </div>
  );
}

function EmptyState() {
  const { createConversation } = useChatStore();
  const { models, selectedModel } = useModelStore();
  const { isConnected } = useConnectionStore();

  return (
    <div className="empty-state">
      <div className="empty-state-content">
        <Bot size={64} strokeWidth={1} />
        <h2>Private Chat Hub</h2>
        <p>Universal AI Chat Platform for Desktop</p>
        {isConnected ? (
          <button
            className="btn btn-primary"
            onClick={() => createConversation(selectedModel || models[0]?.name || 'llama3')}
            disabled={models.length === 0}
          >
            Start a New Conversation
          </button>
        ) : (
          <p className="text-muted">Connect to an Ollama server to begin</p>
        )}
      </div>
    </div>
  );
}

function ChatHeader({
  conversation,
  models,
  onModelChange,
  onDelete,
}: {
  conversation: {
    id: string;
    title: string;
    modelName: string;
    parameters: ModelParameters;
    systemPrompt?: string;
  };
  models: string[];
  onModelChange: (model: string) => void;
  onDelete: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="chat-header">
      <div className="chat-header-left">
        <h3 className="chat-title">{conversation.title}</h3>
      </div>
      <div className="chat-header-right">
        <select
          className="model-select"
          value={conversation.modelName}
          onChange={(e) => onModelChange(e.target.value)}
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          className="btn btn-icon"
          onClick={() => setShowSettings(!showSettings)}
          title="Conversation settings"
        >
          <Settings2 size={18} />
        </button>
        <button className="btn btn-icon btn-danger" onClick={onDelete} title="Delete conversation">
          <Trash2 size={18} />
        </button>
      </div>
      {showSettings && (
        <ConversationSettings
          conversation={conversation}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function ConversationSettings({
  conversation,
  onClose,
}: {
  conversation: {
    id: string;
    parameters: ModelParameters;
    systemPrompt?: string;
  };
  onClose: () => void;
}) {
  const { updateConversationParams, updateSystemPrompt } = useChatStore();
  const [params, setParams] = useState(conversation.parameters);
  const [prompt, setPrompt] = useState(conversation.systemPrompt || '');

  return (
    <div className="conv-settings-panel">
      <div className="conv-settings-header">
        <h4>Conversation Settings</h4>
        <button className="btn btn-icon" onClick={onClose}>&times;</button>
      </div>

      <div className="settings-section">
        <label>System Prompt</label>
        <textarea
          className="input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onBlur={() => updateSystemPrompt(conversation.id, prompt)}
          rows={3}
          placeholder="You are a helpful assistant..."
        />
      </div>

      <div className="settings-section">
        <label>Presets</label>
        <div className="preset-buttons">
          {Object.entries(PARAMETER_PRESETS).map(([name, preset]) => (
            <button
              key={name}
              className={`btn btn-sm ${params.temperature === preset.temperature ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setParams(preset);
                updateConversationParams(conversation.id, preset);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <label>Temperature: {params.temperature.toFixed(1)}</label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={params.temperature}
          onChange={(e) => {
            const newParams = { ...params, temperature: parseFloat(e.target.value) };
            setParams(newParams);
            updateConversationParams(conversation.id, newParams);
          }}
        />
      </div>

      <div className="settings-section">
        <label>Max Tokens</label>
        <input
          type="number"
          className="input"
          value={params.maxTokens || ''}
          placeholder="Unlimited"
          onChange={(e) => {
            const val = e.target.value ? parseInt(e.target.value) : undefined;
            const newParams = { ...params, maxTokens: val };
            setParams(newParams);
            updateConversationParams(conversation.id, newParams);
          }}
        />
      </div>
    </div>
  );
}

function MessageList({
  messages,
  isLoading,
}: {
  messages: Message[];
  isLoading: boolean;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isLoading && (
        <div className="message message-assistant">
          <div className="message-avatar">
            <Bot size={20} />
          </div>
          <div className="message-content loading">
            <Loader2 size={16} className="spin" />
            <span>Thinking...</span>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [message.content]);

  return (
    <div className={`message message-${message.role} ${message.isError ? 'message-error' : ''}`}>
      <div className="message-avatar">
        {isUser ? <User size={20} /> : <Bot size={20} />}
      </div>
      <div className="message-body">
        <div className="message-content">
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code({ className, children, ...props }: any) {
                  const isInline = !className;
                  if (isInline) {
                    return <code className="inline-code" {...props}>{children}</code>;
                  }
                  return (
                    <div className="code-block">
                      <div className="code-block-header">
                        <span>{className?.replace('language-', '') || 'code'}</span>
                        <button
                          className="btn btn-icon btn-sm"
                          onClick={() => {
                            navigator.clipboard.writeText(String(children));
                          }}
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                      <pre>
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </pre>
                    </div>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        <div className="message-meta">
          <span className="message-time">{formatTime(message.timestamp)}</span>
          {message.modelName && (
            <span className="message-model">{message.modelName}</span>
          )}
          {message.tokenCount && (
            <span className="message-tokens">{message.tokenCount} tokens</span>
          )}
          <div className="message-actions">
            <button className="btn btn-icon btn-xs" onClick={handleCopy} title="Copy">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatInput({
  onSend,
  isDisabled,
  isSending,
  isStreaming,
  onStop,
  supportsVision,
  supportsTools,
  toolCallingEnabled,
  onToggleToolCalling,
}: {
  onSend: (content: string, attachments?: File[]) => Promise<void>;
  isDisabled: boolean;
  isSending: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  supportsVision?: boolean;
  supportsTools?: boolean;
  toolCallingEnabled?: boolean;
  onToggleToolCalling?: () => void;
}) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isDisabled) return;
    setInput('');
    const files = [...attachments];
    setAttachments([]);
    await onSend(trimmed, files.length > 0 ? files : undefined);
  }, [input, isDisabled, onSend, attachments]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        {attachments.length > 0 && (
          <div className="attachment-previews">
            {attachments.map((file, i) => (
              <div key={i} className="attachment-preview">
                <span>{file.name}</span>
                <button className="btn btn-icon btn-xs" onClick={() => removeAttachment(i)}>&times;</button>
              </div>
            ))}
          </div>
        )}
        <div className="chat-input-row">
          <div className="chat-input-actions">
            {supportsVision && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                />
                <button
                  className="btn btn-icon btn-xs"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach image"
                  disabled={isDisabled}
                >
                  <Image size={16} />
                </button>
              </>
            )}
            {supportsTools && (
              <button
                className={`btn btn-icon btn-xs ${toolCallingEnabled ? 'active' : ''}`}
                onClick={onToggleToolCalling}
                title={toolCallingEnabled ? 'Tool calling enabled' : 'Tool calling disabled'}
                disabled={isDisabled}
              >
                <Wrench size={16} />
              </button>
            )}
          </div>
          <TextareaAutosize
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isDisabled ? 'Connect to Ollama to start chatting...' : 'Type a message... (Enter to send, Shift+Enter for new line)'}
            disabled={isDisabled}
            minRows={1}
            maxRows={8}
          />
          {isStreaming ? (
            <button
              className="btn btn-danger btn-send"
              onClick={onStop}
              title="Stop generating"
            >
              <Square size={18} />
            </button>
          ) : (
            <button
              className="btn btn-primary btn-send"
              onClick={handleSend}
              disabled={isDisabled || !input.trim()}
            >
              {isSending ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
