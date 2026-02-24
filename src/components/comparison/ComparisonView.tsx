import { useState } from 'react';
import {
  GitCompare,
  Loader2,
  Send,
  Clock,
  Bot,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useModelStore, useConnectionStore } from '../../stores';
import { formatDuration } from '../../utils/format';
import { invoke } from '@tauri-apps/api/core';
import type { ComparisonResult } from '../../types';

export function ComparisonView() {
  const { models } = useModelStore();
  const { isConnected } = useConnectionStore();
  const [model1, setModel1] = useState(models[0]?.name || '');
  const [model2, setModel2] = useState(models[1]?.name || models[0]?.name || '');
  const [prompt, setPrompt] = useState('');
  const [isComparing, setIsComparing] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCompare = async () => {
    if (!prompt.trim() || !model1 || !model2 || isComparing) return;
    setIsComparing(true);
    setError(null);
    setResult(null);

    try {
      const comparison = await invoke<ComparisonResult>('compare_models', {
        model1,
        model2,
        messages: [
          {
            id: 'comparison-prompt',
            role: 'user',
            content: prompt.trim(),
            timestamp: new Date().toISOString(),
            is_error: false,
            attachments: [],
            tool_calls: [],
            status: 'sent',
            status_message: null,
            model_name: null,
            token_count: null,
          },
        ],
        systemPrompt: null,
        parameters: null,
      });
      setResult(comparison);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="comparison-view">
      <div className="view-header">
        <h2><GitCompare size={24} /> Model Comparison</h2>
      </div>

      <div className="comparison-setup settings-card">
        <div className="form-row">
          <div className="form-group">
            <label>Model 1</label>
            <select
              className="input"
              value={model1}
              onChange={(e) => setModel1(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="comparison-vs">VS</div>
          <div className="form-group">
            <label>Model 2</label>
            <select
              className="input"
              value={model2}
              onChange={(e) => setModel2(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Prompt</label>
          <textarea
            className="input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter a prompt to compare both models..."
            rows={3}
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={handleCompare}
          disabled={!isConnected || !prompt.trim() || !model1 || !model2 || isComparing}
        >
          {isComparing ? (
            <><Loader2 size={16} className="spin" /> Comparing...</>
          ) : (
            <><Send size={16} /> Compare</>
          )}
        </button>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {result && (
        <div className="comparison-results">
          <div className="comparison-column">
            <div className="comparison-column-header">
              <Bot size={18} />
              <h4>{result.model1.name}</h4>
              <span className="comparison-duration">
                <Clock size={14} /> {formatDuration(result.model1.duration_ms)}
              </span>
            </div>
            <div className="comparison-content">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {result.model1.content}
              </ReactMarkdown>
            </div>
          </div>

          <div className="comparison-column">
            <div className="comparison-column-header">
              <Bot size={18} />
              <h4>{result.model2.name}</h4>
              <span className="comparison-duration">
                <Clock size={14} /> {formatDuration(result.model2.duration_ms)}
              </span>
            </div>
            <div className="comparison-content">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {result.model2.content}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
