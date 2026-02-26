import { useState } from 'react';
import {
  MessageSquarePlus,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useProjectStore, useChatStore, useModelStore, useConnectionStore, useUIStore } from '../../stores';
import { formatTimestamp, stripMarkdown } from '../../utils/format';

export function ProjectsView() {
  const { projects, activeProjectId, updateProject, deleteProject } = useProjectStore();
  const { conversations, createConversation, setActiveConversation, deleteConversation } = useChatStore();
  const { selectedModel, models } = useModelStore();
  const { isConnected } = useConnectionStore();
  const { setView } = useUIStore();

  const project = projects.find(p => p.id === activeProjectId);

  if (!project) {
    return (
      <div className="empty-state">
        <div className="empty-state-content">
          <h2>No Project Selected</h2>
          <p>Select a project from the sidebar to view its details.</p>
        </div>
      </div>
    );
  }

  const projectConversations = conversations
    .filter(c => c.projectId === project.id)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <div className="project-detail-view">
      <ProjectHeader project={project} onUpdate={(updates) => updateProject(project.id, updates)} onDelete={() => { deleteProject(project.id); setView('chat'); }} />
      <div className="project-detail-body">
        <ProjectConfig project={project} onUpdate={(updates) => updateProject(project.id, updates)} />
        <ProjectConversations
          conversations={projectConversations}
          onNewChat={() => {
            const model = selectedModel || models[0]?.name || 'llama3';
            createConversation(model, project.id);
            setView('chat');
          }}
          onSelectChat={(id) => { setActiveConversation(id); setView('chat'); }}
          onDeleteChat={deleteConversation}
          isConnected={isConnected}
          hasModels={models.length > 0}
        />
      </div>
    </div>
  );
}

function ProjectHeader({ project, onUpdate, onDelete }: { project: any; onUpdate: (u: any) => void; onDelete: () => void }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(project.name);

  return (
    <div className="project-detail-header">
      <div className="project-detail-header-left">
        <span className="project-detail-color-dot" style={{ background: project.color }} />
        {editingName ? (
          <input
            className="input input-lg project-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { if (name.trim()) onUpdate({ name: name.trim() }); setEditingName(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { if (name.trim()) onUpdate({ name: name.trim() }); setEditingName(false); } if (e.key === 'Escape') setEditingName(false); }}
            autoFocus
          />
        ) : (
          <h2 className="project-detail-title" onClick={() => setEditingName(true)}>{project.name}</h2>
        )}
      </div>
      <div className="project-detail-header-right">
        <button className="btn btn-icon btn-danger" onClick={onDelete} title="Delete project">
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}

function ProjectConfig({ project, onUpdate }: { project: any; onUpdate: (u: any) => void }) {
  const [systemPrompt, setSystemPrompt] = useState(project.systemPrompt ?? '');
  const [instructions, setInstructions] = useState(project.instructions ?? '');
  const [showConfig, setShowConfig] = useState(true);

  const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16', '#f97316'];

  return (
    <div className="project-config-section">
      <div className="project-config-header" onClick={() => setShowConfig(!showConfig)}>
        <Settings2 size={16} />
        <span>Project Configuration</span>
      </div>
      {showConfig && (
        <div className="project-config-body">
          <div className="form-group">
            <label>Color</label>
            <div className="color-picker-row">
              {COLORS.map(color => (
                <button
                  key={color}
                  className={`color-swatch ${project.color === color ? 'active' : ''}`}
                  style={{ background: color }}
                  onClick={() => onUpdate({ color })}
                />
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>System Prompt</label>
            <textarea
              className="input"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              onBlur={() => onUpdate({ systemPrompt: systemPrompt.trim() || undefined })}
              placeholder="Define the AI's persona and behavior for all conversations in this project..."
              rows={4}
            />
          </div>
          <div className="form-group">
            <label>Instructions</label>
            <textarea
              className="input"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              onBlur={() => onUpdate({ instructions: instructions.trim() || undefined })}
              placeholder="Special instructions for the AI (e.g., coding style, response format)..."
              rows={4}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectConversations({
  conversations,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  isConnected,
  hasModels,
}: {
  conversations: any[];
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  isConnected: boolean;
  hasModels: boolean;
}) {
  const [hoveredConv, setHoveredConv] = useState<string | null>(null);

  return (
    <div className="project-conversations-section">
      <div className="project-conversations-header">
        <h3>Conversations</h3>
        <button
          className="btn btn-primary btn-sm"
          onClick={onNewChat}
          disabled={!isConnected || !hasModels}
        >
          <MessageSquarePlus size={16} />
          <span>New Chat</span>
        </button>
      </div>
      <div className="project-conversations-list">
        {conversations.map(conv => (
          <div
            key={conv.id}
            className="project-conversation-item"
            onClick={() => onSelectChat(conv.id)}
            onMouseEnter={() => setHoveredConv(conv.id)}
            onMouseLeave={() => setHoveredConv(null)}
          >
            <div className="project-conversation-item-content">
              <div className="project-conversation-item-title">{stripMarkdown(conv.title)}</div>
              <div className="project-conversation-item-meta">
                <span>{conv.modelName}</span>
                <span>{conv.messages.length} messages</span>
                <span>{formatTimestamp(conv.updatedAt)}</span>
              </div>
            </div>
            {hoveredConv === conv.id && (
              <button className="btn btn-icon btn-xs btn-danger" onClick={(e) => { e.stopPropagation(); onDeleteChat(conv.id); }} title="Delete">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {conversations.length === 0 && (
          <div className="project-empty-conversations">
            <p>No conversations yet. Start a new chat to begin.</p>
          </div>
        )}
      </div>
    </div>
  );
}
