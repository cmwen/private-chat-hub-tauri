import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Loader2,
  Copy,
  Check,
  Trash2,
  Bot,
  User,
  Settings2,
} from 'lucide-react';
import { useChatStore, useModelStore, useConnectionStore } from '../../stores';
import { formatTime } from '../../utils/format';
import type { Message, ModelParameters } from '../../types';
import { PARAMETER_PRESETS } from '../../types';
import TextareaAutosize from 'react-textarea-autosize';

export function ChatView() {
  const {
    activeConversationId,
    conversations,
    isSending,
    sendMessage,
    updateConversationModel,
    deleteConversation,
  } = useChatStore();

  const { models } = useModelStore();
  const { isConnected } = useConnectionStore();
  const activeConv = conversations.find((c) => c.id === activeConversationId);

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
              remarkPlugins={[remarkGfm]}
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
}: {
  onSend: (content: string) => Promise<void>;
  isDisabled: boolean;
  isSending: boolean;
}) {
  const [input, setInput] = useState('');

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isDisabled) return;
    setInput('');
    await onSend(trimmed);
  }, [input, isDisabled, onSend]);

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
        <button
          className="btn btn-primary btn-send"
          onClick={handleSend}
          disabled={isDisabled || !input.trim()}
        >
          {isSending ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}
