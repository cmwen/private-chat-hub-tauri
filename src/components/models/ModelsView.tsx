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
} from 'lucide-react';
import { useModelStore, useConnectionStore } from '../../stores';
import { formatFileSize, getModelFamily } from '../../utils/format';
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
  const isSelected = selectedModel === model.name;
  const family = getModelFamily(model.name);

  return (
    <div className={`model-card ${isSelected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="model-card-header">
        <h4>{model.name}</h4>
        {isSelected && <CheckCircle size={16} className="text-primary" />}
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
  );
}
