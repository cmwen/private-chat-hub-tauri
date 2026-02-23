import { useEffect } from 'react';
import { Sidebar } from './components/sidebar/Sidebar';
import { ChatView } from './components/chat/ChatView';
import { SettingsView } from './components/settings/SettingsView';
import { ProjectsView } from './components/projects/ProjectsView';
import { ComparisonView } from './components/comparison/ComparisonView';
import { ModelsView } from './components/models/ModelsView';
import { useUIStore, useConnectionStore, useModelStore, useSettingsStore } from './stores';
import './App.css';

function App() {
  const { currentView, sidebarOpen } = useUIStore();
  const { connections, testConnection, checkStatus } = useConnectionStore();
  const { fetchModels } = useModelStore();
  const { settings } = useSettingsStore();

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', settings.theme);
    }
  }, [settings.theme]);

  // Auto-connect on startup
  useEffect(() => {
    const defaultConn = connections.find((c) => c.isDefault) || connections[0];
    if (defaultConn) {
      testConnection(defaultConn.host, defaultConn.port, defaultConn.useHttps).then((ok) => {
        if (ok) fetchModels();
      });
    }
  }, []);

  // Periodic health check
  useEffect(() => {
    const interval = setInterval(() => {
      checkStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const renderView = () => {
    switch (currentView) {
      case 'chat':
        return <ChatView />;
      case 'settings':
        return <SettingsView />;
      case 'projects':
        return <ProjectsView />;
      case 'comparison':
        return <ComparisonView />;
      case 'models':
        return <ModelsView />;
      default:
        return <ChatView />;
    }
  };

  return (
    <div className="app">
      <Sidebar />
      <main className={`main-content ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
        {renderView()}
      </main>
    </div>
  );
}

export default App;
