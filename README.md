# Private Chat Hub Desktop

Universal AI Chat Platform for Desktop - Privacy-first chat with local, self-hosted, and cloud AI models.

Desktop companion to the [Private Chat Hub](../private-chat-hub) mobile app, rebuilt with Tauri + React + TypeScript for a native desktop experience.

## Features

- **Ollama Integration** - Connect to local or remote Ollama instances with health monitoring
- **Streaming Chat** - Real-time AI chat with markdown rendering and code highlighting
- **Conversation Management** - Auto-titled conversations, search, delete, per-conversation settings
- **Project Workspaces** - Organize conversations into projects with pin/unpin support
- **Model Management** - Browse, pull, and delete Ollama models with model details
- **Model Comparison** - Side-by-side comparison of responses from two models
- **Parameter Presets** - Balanced, Creative, Precise, and Code presets with manual tuning
- **Theme Support** - Light, Dark, and System theme modes
- **Desktop-Optimized UI** - Sidebar navigation, resizable panels, keyboard shortcuts

## Tech Stack

- **Runtime**: [Tauri v2](https://v2.tauri.app/) (Rust backend + webview frontend)
- **Frontend**: React 19, TypeScript, Vite
- **State Management**: Zustand
- **UI**: Custom CSS design system with CSS variables, Lucide React icons
- **Markdown**: react-markdown + remark-gfm + rehype-highlight
- **HTTP Client**: reqwest (Rust) for Ollama API communication

## Prerequisites

- [Node.js](https://nodejs.org/) v18+ and [pnpm](https://pnpm.io/)
- [Rust](https://rustup.rs/) 1.70+
- Tauri system dependencies (Linux):
  ```bash
  sudo apt-get update
  sudo apt-get install -y pkg-config build-essential curl wget file libssl-dev \
    libgtk-3-dev libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev \
    libsoup-3.0-dev libayatana-appindicator3-dev patchelf
  ```
- [Ollama](https://ollama.ai/) running locally or on a remote server

If `pnpm tauri build` fails with `pkg-config` or `glib-2.0` errors, install the packages above and retry.

## Getting Started

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

## Project Structure

```
private-chat-hub-desktop/
  src/                          # React frontend
    components/
      chat/ChatView.tsx         # Chat interface with message bubbles, input, settings
      sidebar/Sidebar.tsx       # Desktop sidebar with navigation and conversation list
      settings/SettingsView.tsx  # Connection, theme, and tool settings
      projects/ProjectsView.tsx  # Project workspace management
      comparison/ComparisonView.tsx  # Side-by-side model comparison
      models/ModelsView.tsx      # Model management (pull/delete/select)
    stores/index.ts             # Zustand state management stores
    types/index.ts              # TypeScript type definitions
    utils/format.ts             # Formatting utilities
    App.tsx                     # Main app component with routing
    App.css                     # Full CSS design system (~900 lines)
  src-tauri/                    # Rust backend
    src/
      lib.rs                    # Tauri app entry point and plugin registration
      models.rs                 # Data models (conversations, messages, settings, etc.)
      ollama.rs                 # Ollama HTTP client (chat, models, streaming)
      commands.rs               # Tauri IPC command handlers
    Cargo.toml                  # Rust dependencies
    tauri.conf.json             # Tauri configuration
    capabilities/default.json   # Permission capabilities
  docs/                         # Product vision and architecture docs (from mobile app)
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Architecture

The app uses a clean separation between the Rust backend and React frontend:

- **Rust Backend** (`src-tauri/`): Handles all Ollama HTTP communication, data models, and system-level operations via Tauri commands
- **React Frontend** (`src/`): Manages UI state with Zustand stores, renders the desktop UI, and communicates with the backend via `@tauri-apps/api/core` invoke calls
- **IPC Commands**: `test_connection`, `list_models`, `show_model`, `pull_model`, `delete_model`, `send_message`, `generate_title`, `compare_models`

## License

Private project.
