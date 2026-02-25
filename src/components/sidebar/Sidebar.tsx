import { useState, type ReactNode } from 'react';
import {
  MessageSquarePlus,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Settings,
  FolderPlus,
  GitCompare,
  Cpu,
  Trash2,
  Wifi,
  WifiOff,
  Settings2,
} from 'lucide-react';
import { useChatStore, useModelStore, useConnectionStore, useUIStore, useProjectStore } from '../../stores';
import { formatTimestamp, truncate } from '../../utils/format';
import type { View } from '../../types';

export function Sidebar() {
  const { sidebarOpen, toggleSidebar, setView } = useUIStore();
  const { conversations, activeConversationId, setActiveConversation, createConversation, deleteConversation } = useChatStore();
  const { selectedModel, models } = useModelStore();
  const { isConnected } = useConnectionStore();
  const { projects, createProject, deleteProject, updateProject } = useProjectStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredConv, setHoveredConv] = useState<string | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProjectSettings, setEditingProjectSettings] = useState<string | null>(null);

  const filteredConversations = searchQuery
    ? conversations.filter(
        (c) =>
          c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.messages.some((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : conversations;

  const projectConversations = new Map<string | null, typeof filteredConversations>();
  for (const conv of filteredConversations) {
    const key = conv.projectId || null;
    if (!projectConversations.has(key)) projectConversations.set(key, []);
    projectConversations.get(key)!.push(conv);
  }

  const toggleProjectCollapse = (projectId: string) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

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

      {/* Action Buttons */}
      <div className="sidebar-actions-row">
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
        <button
          className="btn btn-secondary btn-new-project"
          onClick={() => setShowNewProject(true)}
          title="New Project"
        >
          <FolderPlus size={18} />
        </button>
      </div>

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
        {/* New project inline form */}
        {showNewProject && (
          <div className="sidebar-new-project-form">
            <input
              type="text"
              className="input input-sm"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newProjectName.trim()) {
                  createProject(newProjectName.trim());
                  setNewProjectName('');
                  setShowNewProject(false);
                }
                if (e.key === 'Escape') {
                  setShowNewProject(false);
                  setNewProjectName('');
                }
              }}
            />
            <div className="sidebar-new-project-actions">
              <button
                className="btn btn-primary btn-xs"
                onClick={() => {
                  if (newProjectName.trim()) {
                    createProject(newProjectName.trim());
                    setNewProjectName('');
                    setShowNewProject(false);
                  }
                }}
                disabled={!newProjectName.trim()}
              >Create</button>
              <button className="btn btn-secondary btn-xs" onClick={() => { setShowNewProject(false); setNewProjectName(''); }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Ungrouped conversations */}
        {(projectConversations.get(null) ?? []).map((conv) => (
          <div
            key={conv.id}
            className={`conversation-item ${conv.id === activeConversationId ? 'active' : ''}`}
            onClick={() => { setActiveConversation(conv.id); setView('chat'); }}
            onMouseEnter={() => setHoveredConv(conv.id)}
            onMouseLeave={() => setHoveredConv(null)}
          >
            <div className="conversation-item-content">
              <div className="conversation-item-title">{truncate(conv.title, 30)}</div>
              <div className="conversation-item-meta">
                <span className="conversation-item-model">{conv.modelName}</span>
                <span className="conversation-item-time">{formatTimestamp(conv.updatedAt)}</span>
              </div>
            </div>
            {hoveredConv === conv.id && (
              <button className="btn btn-icon btn-xs btn-danger conversation-delete" onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }} title="Delete">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}

        {/* Project accordions */}
        {projects.map((project) => {
          const convs = projectConversations.get(project.id) ?? [];
          const isCollapsed = collapsedProjects.has(project.id);
          const isEditingSettings = editingProjectSettings === project.id;
          return (
            <div key={project.id} className="sidebar-project-group">
              <div className="sidebar-project-header" onClick={() => toggleProjectCollapse(project.id)}>
                {isCollapsed ? <ChevronRightIcon size={12} /> : <ChevronDown size={12} />}
                <span className="sidebar-project-dot" style={{ background: project.color }} />
                <span className="sidebar-project-name">{project.name}</span>
                <span className="sidebar-project-count">{convs.length}</span>
                <div className="sidebar-project-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-icon btn-xs" onClick={() => setEditingProjectSettings(isEditingSettings ? null : project.id)} title="Project settings">
                    <Settings2 size={12} />
                  </button>
                  <button className="btn btn-icon btn-xs btn-danger" onClick={() => deleteProject(project.id)} title="Delete project">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              {!isCollapsed && (
                <>
                  <button
                    className="btn btn-sm sidebar-project-new-chat"
                    onClick={() => {
                      const model = selectedModel || models[0]?.name || 'llama3';
                      createConversation(model, project.id);
                      setView('chat');
                    }}
                    disabled={!isConnected || models.length === 0}
                  >
                    <MessageSquarePlus size={14} />
                    <span>New Chat</span>
                  </button>
                  {isEditingSettings && (
                    <div className="sidebar-project-settings" onClick={(e) => e.stopPropagation()}>
                      <div className="form-group">
                        <label>System Prompt</label>
                        <textarea
                          className="input input-sm"
                          defaultValue={project.systemPrompt ?? ''}
                          onBlur={(e) => updateProject(project.id, { systemPrompt: e.target.value.trim() || undefined })}
                          placeholder="System prompt..."
                          rows={2}
                        />
                      </div>
                      <div className="form-group">
                        <label>Instructions</label>
                        <textarea
                          className="input input-sm"
                          defaultValue={project.instructions ?? ''}
                          onBlur={(e) => updateProject(project.id, { instructions: e.target.value.trim() || undefined })}
                          placeholder="Instructions..."
                          rows={2}
                        />
                      </div>
                    </div>
                  )}
                  {convs.map((conv) => (
                    <div
                      key={conv.id}
                      className={`conversation-item ${conv.id === activeConversationId ? 'active' : ''}`}
                      onClick={() => { setActiveConversation(conv.id); setView('chat'); }}
                      onMouseEnter={() => setHoveredConv(conv.id)}
                      onMouseLeave={() => setHoveredConv(null)}
                    >
                      <div className="conversation-item-content">
                        <div className="conversation-item-title">{truncate(conv.title, 30)}</div>
                        <div className="conversation-item-meta">
                          <span className="conversation-item-model">{conv.modelName}</span>
                          <span className="conversation-item-time">{formatTimestamp(conv.updatedAt)}</span>
                        </div>
                      </div>
                      {hoveredConv === conv.id && (
                        <button className="btn btn-icon btn-xs btn-danger conversation-delete" onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {convs.length === 0 && (
                    <div className="sidebar-empty" style={{ padding: '8px 12px', fontSize: '12px' }}>No conversations</div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {filteredConversations.length === 0 && (
          <div className="sidebar-empty">
            {searchQuery ? 'No matching conversations' : 'No conversations yet'}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="sidebar-nav">
        <NavItem icon={<Cpu size={18} />} label="Models" view="models" />
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
