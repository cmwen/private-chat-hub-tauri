import { useState, type ReactNode } from 'react';
import {
  Wifi,
  Moon,
  Sun,
  Monitor,
  TestTube2,
  Loader2,
  CheckCircle,
  XCircle,
  Wrench,
  Info,
  Database,
  Download,
  Upload,
} from 'lucide-react';
import { useSettingsStore, useConnectionStore, useChatStore } from '../../stores';
import type { AppSettings } from '../../types';

export function SettingsView() {
  return (
    <div className="settings-view">
      <h2>Settings</h2>
      <ConnectionSettings />
      <ThemeSettings />
      <ToolSettings />
      <DataManagement />
      <AboutSection />
    </div>
  );
}

function ConnectionSettings() {
  const { connections, isConnected, isConnecting, connectionError, testConnection, updateConnection } =
    useConnectionStore();

  const defaultConn = connections[0] || { host: 'localhost', port: 11434, useHttps: false };
  const [host, setHost] = useState(defaultConn.host);
  const [port, setPort] = useState(defaultConn.port);
  const [useHttps, setUseHttps] = useState(defaultConn.useHttps);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const handleTest = async () => {
    setTestResult(null);
    const ok = await testConnection(host, port, useHttps);
    setTestResult(ok ? 'success' : 'error');
    if (ok) {
      const conn = connections[0];
      if (conn) {
        updateConnection(conn.id, { host, port, useHttps, lastConnectedAt: new Date().toISOString() });
      }
    }
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <Wifi size={20} />
        <h3>Ollama Connection</h3>
        <span className={`status-badge ${isConnected ? 'status-connected' : 'status-disconnected'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="settings-form">
        <div className="form-row">
          <div className="form-group">
            <label>Host</label>
            <input
              type="text"
              className="input"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="localhost or 192.168.1.100"
            />
          </div>
          <div className="form-group form-group-sm">
            <label>Port</label>
            <input
              type="number"
              className="input"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value) || 11434)}
            />
          </div>
        </div>

        <div className="form-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={useHttps}
              onChange={(e) => setUseHttps(e.target.checked)}
            />
            <span>Use HTTPS</span>
          </label>
        </div>

        <div className="form-actions">
          <button
            className="btn btn-primary"
            onClick={handleTest}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <><Loader2 size={16} className="spin" /> Testing...</>
            ) : (
              <><TestTube2 size={16} /> Test Connection</>
            )}
          </button>

          {testResult === 'success' && (
            <span className="test-result success">
              <CheckCircle size={16} /> Connected successfully
            </span>
          )}
          {testResult === 'error' && (
            <span className="test-result error">
              <XCircle size={16} /> {connectionError || 'Connection failed'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ThemeSettings() {
  const { settings, updateSettings } = useSettingsStore();

  const themes: Array<{ value: AppSettings['theme']; icon: ReactNode; label: string }> = [
    { value: 'light', icon: <Sun size={18} />, label: 'Light' },
    { value: 'dark', icon: <Moon size={18} />, label: 'Dark' },
    { value: 'system', icon: <Monitor size={18} />, label: 'System' },
  ];

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <Sun size={20} />
        <h3>Appearance</h3>
      </div>

      <div className="theme-selector">
        {themes.map((t) => (
          <button
            key={t.value}
            className={`theme-option ${settings.theme === t.value ? 'active' : ''}`}
            onClick={() => updateSettings({ theme: t.value })}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolSettings() {
  const { settings, updateToolConfig, updateSettings } = useSettingsStore();
  const { toolConfig } = settings;

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <Wrench size={20} />
        <h3>Tools & Features</h3>
      </div>
      <div className="settings-form">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={toolConfig.enabled}
            onChange={(e) => updateToolConfig({ enabled: e.target.checked })}
          />
          <span>Enable Tools</span>
        </label>

        <div className="form-group">
          <label>Max Tool Calls per Message</label>
          <input
            type="number"
            className="input"
            value={toolConfig.maxToolCalls}
            onChange={(e) => updateToolConfig({ maxToolCalls: parseInt(e.target.value) || 10 })}
            min={1}
            max={50}
          />
        </div>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.developerMode}
            onChange={(e) => updateSettings({ developerMode: e.target.checked })}
          />
          <span>Developer Mode</span>
        </label>
      </div>
    </div>
  );
}

function DataManagement() {
  const { exportConversations, importConversations } = useChatStore();
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleExport = async () => {
    setStatus(null);
    try {
      await exportConversations();
      setStatus({ type: 'success', message: 'Chat history exported successfully' });
    } catch (err) {
      setStatus({ type: 'error', message: `Export failed: ${String(err)}` });
    }
  };

  const handleImport = async () => {
    setStatus(null);
    try {
      const result = await importConversations();
      setStatus({ type: 'success', message: `Imported ${result.imported} conversation(s)${result.skipped > 0 ? ` (${result.skipped} duplicates skipped)` : ''}` });
    } catch (err) {
      setStatus({ type: 'error', message: `Import failed: ${String(err)}` });
    }
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <Database size={20} />
        <h3>Data Management</h3>
      </div>
      <div className="settings-form">
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Export your conversations to a JSON file, or import previously exported data.
        </p>
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download size={16} />
            <span>Export History</span>
          </button>
          <button className="btn btn-secondary" onClick={handleImport}>
            <Upload size={16} />
            <span>Import History</span>
          </button>
        </div>
        {status && (
          <div className={`test-result ${status.type}`} style={{ marginTop: '8px' }}>
            {status.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
            <span>{status.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function AboutSection() {
  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <Info size={20} />
        <h3>About</h3>
      </div>
      <div className="about-content">
        <p><strong>Private Chat Hub Desktop</strong></p>
        <p>Version 0.1.0</p>
        <p>Universal AI Chat Platform - Privacy-first chat with local, self-hosted, and cloud AI models.</p>
        <p className="text-muted">Built with Tauri + React + TypeScript</p>
      </div>
    </div>
  );
}
