import { useEffect, useState } from 'react';
import {
  Cpu,
  Download,
  Trash2,
  RefreshCw,
  Loader2,
  HardDrive,
  CheckCircle,
  XCircle,
  Eye,
  Wrench,
  Code,
  Info,
  X,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useModelStore, useConnectionStore } from '../../stores';
import { formatFileSize, getModelFamily, getModelCapabilities } from '../../utils/format';
import type { OllamaModel } from '../../types';

export function ModelsView() {
  const { models, isLoading, error, fetchModels, setSelectedModel, pullModel, deleteModel } =
    useModelStore();
  const { isConnected } = useConnectionStore();
  const [pullName, setPullName] = useState('');
  const [isPulling, setIsPulling] = useState(false);
  const [pullStatus, setPullStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected) {
      fetchModels();
    }
  }, [isConnected, fetchModels]);

  const handlePull = async () => {
    if (!pullName.trim() || isPulling) return;
    setIsPulling(true);
    setPullStatus(null);
    try {
      const result = await pullModel(pullName.trim());
      setPullStatus({ type: 'success', message: result });
      setPullName('');
      fetchModels();
    } catch (err) {
      setPullStatus({ type: 'error', message: String(err) });
    } finally {
      setIsPulling(false);
    }
  };

  const handleDelete = async (name: string) => {
    setDeletingModel(name);
    try {
      await deleteModel(name);
      fetchModels();
    } catch (err) {
      // handle error
    } finally {
      setDeletingModel(null);
    }
  };

  return (
    <div className="models-view">
      <div className="view-header">
        <h2><Cpu size={24} /> Models</h2>
        <button
          className="btn btn-secondary"
          onClick={fetchModels}
          disabled={isLoading || !isConnected}
        >
          <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Pull Model */}
      <div className="settings-card">
        <div className="settings-card-header">
          <Download size={20} />
          <h3>Pull Model</h3>
        </div>
        <div className="form-row">
          <input
            type="text"
            className="input"
            value={pullName}
            onChange={(e) => setPullName(e.target.value)}
            placeholder="e.g., llama3, mistral, gemma:2b"
            onKeyDown={(e) => e.key === 'Enter' && handlePull()}
          />
          <button
            className="btn btn-primary"
            onClick={handlePull}
            disabled={isPulling || !pullName.trim() || !isConnected}
          >
            {isPulling ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
            <span>{isPulling ? 'Pulling...' : 'Pull'}</span>
          </button>
        </div>
        {pullStatus && (
          <div className={`pull-status ${pullStatus.type}`}>
            {pullStatus.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
            <span>{pullStatus.message}</span>
          </div>
        )}
      </div>

      {/* Model List */}
      {error && <div className="error-banner">{error}</div>}

      <div className="model-grid">
        {models.map((model) => (
          <ModelCard
            key={model.name}
            model={model}
            onSelect={() => setSelectedModel(model.name)}
            onDelete={() => handleDelete(model.name)}
            isDeleting={deletingModel === model.name}
          />
        ))}
        {models.length === 0 && !isLoading && (
          <div className="empty-state-small">
            <Cpu size={32} strokeWidth={1} />
            <p>{isConnected ? 'No models found. Pull a model to get started.' : 'Connect to Ollama to see available models.'}</p>
          </div>
        )}
        {isLoading && (
          <div className="loading-state">
            <Loader2 size={24} className="spin" />
            <span>Loading models...</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ModelDetailModal({ model, onClose }: { model: OllamaModel; onClose: () => void }) {
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<any>('show_model', { modelName: model.name })
      .then(setDetails)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [model.name]);

  const capabilities = getModelCapabilities(model.name);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{model.name}</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {capabilities.length > 0 && (
          <div className="capability-badges" style={{ marginBottom: 16 }}>
            {capabilities.map((cap) => (
              <span key={cap} className={`capability-badge ${cap}`}>
                {cap === 'vision' && <Eye size={12} />}
                {cap === 'tools' && <Wrench size={12} />}
                {cap === 'code' && <Code size={12} />}
                {cap.charAt(0).toUpperCase() + cap.slice(1)}
              </span>
            ))}
          </div>
        )}

        <div className="model-detail-section">
          <h4>Details</h4>
          <div className="model-detail-grid">
            {model.details?.parameter_size && (
              <div className="model-detail-item">
                <span className="label">Parameters</span>
                <span className="value">{model.details.parameter_size}</span>
              </div>
            )}
            {model.details?.quantization_level && (
              <div className="model-detail-item">
                <span className="label">Quantization</span>
                <span className="value">{model.details.quantization_level}</span>
              </div>
            )}
            {model.details?.format && (
              <div className="model-detail-item">
                <span className="label">Format</span>
                <span className="value">{model.details.format}</span>
              </div>
            )}
            {model.details?.family && (
              <div className="model-detail-item">
                <span className="label">Family</span>
                <span className="value">{model.details.family}</span>
              </div>
            )}
            {model.size && (
              <div className="model-detail-item">
                <span className="label">Disk Size</span>
                <span className="value">{formatFileSize(model.size)}</span>
              </div>
            )}
            {model.details?.families && model.details.families.length > 0 && (
              <div className="model-detail-item">
                <span className="label">Families</span>
                <span className="value">{model.details.families.join(', ')}</span>
              </div>
            )}
          </div>
        </div>

        {loading && (
          <div className="loading-state"><Loader2 size={18} className="spin" /><span>Loading details...</span></div>
        )}

        {details?.template && (
          <div className="model-detail-section">
            <h4>Template</h4>
            <pre>{details.template}</pre>
          </div>
        )}

        {details?.system && (
          <div className="model-detail-section">
            <h4>System Prompt</h4>
            <pre>{details.system}</pre>
          </div>
        )}

        {details?.license && (
          <div className="model-detail-section">
            <h4>License</h4>
            <pre>{details.license}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function ModelCard({
  model,
  onSelect,
  onDelete,
  isDeleting,
}: {
  model: OllamaModel;
  onSelect: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const { selectedModel } = useModelStore();
  const [showDetail, setShowDetail] = useState(false);
  const isSelected = selectedModel === model.name;
  const family = getModelFamily(model.name);
  const capabilities = getModelCapabilities(model.name);

  return (
    <>
      <div className={`model-card ${isSelected ? 'selected' : ''}`} onClick={onSelect}>
        <div className="model-card-header">
          <h4>{model.name}</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {isSelected && <CheckCircle size={16} className="text-primary" />}
            <button
              className="btn-icon"
              onClick={(e) => { e.stopPropagation(); setShowDetail(true); }}
              title="View details"
            >
              <Info size={16} />
            </button>
          </div>
        </div>
        <div className="model-card-details">
          <span className="model-badge">{family}</span>
          {model.details?.parameter_size && (
            <span className="model-badge">{model.details.parameter_size}</span>
          )}
          {model.details?.quantization_level && (
            <span className="model-badge">{model.details.quantization_level}</span>
          )}
        </div>
        {capabilities.length > 0 && (
          <div className="capability-badges">
            {capabilities.map((cap) => (
              <span key={cap} className={`capability-badge ${cap}`}>
                {cap === 'vision' && <Eye size={10} />}
                {cap === 'tools' && <Wrench size={10} />}
                {cap === 'code' && <Code size={10} />}
                {cap.charAt(0).toUpperCase() + cap.slice(1)}
              </span>
            ))}
          </div>
        )}
        {model.size && (
          <div className="model-card-size">
            <HardDrive size={14} />
            <span>{formatFileSize(model.size)}</span>
          </div>
        )}
        <div className="model-card-actions">
          <button
            className="btn btn-sm btn-primary"
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
          >
            Select
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>
      {showDetail && <ModelDetailModal model={model} onClose={() => setShowDetail(false)} />}
    </>
  );
}
