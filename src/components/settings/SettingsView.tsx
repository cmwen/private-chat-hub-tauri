import { useState, useEffect, type ReactNode } from 'react';
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
  FolderOpen,
  Upload,
  RefreshCw,
  Radio,
  Copy,
  ListFilter,
} from 'lucide-react';
import {
  useSettingsStore,
  useConnectionStore,
  useChatStore,
  useSyncStore,
  useModelStore,
  useFolderSyncStore,
} from '../../stores';
import type { AppSettings, BackendType } from '../../types';

const BACKEND_DETAILS: Record<
  BackendType,
  {
    label: string;
    defaultPort: number;
    connectionName: string;
    summary: string;
    failureHint: string;
  }
> = {
  ollama: {
    label: 'Ollama',
    defaultPort: 11434,
    connectionName: 'Local Ollama',
    summary: 'Best for local models managed directly by Ollama.',
    failureHint: 'Verify Ollama is running at the selected host and port.',
  },
  opencode: {
    label: 'OpenCode Server',
    defaultPort: 4096,
    connectionName: 'OpenCode Server',
    summary: 'Best for routed cloud and provider-backed models exposed through OpenCode.',
    failureHint: 'Verify host, port, credentials, and that `opencode serve` is running.',
  },
  lmstudio: {
    label: 'LM Studio',
    defaultPort: 1234,
    connectionName: 'LM Studio',
    summary: 'Best for a local OpenAI-style API served from LM Studio.',
    failureHint: 'Verify LM Studio has its local server enabled and the selected port matches.',
  },
};

export function SettingsView() {
  return (
    <div className="settings-view">
      <h2>Settings</h2>
      <ConnectionSettings />
      <OpencodeModelPreferencesSettings />
      <ThemeSettings />
      <ToolSettings />
      <LanSyncSettings />
      <FolderModeSettings />
      <DataManagement />
      <AboutSection />
    </div>
  );
}

function ConnectionSettings() {
  const { connections, isConnected, isConnecting, connectionError, testConnection, updateConnection } =
    useConnectionStore();
  const { fetchModels } = useModelStore();

  const defaultConn = connections[0] || {
    backend: 'ollama' as const,
    host: 'localhost',
    port: BACKEND_DETAILS.ollama.defaultPort,
    useHttps: false,
    username: '',
    password: '',
    apiToken: '',
  };
  const [backend, setBackend] = useState<BackendType>(defaultConn.backend);
  const [host, setHost] = useState(defaultConn.host);
  const [port, setPort] = useState(defaultConn.port);
  const [useHttps, setUseHttps] = useState(defaultConn.useHttps);
  const [username, setUsername] = useState(defaultConn.username || 'opencode');
  const [password, setPassword] = useState(defaultConn.password || '');
  const [apiToken, setApiToken] = useState(defaultConn.apiToken || '');
  const [portAutoMessage, setPortAutoMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const backendDetail = BACKEND_DETAILS[backend];

  const handleTest = async () => {
    setTestResult(null);
    const ok = await testConnection(
      host,
      port,
      useHttps,
      backend,
      backend === 'opencode' ? username || undefined : undefined,
      backend === 'opencode' ? password || undefined : undefined,
      backend === 'lmstudio' ? apiToken || undefined : undefined,
    );
    setTestResult(ok ? 'success' : 'error');
    if (ok) {
      const conn = connections[0];
      if (conn) {
        updateConnection(conn.id, {
          backend,
          host,
          port,
          useHttps,
          username: backend === 'opencode' ? username || undefined : undefined,
          password: backend === 'opencode' ? password || undefined : undefined,
          apiToken: backend === 'lmstudio' ? apiToken || undefined : undefined,
          name: backendDetail.connectionName,
          lastConnectedAt: new Date().toISOString(),
        });
      }
      await fetchModels();
    }
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <Wifi size={20} />
        <h3>Model Provider Connection</h3>
        <span className={`status-badge ${isConnected ? 'status-connected' : 'status-disconnected'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="settings-form">
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Default ports: Ollama <strong>11434</strong>, OpenCode <strong>4096</strong>, LM Studio <strong>1234</strong>.
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          {backendDetail.summary}
        </p>

        <div className="form-row">
          <div className="form-group">
            <label>Provider</label>
            <select
              className="input"
              value={backend}
              onChange={(e) => {
                const nextBackend = e.target.value as BackendType;
                setBackend(nextBackend);
                const currentDefaultPort = BACKEND_DETAILS[backend].defaultPort;
                if (port === currentDefaultPort) {
                  const nextDefaultPort = BACKEND_DETAILS[nextBackend].defaultPort;
                  setPort(nextDefaultPort);
                  setPortAutoMessage(`Port switched to ${nextDefaultPort} for ${BACKEND_DETAILS[nextBackend].label}`);
                } else {
                  setPortAutoMessage(null);
                }
              }}
            >
              <option value="ollama">Ollama</option>
              <option value="opencode">OpenCode Server</option>
              <option value="lmstudio">LM Studio</option>
            </select>
          </div>
        </div>

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
              onChange={(e) => setPort(parseInt(e.target.value, 10) || backendDetail.defaultPort)}
            />
          </div>
        </div>
        {portAutoMessage && (
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '-4px', marginBottom: '8px' }}>
            {portAutoMessage}
          </p>
        )}

        {backend === 'opencode' && (
          <>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Authentication is optional and only needed when OpenCode server password protection is enabled.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label>Username (optional)</label>
                <input
                  type="text"
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Defaults to opencode"
                />
              </div>
              <div className="form-group">
                <label>Password (optional)</label>
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set if OPENCODE_SERVER_PASSWORD is enabled"
                />
              </div>
            </div>
          </>
        )}
        {backend === 'lmstudio' && (
          <>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              API tokens are optional unless you configured authentication in LM Studio or a proxy in front of it.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label>API Token (optional)</label>
                <input
                  type="password"
                  className="input"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Bearer token"
                />
              </div>
            </div>
          </>
        )}

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
              {` • ${backendDetail.failureHint}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function OpencodeModelPreferencesSettings() {
  const { activeConnection } = useConnectionStore();
  const { models } = useModelStore();
  const { settings, updatePreferredOpencodeModels } = useSettingsStore();
  const [query, setQuery] = useState('');

  if (activeConnection?.backend !== 'opencode') {
    return null;
  }

  const allModels = models.map((model) => model.name);
  const preferredModels = settings.preferredOpencodeModels;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredModels = normalizedQuery
    ? allModels.filter((name) => name.toLowerCase().includes(normalizedQuery))
    : allModels;

  const togglePreferredModel = (modelName: string) => {
    const nextPreferredModels = preferredModels.includes(modelName)
      ? preferredModels.filter((name) => name !== modelName)
      : [...preferredModels, modelName];
    updatePreferredOpencodeModels(nextPreferredModels);
  };

  const selectFilteredModels = () => {
    updatePreferredOpencodeModels(Array.from(new Set([...preferredModels, ...filteredModels])));
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <ListFilter size={20} />
        <h3>OpenCode Model Dropdown</h3>
      </div>
      <div className="settings-form">
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Choose which OpenCode models appear in the chat model selector. Leave empty to show all.
        </p>
        <div className="form-group">
          <label>Search models</label>
          <input
            type="text"
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to filter models..."
          />
        </div>
        <div className="form-actions" style={{ marginBottom: '8px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => updatePreferredOpencodeModels([])}
            disabled={preferredModels.length === 0}
          >
            Show All
          </button>
          <button
            className="btn btn-secondary"
            onClick={selectFilteredModels}
            disabled={filteredModels.length === 0}
          >
            Select Filtered
          </button>
        </div>
        <div
          style={{
            maxHeight: '220px',
            overflowY: 'auto',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '8px',
          }}
        >
          {filteredModels.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '12px' }}>
              No models match your search.
            </p>
          ) : (
            filteredModels.map((modelName) => (
              <label
                key={modelName}
                className="checkbox-label"
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}
              >
                <span>{modelName}</span>
                <input
                  type="checkbox"
                  checked={preferredModels.includes(modelName)}
                  onChange={() => togglePreferredModel(modelName)}
                />
              </label>
            ))
          )}
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
          {preferredModels.length === 0
            ? 'All models are currently visible in chat.'
            : `${preferredModels.length} preferred model(s) selected.`}
        </p>
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

function LanSyncSettings() {
  const { settings, updateSyncConfig } = useSettingsStore();
  const { serverRunning, localIp, lastSyncedAt, startServer, stopServer, fetchLocalIp } = useSyncStore();
  const { syncConfig } = settings;

  const [port, setPort] = useState(syncConfig.port ?? 9876);
  const [pin, setPin] = useState(syncConfig.pin ?? '');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void fetchLocalIp();
  }, [fetchLocalIp]);

  const handleToggle = async (enabled: boolean) => {
    setStatus(null);
    try {
      if (enabled) {
        const config = { enabled: true, port, pin: pin || undefined };
        await startServer(config);
        updateSyncConfig(config);
        setStatus({ type: 'success', message: `Sync server started on port ${port}` });
      } else {
        await stopServer();
        updateSyncConfig({ enabled: false });
        setStatus({ type: 'success', message: 'Sync server stopped' });
      }
    } catch (err) {
      setStatus({ type: 'error', message: String(err) });
    }
  };

  const handleSaveConfig = async () => {
    setStatus(null);
    const config = { enabled: syncConfig.enabled, port, pin: pin || undefined };
    updateSyncConfig(config);
    if (serverRunning) {
      try {
        await stopServer();
        await startServer(config);
        setStatus({ type: 'success', message: 'Sync server restarted with new settings' });
      } catch (err) {
        setStatus({ type: 'error', message: String(err) });
      }
    } else {
      setStatus({ type: 'success', message: 'Settings saved' });
    }
  };

  const copyIp = async () => {
    if (localIp) {
      await navigator.clipboard.writeText(`${localIp}:${port}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <Radio size={20} />
        <h3>LAN Sync</h3>
        {serverRunning && <span className="sync-badge">● Running</span>}
      </div>
      <div className="settings-form">
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Sync chat history with the Android app over your local Wi-Fi network.
          Enable the server here, then connect from the Android app.
        </p>

        <div className="form-row">
          <label className="form-label">Enable sync server</label>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={serverRunning}
              onChange={(e) => void handleToggle(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="form-row">
          <label className="form-label">Port</label>
          <input
            className="form-input"
            type="number"
            value={port}
            min={1024}
            max={65535}
            onChange={(e) => setPort(Number(e.target.value))}
            style={{ width: '100px' }}
          />
        </div>

        <div className="form-row">
          <label className="form-label">PIN (optional)</label>
          <input
            className="form-input"
            type="text"
            value={pin}
            placeholder="Leave blank for no PIN"
            onChange={(e) => setPin(e.target.value)}
            style={{ width: '160px' }}
          />
        </div>

        {localIp && (
          <div className="form-row">
            <label className="form-label">Your IP</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <code style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                {localIp}:{port}
              </code>
              <button className="btn btn-ghost btn-xs" onClick={() => void copyIp()} title="Copy">
                {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        )}

        {lastSyncedAt && (
          <div className="form-row">
            <label className="form-label">Last synced</label>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {new Date(lastSyncedAt).toLocaleString()}
            </span>
          </div>
        )}

        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => void handleSaveConfig()}>
            <RefreshCw size={16} />
            <span>Apply Settings</span>
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

function FolderModeSettings() {
  const { settings, updateFolderSyncConfig } = useSettingsStore();
  const { status, error, prepareFolder, reloadFromFolder, syncNow, clearError } = useFolderSyncStore();
  const folderConfig = settings.folderSyncConfig;
  const [actionStatus, setActionStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [busyAction, setBusyAction] = useState<'choose' | 'reload' | 'sync' | 'toggle' | null>(null);

  const chooseFolder = async (): Promise<string | null> => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: folderConfig.basePath,
    });

    if (typeof selected !== 'string') {
      return null;
    }

    await prepareFolder(selected);
    updateFolderSyncConfig({ basePath: selected });
    return selected;
  };

  const handleToggle = async (enabled: boolean) => {
    clearError();
    setActionStatus(null);
    setBusyAction('toggle');
    try {
      if (enabled) {
        const basePath = folderConfig.basePath ?? await chooseFolder();
        if (!basePath) {
          return;
        }
        await prepareFolder(basePath);
        updateFolderSyncConfig({ enabled: true, basePath });
        const synced = await syncNow(basePath);
        setActionStatus({
          type: 'success',
          message: `Folder mode enabled. ${synced?.conversationCount ?? 0} conversation(s) are now mirrored to the shared folder.`,
        });
      } else {
        updateFolderSyncConfig({ enabled: false });
        setActionStatus({
          type: 'success',
          message: 'Folder mode disabled. The local cache is now the primary source again.',
        });
      }
    } catch (err) {
      setActionStatus({ type: 'error', message: String(err) });
    } finally {
      setBusyAction(null);
    }
  };

  const handleChooseFolder = async () => {
    clearError();
    setActionStatus(null);
    setBusyAction('choose');
    try {
      const basePath = await chooseFolder();
      if (!basePath) {
        return;
      }
      if (folderConfig.enabled) {
        const synced = await syncNow(basePath);
        setActionStatus({
          type: 'success',
          message: `Folder updated. ${synced?.conversationCount ?? 0} conversation(s) are available for Syncthing to sync.`,
        });
      } else {
        setActionStatus({ type: 'success', message: 'Folder selected. Enable folder mode when you are ready to use it as the source of truth.' });
      }
    } catch (err) {
      setActionStatus({ type: 'error', message: String(err) });
    } finally {
      setBusyAction(null);
    }
  };

  const handleReload = async () => {
    clearError();
    setActionStatus(null);
    setBusyAction('reload');
    try {
      const snapshot = await reloadFromFolder();
      setActionStatus({
        type: 'success',
        message: `Reloaded ${snapshot?.conversations.length ?? 0} conversation(s) and ${snapshot?.projects.length ?? 0} project(s) from the folder.`,
      });
    } catch (err) {
      setActionStatus({ type: 'error', message: String(err) });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncNow = async () => {
    clearError();
    setActionStatus(null);
    setBusyAction('sync');
    try {
      const synced = await syncNow();
      setActionStatus({
        type: 'success',
        message: `Snapshot written. Last folder write: ${synced?.lastWrittenAt ? new Date(synced.lastWrittenAt).toLocaleString() : 'just now'}.`,
      });
    } catch (err) {
      setActionStatus({ type: 'error', message: String(err) });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <FolderOpen size={20} />
        <h3>Folder Mode (Syncthing)</h3>
        {folderConfig.enabled && <span className="sync-badge">● Source of truth</span>}
      </div>
      <div className="settings-form">
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Store conversations, projects, attachments, and workspace pointers as structured files in a shared folder.
          When enabled, the folder becomes the source of truth and the local app cache is only used for speed.
        </p>

        <div className="form-row">
          <label className="form-label">Enable folder mode</label>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={folderConfig.enabled}
              onChange={(e) => void handleToggle(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="form-group">
          <label>Shared folder</label>
          <div className="folder-sync-path-row">
            <input
              className="input"
              type="text"
              value={folderConfig.basePath ?? ''}
              readOnly
              placeholder="Choose a folder that Syncthing can sync"
            />
            <button className="btn btn-secondary" onClick={() => void handleChooseFolder()} disabled={busyAction !== null}>
              {busyAction === 'choose' ? <Loader2 size={16} className="spin" /> : <FolderOpen size={16} />}
              <span>{folderConfig.basePath ? 'Change' : 'Choose'}</span>
            </button>
          </div>
        </div>

        {status && (
          <div className="folder-sync-summary">
            <div><strong>Conversations:</strong> {status.conversationCount}</div>
            <div><strong>Projects:</strong> {status.projectCount}</div>
            <div><strong>Last write:</strong> {status.lastWrittenAt ? new Date(status.lastWrittenAt).toLocaleString() : 'Not yet written'}</div>
          </div>
        )}

        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => void handleSyncNow()} disabled={busyAction !== null || !folderConfig.basePath}>
            {busyAction === 'sync' ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            <span>Write Snapshot Now</span>
          </button>
          <button className="btn btn-secondary" onClick={() => void handleReload()} disabled={busyAction !== null || !folderConfig.basePath}>
            {busyAction === 'reload' ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
            <span>Reload from Folder</span>
          </button>
        </div>

        <div className="folder-sync-tips">
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
            <strong>Syncthing setup tips</strong>
          </p>
          <ol>
            <li>Create a dedicated folder such as <code>~/Syncthing/private-chat-hub</code>.</li>
            <li>Add that folder to Syncthing on each device and let the first sync finish before opening the app elsewhere.</li>
            <li>Keep connection passwords and API tokens local; the shared folder only stores chat/project history plus attachments.</li>
            <li>Use &ldquo;Write Snapshot Now&rdquo; before closing a device if you want an immediate handoff.</li>
            <li>If another app or device changed the files, use &ldquo;Reload from Folder&rdquo; to refresh this desktop app.</li>
          </ol>
        </div>

        {(actionStatus || error) && (
          <div className={`test-result ${(actionStatus?.type ?? 'error')}`} style={{ marginTop: '8px' }}>
            {(actionStatus?.type ?? 'error') === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
            <span>{actionStatus?.message ?? error}</span>
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
        <p className="text-muted">
          GitHub auto-updates can be added through the Tauri updater plugin, but production releases still need a stable signing key,
          updater configuration, and GitHub Actions secrets before automatic installs can be safely enabled.
        </p>
      </div>
    </div>
  );
}
