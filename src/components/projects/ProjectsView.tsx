import { useState } from 'react';
import {
  FolderPlus,
  Trash2,
  Edit3,
  Pin,
  PinOff,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  FileText,
  BookOpen,
} from 'lucide-react';
import { useProjectStore, useChatStore, useUIStore } from '../../stores';
import { formatTimestamp } from '../../utils/format';
import type { Project } from '../../types';

export function ProjectsView() {
  const { projects, createProject, deleteProject, updateProject, setActiveProject } = useProjectStore();
  const { conversations } = useChatStore();
  const { setView } = useUIStore();
  const [showNewProject, setShowNewProject] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSystemPrompt, setNewSystemPrompt] = useState('');
  const [newInstructions, setNewInstructions] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;
    createProject(newName.trim(), newDescription.trim() || undefined, newSystemPrompt.trim() || undefined, newInstructions.trim() || undefined);
    setNewName('');
    setNewDescription('');
    setNewSystemPrompt('');
    setNewInstructions('');
    setShowNewProject(false);
  };

  const getProjectConversationCount = (projectId: string) => {
    return conversations.filter((c) => c.projectId === projectId).length;
  };

  const sortedProjects = [...projects].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return (
    <div className="projects-view">
      <div className="view-header">
        <h2>Projects</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowNewProject(!showNewProject)}
        >
          <FolderPlus size={18} />
          <span>New Project</span>
        </button>
      </div>

      {showNewProject && (
        <div className="new-project-form settings-card">
          <div className="form-group">
            <label>Project Name</label>
            <input
              type="text"
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="My Project"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              className="input"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={2}
            />
          </div>
          <div className="form-group">
            <label>System Prompt</label>
            <textarea
              className="input"
              value={newSystemPrompt}
              onChange={(e) => setNewSystemPrompt(e.target.value)}
              placeholder="System prompt for all conversations in this project..."
              rows={3}
            />
          </div>
          <div className="form-group">
            <label>Instructions</label>
            <textarea
              className="input"
              value={newInstructions}
              onChange={(e) => setNewInstructions(e.target.value)}
              placeholder="Special instructions for the AI..."
              rows={3}
            />
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </button>
            <button className="btn btn-secondary" onClick={() => setShowNewProject(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="project-list">
        {sortedProjects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            conversationCount={getProjectConversationCount(project.id)}
            onPin={() => updateProject(project.id, { isPinned: !project.isPinned })}
            onDelete={() => deleteProject(project.id)}
            onSelect={() => {
              setActiveProject(project.id);
              setView('chat');
            }}
          />
        ))}
        {projects.length === 0 && !showNewProject && (
          <div className="empty-state-small">
            <FolderPlus size={32} strokeWidth={1} />
            <p>No projects yet. Create one to organize your conversations.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  conversationCount,
  onPin,
  onDelete,
  onSelect,
}: {
  project: Project;
  conversationCount: number;
  onPin: () => void;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const { updateProject } = useProjectStore();
  const [editName, setEditName] = useState(project.name);
  const [editSystemPrompt, setEditSystemPrompt] = useState(project.systemPrompt ?? '');
  const [editInstructions, setEditInstructions] = useState(project.instructions ?? '');

  return (
    <div className="project-card" style={{ borderLeftColor: project.color }}>
      <div className="project-card-content" onClick={onSelect}>
        <div className="project-card-header">
          {editing ? (
            <input
              type="text"
              className="input input-sm"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => {
                if (editName.trim()) {
                  updateProject(project.id, { name: editName.trim() });
                }
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (editName.trim()) {
                    updateProject(project.id, { name: editName.trim() });
                  }
                  setEditing(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <h4>{project.name}</h4>
          )}
          <ChevronRight size={16} className="text-muted" />
        </div>
        {project.description && (
          <p className="project-card-description">{project.description}</p>
        )}
        <div className="project-card-meta">
          <span><MessageSquare size={14} /> {conversationCount} conversations</span>
          {project.systemPrompt && <span className="project-badge"><FileText size={11} /> Has System Prompt</span>}
          {project.instructions && <span className="project-badge"><BookOpen size={11} /> Has Instructions</span>}
          <span>{formatTimestamp(project.updatedAt)}</span>
        </div>
      </div>
      <div className="project-card-actions">
        <button className="btn btn-icon btn-xs" onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }} title="Edit Details">
          {showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button className="btn btn-icon btn-xs" onClick={(e) => { e.stopPropagation(); onPin(); }} title={project.isPinned ? 'Unpin' : 'Pin'}>
          {project.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button className="btn btn-icon btn-xs" onClick={(e) => { e.stopPropagation(); setEditing(true); }} title="Edit">
          <Edit3 size={14} />
        </button>
        <button className="btn btn-icon btn-xs btn-danger" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete">
          <Trash2 size={14} />
        </button>
      </div>
      {showDetails && (
        <div className="project-details-section" onClick={(e) => e.stopPropagation()}>
          <div className="form-group">
            <label>System Prompt</label>
            <textarea
              className="input"
              value={editSystemPrompt}
              onChange={(e) => setEditSystemPrompt(e.target.value)}
              onBlur={() => updateProject(project.id, { systemPrompt: editSystemPrompt.trim() || undefined })}
              placeholder="System prompt for all conversations in this project..."
              rows={3}
            />
          </div>
          <div className="form-group">
            <label>Instructions</label>
            <textarea
              className="input"
              value={editInstructions}
              onChange={(e) => setEditInstructions(e.target.value)}
              onBlur={() => updateProject(project.id, { instructions: editInstructions.trim() || undefined })}
              placeholder="Special instructions for the AI..."
              rows={3}
            />
          </div>
        </div>
      )}
    </div>
  );
}
