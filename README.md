# Private Chat Hub Desktop

Universal AI Chat Platform for Desktop - Privacy-first chat with local, self-hosted, and cloud AI models.

Desktop companion to the [Private Chat Hub](../private-chat-hub) mobile app, rebuilt with Tauri + React + TypeScript for a native desktop experience.

## Features

- **Ollama Integration** - Connect to local or remote Ollama instances with health monitoring
- **LM Studio + OpenCode Support** - Switch between multiple backend types from one desktop app
- **Streaming Chat** - Real-time AI chat with markdown rendering and code highlighting
- **Conversation Management** - Auto-titled conversations, search, delete, per-conversation settings
- **Project Workspaces** - Organize conversations into projects with pin/unpin support
- **Syncthing Folder Mode** - Mirror chat/project history into structured files that can sync across devices
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

## Validation

The repository currently ships with build verification, but no dedicated `test` script in `package.json`.

```bash
# Frontend type-check + production build
pnpm build

# Rust/Tauri backend compile check
cd src-tauri && cargo check -q
```

## Folder Mode and Syncthing

Private Chat Hub now supports a **folder-backed mode** intended for tools like Syncthing.

- Enable it from **Settings → Folder Mode (Syncthing)**
- Choose a folder such as `~/Syncthing/private-chat-hub`
- When enabled, that folder becomes the **source of truth**
- The local Tauri store is still written as a **performance cache** for faster startup and recovery

### What gets written

The desktop app stores portable JSON plus attachment files:

```text
shared-folder/
  sync-meta.json
  workspace-state.json
  conversations/
    <conversation-id>/
      meta.json
      messages.json
      attachments/
        <attachment-id>-<name>
  projects/
    <project-id>.json
```

### State restored from another device

Folder mode persists enough metadata to restore the working state in another app or device, including:

- conversation/project IDs
- titles and timestamps
- model name and backend type used
- backend session IDs when available
- system prompt and sampling parameters
- message status, token counts, tool calls, and reasoning text
- attachments as sibling files
- active conversation/project pointers in `workspace-state.json`

### Safety model

- If a folder write succeeds, the local cache is marked clean and future launches hydrate from the folder snapshot.
- If a folder write fails, the app keeps the newer local cache and records that there are pending local changes.
- On the next launch, folder hydration is skipped until the user reviews the data and writes a fresh snapshot.
- Connection secrets (passwords, API tokens) stay local and are **not** written into the shared folder.

### Recommended Syncthing setup

1. Create one dedicated folder for Private Chat Hub history.
2. Share that folder to your other devices with Syncthing.
3. Wait for the initial sync to finish before opening the app elsewhere.
4. Use **Write Snapshot Now** before switching devices if you want an immediate handoff.
5. Use **Reload from Folder** when another device has already updated the shared files.

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

## Releases and Auto Update

### Current release flow

`.github/workflows/release.yml` builds tagged releases on GitHub Actions and uploads the desktop bundles to GitHub Releases:

- macOS: `dmg`, `app`
- Windows: `nsis`, `msi`
- Linux: `deb`

Today this workflow produces installable release artifacts, but the app does **not** yet self-update automatically.

### How Tauri auto update works

Tauri's updater model is:

1. The installed app checks an update endpoint (commonly a GitHub Releases-hosted `latest.json`)
2. The endpoint points to the newest platform-specific bundle
3. The bundle is signed with a long-lived Tauri signing key during CI
4. The app verifies the downloaded signature using the public key embedded in `tauri.conf.json`
5. If the signature and version are valid, the updater downloads, installs, and relaunches

### What still needs to be added

To turn on auto update for this repo safely, the project still needs:

- the Tauri updater plugin wired into `src-tauri`
- updater permissions and config in `tauri.conf.json`
- a stable signing key pair (private key stored in GitHub Actions secrets)
- release workflow updates so CI publishes signed updater metadata/assets
- platform signing/notarization strategy, especially for macOS and Windows trust prompts

In short: **GitHub Releases already handles distribution, but auto update requires signed updater metadata plus CI secrets before it should be enabled.**

## License

Private project.
