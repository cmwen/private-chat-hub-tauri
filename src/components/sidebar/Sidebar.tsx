import { useState, type ReactNode } from 'react';
import {
  MessageSquarePlus,
  Search,
  ChevronLeft,
  ChevronRight,
  Settings,
  FolderKanban,
  GitCompare,
  Cpu,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useChatStore, useModelStore, useConnectionStore, useUIStore } from '../../stores';
import { formatTimestamp, truncate } from '../../utils/format';
import type { View } from '../../types';

export function Sidebar() {
  const { sidebarOpen, toggleSidebar, setView } = useUIStore();
  const { conversations, activeConversationId, setActiveConversation, createConversation, deleteConversation } = useChatStore();
  const { selectedModel, models } = useModelStore();
  const { isConnected } = useConnectionStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredConv, setHoveredConv] = useState<string | null>(null);

  const filteredConversations = searchQuery
    ? conversations.filter(
        (c) =>
          c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.messages.some((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : conversations;

  if (!sidebarOpen) {
    return (
      <div className="sidebar sidebar-collapsed">
        <button className="btn btn-icon" onClick={toggleSidebar} title="Open sidebar">
          <ChevronRight size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2 className="sidebar-title">Private Chat Hub</h2>
        <button className="btn btn-icon" onClick={toggleSidebar} title="Collapse sidebar">
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* Connection Status */}
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>

      {/* New Chat Button */}
      <button
        className="btn btn-primary btn-new-chat"
        onClick={() => {
          const model = selectedModel || models[0]?.name || 'llama3';
          createConversation(model);
          setView('chat');
        }}
        disabled={!isConnected || models.length === 0}
      >
        <MessageSquarePlus size={18} />
        <span>New Chat</span>
      </button>

      {/* Search */}
      <div className="sidebar-search">
        <Search size={14} />
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Conversation List */}
      <div className="conversation-list">
        {filteredConversations.map((conv) => (
          <div
            key={conv.id}
            className={`conversation-item ${conv.id === activeConversationId ? 'active' : ''}`}
            onClick={() => {
              setActiveConversation(conv.id);
              setView('chat');
            }}
            onMouseEnter={() => setHoveredConv(conv.id)}
            onMouseLeave={() => setHoveredConv(null)}
          >
            <div className="conversation-item-content">
              <div className="conversation-item-title">{truncate(conv.title, 30)}</div>
              <div className="conversation-item-meta">
                <span className="conversation-item-model">{conv.modelName}</span>
                <span className="conversation-item-time">{formatTimestamp(conv.updatedAt)}</span>
              </div>
              {conv.messages.length > 0 && (
                <div className="conversation-item-preview">
                  {truncate(conv.messages[conv.messages.length - 1].content, 60)}
                </div>
              )}
            </div>
            {hoveredConv === conv.id && (
              <button
                className="btn btn-icon btn-xs btn-danger conversation-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(conv.id);
                }}
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {filteredConversations.length === 0 && (
          <div className="sidebar-empty">
            {searchQuery ? 'No matching conversations' : 'No conversations yet'}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="sidebar-nav">
        <NavItem icon={<Cpu size={18} />} label="Models" view="models" />
        <NavItem icon={<FolderKanban size={18} />} label="Projects" view="projects" />
        <NavItem icon={<GitCompare size={18} />} label="Compare" view="comparison" />
        <NavItem icon={<Settings size={18} />} label="Settings" view="settings" />
      </div>
    </div>
  );
}

function NavItem({
  icon,
  label,
  view,
}: {
  icon: ReactNode;
  label: string;
  view: View;
}) {
  const { currentView, setView } = useUIStore();

  return (
    <button
      className={`nav-item ${currentView === view ? 'active' : ''}`}
      onClick={() => setView(view)}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
