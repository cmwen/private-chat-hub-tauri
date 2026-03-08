# UX Analysis: Adding OpenCode & LM Studio Support to Tauri App

## Executive Summary
The Tauri app currently supports **only Ollama** as a backend provider. The Flutter reference app shows a mature pattern for managing **3 self-hosted providers** (Ollama, LM Studio, OpenCode) plus on-device models. This analysis identifies exactly which screens and components need to be modified to bring unified multi-provider support to the Tauri app.

---

## CURRENT STATE: TAURI APP

### Current Providers Supported
- **Ollama only** (single backend dropdown in settings)

### Current UX Flow
1. **Settings → Backend Connection** (single unified form)
   - Backend dropdown: "Ollama" | "OpenCode Server"
   - Host/Port fields (auto-switches port: 11434 ↔ 4096)
   - HTTPS checkbox
   - Optional auth (username/password for OpenCode only)
   - "Test Connection" button
   - Status badge (Connected/Disconnected)

2. **Models Screen**
   - Single model list (from active connection)
   - Shows "Pull Model" button (only for Ollama)
   - Readonly state when OpenCode is active
   - Empty state messaging differs by backend

3. **Settings → OpenCode Model Dropdown**
   - Conditional section (only shown when OpenCode is active)
   - Multi-select interface to filter which models appear in chat

### Current Issues/Gaps
- **No LM Studio support** at all
- **Single connection per backend** - can't have multiple Ollama servers
- **Model organization** - doesn't separate models by source
- **Test result messaging** - generic error for both providers
- **Pull model UI** - only works for Ollama, hides for OpenCode

---

## REFERENCE IMPLEMENTATION: FLUTTER APP

### Providers Supported (3 sources)
1. **Ollama** (self-hosted)
2. **LM Studio** (self-hosted, REST API)
3. **OpenCode** (gateway to cloud providers)

### Settings Screen Architecture
```
┌─ Settings Screen ──────────────────────────────┐
│                                               │
│ 🔗 SELF-HOSTED SERVERS                       │
│  ├─ Ollama                                   │
│  │  ├─ [List of Ollama connections]         │
│  │  ├─ [Add Connection button]               │
│  │  └─ Description: "Connect to Ollama..."  │
│  │                                           │
│  ├─ LM Studio                                │
│  │  ├─ [List of LM Studio connections]      │
│  │  ├─ [Add Connection button]               │
│  │  └─ Description: "Connect to LM Studio..." │
│  │                                           │
│  ├─ [Section divider]                        │
│  │                                           │
│  └─ OpenCode Servers                         │
│     ├─ [List of OpenCode connections]        │
│     ├─ [Add Connection button]                │
│     └─ Description: "Connect to OpenCode..." │
│                                               │
│ 🎨 APPEARANCE                                │
│ ...other sections...                         │
└───────────────────────────────────────────────┘
```

### Connection Management Pattern

**For each provider, Flutter implements:**
1. **Connection List Card** (_SavedServerCard)
   - Icon + accent color (color-coded by provider)
   - Server name
   - Subtitle (full URL)
   - Default badge (if default)
   - Last connected timestamp
   - Action buttons: Test | Edit | Delete | [Set as Default]

2. **Empty State Card** (_EmptyProviderConnectionsCard)
   - Large icon (48px)
   - Title: "No [Provider] servers"
   - Subtitle: provider-specific help text
   - "Add Server" button

3. **Connection Dialog** (Add/Edit)
   - Dialog title: "Add/Edit [Provider] Server"
   - Form fields:
     - Server Name (required)
     - Host (required)
     - Port (pre-filled with defaults)
     - Use HTTPS toggle
     - Provider-specific fields:
       - **Ollama**: None additional
       - **LM Studio**: API Token (optional)
       - **OpenCode**: Username + Password (optional)

### Models Screen Architecture
```
┌─ Models Screen ────────────────────────────────┐
│                                               │
│ 📦 ON-DEVICE MODELS                          │
│    [Local model cards] (with visibility toggle)│
│                                               │
│ 🏢 OLLAMA MODELS                             │
│    [Ollama model cards]                      │
│    (delete, details, visibility toggle)       │
│                                               │
│ 🎓 LM STUDIO MODELS                          │
│    [LM Studio model cards]                   │
│    (visibility toggle only)                   │
│                                               │
│ ☁️  OPENCODE MODELS                          │
│    ├─ Provider Filter dropdown               │
│    ├─ Search field                           │
│    ├─ [Select All] [Deselect All] buttons    │
│    ├─ Visible: N/Total count                 │
│    └─ [Model cards with visibility]          │
│                                               │
└───────────────────────────────────────────────┘
```

### Key Flutter Patterns to Adopt

**1. Sectioned Organization**
- Clear visual sections with headers
- Each provider gets its own section
- Clear dividers between sections

**2. Provider-Specific Labels**
- "Ollama" vs "LM Studio" vs "OpenCode"
- Consistent naming in dialogs, cards, and UI

**3. Connection Test Feedback**
- Success: "Connected · N models"
- Error: Provider-specific guidance
  - Ollama: "Check host and port"
  - LM Studio: "Check address and token"
  - OpenCode: "Check address, credentials, and network"

**4. Model Selection**
- Source-aware: each model tagged with its provider
- Visibility toggles for cloud providers (OpenCode)
- Provider filter dropdown for OpenCode only

**5. Empty States**
- Detailed empty state when no connections exist
- Contextual help text
- Call-to-action button

---

## RECOMMENDED TAURI UX CHANGES

### 1. Settings Screen Restructuring

**CURRENT:**
```jsx
<ConnectionSettings />         // Single form
<OpencodeModelPreferencesSettings /> // Conditional
```

**PROPOSED:**
```jsx
<SelfHostedServersSection>     // NEW wrapper
  <OllamaConnectionsList />     // NEW
  <LmStudioConnectionsList />   // NEW
</SelfHostedServersSection>
<OpenCodeServersSection>       // RENAME + REORGANIZE
  <OpenCodeConnectionsList />   // REFACTOR
</OpenCodeServersSection>
<OpenCodeModelPreferencesSettings /> // Keep but improve
```

### 2. Connection Management (NEW COMPONENTS)

#### A. Provider Connection Card (`ProviderConnectionCard.tsx`)
**Replaces:** Current inline connection display
**Shows:**
- Provider icon + name
- Connection URL (host:port)
- Status badge (Connected/Disconnected/Error)
- Last connected timestamp
- Action buttons: [Test] [Edit] [Delete] [Set as Default]

**Props:**
```typescript
interface ProviderConnectionCardProps {
  provider: 'ollama' | 'lm_studio' | 'opencode';
  connection: Connection;
  isDefault: boolean;
  lastConnectedAt?: string;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault?: () => void;
}
```

#### B. Connection Dialog (`ConnectionDialog.tsx`)
**Replaces:** Inline form in settings
**Shows:** Add/Edit dialog with provider-specific fields

**Props:**
```typescript
interface ConnectionDialogProps {
  provider: 'ollama' | 'lm_studio' | 'opencode';
  initialConnection?: Connection;
  onSave: (connection: ConnectionDraft) => void;
  onCancel: () => void;
}
```

**Fields by Provider:**
- **Ollama**: name, host, port, useHttps
- **LM Studio**: name, host, port, useHttps, apiToken (optional)
- **OpenCode**: name, host, port, useHttps, username (optional), password (optional)

#### C. Empty Connection Card (`EmptyConnectionCard.tsx`)
**New:** Shows when no connections exist for a provider

**Shows:**
- Large icon (provider-specific)
- Title: "No [Provider] servers"
- Provider description text
- "[Add Server]" button

#### D. Section Header (`SectionHeader.tsx`)
**New:** Organizes providers into sections

**Shows:**
- Section icon
- Section title
- Optional badge (count, status)

### 3. Models View Enhancement

#### Current Tauri:
- Single model list
- "Pull Model" button (only Ollama)
- Empty state text varies by backend

#### Proposed Tauri:
- **Sectioned by provider**
  - Ollama Models
  - LM Studio Models
  - OpenCode Models
- **Provider-specific UI:**
  - Ollama only: "Pull Model" button
  - All: Model list with selection
  - OpenCode: Add visibility control
- **Better empty states:**
  - "No connections" → link to settings
  - "No models yet" → provider-specific guidance

#### New Empty State Messages:
- **No Ollama connection**: "Add an Ollama connection in Settings to get started"
- **No LM Studio connection**: "Add an LM Studio connection in Settings"
- **No OpenCode connection**: "Connect to OpenCode to access cloud models"
- **No models pulled**: "Pull a model to begin chatting" (Ollama-specific)

### 4. Settings Form Updates

#### Backend Connection → Connection Management
**Change structure from:**
- Single dropdown (backend selector)
- Single connection form

**To:**
- Each provider has its own connection list
- Each connection is independent (can have multiple Ollama servers)
- Add/Edit/Delete actions per connection
- Separate "Set as Default" for each provider

#### Test Result Messages

**Improve specificity:**

| Current | Provider | Proposed |
|---------|----------|----------|
| "Connection failed" | Ollama | "Connection failed. Verify Ollama is running at the selected host/port." |
| "Connection failed" | LM Studio | "Connection failed. Verify LM Studio is running and the API token is correct." |
| "Connection failed" | OpenCode | "Connection failed. Verify the server address, credentials, and network connection." |

---

## EXACT SCREEN/COMPONENT CHANGES

### File: `src/components/settings/SettingsView.tsx`

#### Current Sections:
1. `ConnectionSettings()` - REFACTOR
2. `OpencodeModelPreferencesSettings()` - KEEP + ENHANCE
3. `ThemeSettings()` - NO CHANGE
4. `ToolSettings()` - NO CHANGE
5. `LanSyncSettings()` - NO CHANGE
6. `DataManagement()` - NO CHANGE
7. `AboutSection()` - NO CHANGE

#### Changes:

**REMOVE:**
```tsx
<ConnectionSettings />  // Line 28
```

**REPLACE WITH:**
```tsx
<SelfHostedServersSection />      // NEW
<CloudServersSection />           // Renamed from OpenCode
```

**NEW `SelfHostedServersSection` component:**
- Header: "🖥️ Self-Hosted Servers"
- Description: "Connect to servers running on your local network"
- Subsection: "Ollama"
  - Description: "Connect to Ollama to run open-source models"
  - `<OllamaConnectionsList />`
- Subsection: "LM Studio"
  - Description: "Connect to LM Studio to access models via REST API"
  - `<LmStudioConnectionsList />`
- Divider

**REFACTORED `OpencodeModelPreferencesSettings`:**
- Rename to better reflect cloud provider visibility
- Enhance with section header explaining purpose
- Only show when OpenCode is active

### File: `src/components/models/ModelsView.tsx`

#### Current Structure:
```tsx
export function ModelsView() {
  // Single model list
  return (
    <div className="models-view">
      <div className="view-header">...</div>
      {!isOpencode && <PullModelCard />}
      {error && <ErrorBanner />}
      <div className="model-grid">
        {models.map(model => <ModelCard />)}
      </div>
    </div>
  );
}
```

#### Proposed Structure:
```tsx
export function ModelsView() {
  // Separate state for each provider
  const ollamaModels = models.filter(...);
  const lmStudioModels = models.filter(...);
  const openCodeModels = models.filter(...);
  
  return (
    <div className="models-view">
      <div className="view-header">...</div>
      
      {/* Ollama Section */}
      {ollamaModels.length > 0 && (
        <ModelSection
          title="Ollama Models"
          icon="🏢"
          models={ollamaModels}
        />
      )}
      {ollamaModels.length === 0 && isOllamaConnected && (
        <EmptyModelSection 
          provider="ollama"
          onPull={handleShowPullDialog}
        />
      )}
      
      {/* LM Studio Section */}
      {lmStudioModels.length > 0 && (
        <ModelSection
          title="LM Studio Models"
          icon="🎓"
          models={lmStudioModels}
        />
      )}
      
      {/* OpenCode Section */}
      {openCodeModels.length > 0 && (
        <OpenCodeModelSection
          models={openCodeModels}
          onVisibilityChange={handleVisibilityChange}
          filterOptions={providers}
        />
      )}
    </div>
  );
}
```

### File: `src/types/index.ts`

#### Add Type:
```typescript
// Extend existing BackendType
export type BackendType = 'ollama' | 'opencode' | 'lm_studio';

// Add connection-specific types
export interface OllamaConnection extends Connection {
  backend: 'ollama';
}

export interface LmStudioConnection extends Connection {
  backend: 'lm_studio';
  apiToken?: string;
}

export interface OpenCodeConnection extends Connection {
  backend: 'opencode';
  username?: string;
  password?: string;
}
```

### File: `src/stores/index.ts`

#### Enhance Connection Store:
```typescript
// Current: single activeConnection
// New: multiple connections per provider

type UseConnectionStore = {
  // Existing
  connections: Connection[];
  activeConnection?: Connection;
  
  // Enhanced
  ollamaConnections: OllamaConnection[];
  lmStudioConnections: LmStudioConnection[];
  openCodeConnections: OpenCodeConnection[];
  
  // New methods
  addConnection(backend: BackendType, conn: ConnectionDraft): Promise<void>;
  updateConnection(id: string, conn: Partial<Connection>): Promise<void>;
  deleteConnection(id: string): Promise<void>;
  setDefaultConnection(id: string): Promise<void>;
  getConnectionsByBackend(backend: BackendType): Connection[];
};
```

---

## NEW COMPONENTS TO CREATE

### 1. `src/components/connections/ProviderConnectionCard.tsx`
- Displays single connection
- Shows status, URL, actions
- Provider-specific styling

### 2. `src/components/connections/ConnectionDialog.tsx`
- Add/Edit connection form
- Provider-specific field rendering
- Form validation

### 3. `src/components/connections/EmptyConnectionCard.tsx`
- Empty state when no connections
- Provider-specific messaging
- CTA button

### 4. `src/components/connections/OllamaConnectionsList.tsx`
- List of Ollama connections
- Add/Edit/Delete/Test actions
- Default selection

### 5. `src/components/connections/LmStudioConnectionsList.tsx`
- List of LM Studio connections
- Add/Edit/Delete/Test actions
- API token handling

### 6. `src/components/connections/SectionHeader.tsx`
- Reusable section header
- Icon + title + optional badge

### 7. `src/components/models/ModelSection.tsx`
- Section wrapper for grouped models
- Shows provider label
- Configurable actions per section

### 8. `src/components/models/OpenCodeModelSection.tsx`
- OpenCode-specific section
- Filter dropdown
- Search field
- Visibility toggles
- Select All / Deselect All

---

## INCONSISTENCIES & RED FLAGS IN CURRENT TAURI UX

### 1. ❌ Port Auto-Switch (Line 107-113 in SettingsView)
**Issue:** Changes port when user switches backend
**Better:** Keep backend and connection separate; user picks which connection

### 2. ❌ Username Default (Line 56)
**Issue:** Hardcoded `'opencode'` as default username
**Better:** Leave empty, show placeholder "Defaults to opencode"

### 3. ❌ OpenCode Pull Model Hidden (Line 80)
**Issue:** Disables "Pull Model" UI for OpenCode
**Problem:** User never sees reason why button is missing
**Better:** Show context-specific message or move to separate UI

### 4. ❌ Generic Empty State (Line 132)
**Issue:** "Connect to a backend to see available models"
**Better:** "No Ollama connection found" or "Add an OpenCode server in Settings"

### 5. ❌ Model Preferences Only for OpenCode (Line 227-229)
**Issue:** Section doesn't explain its purpose
**Better:** Add header: "Filter OpenCode Models" with context

### 6. ❌ Single Active Connection
**Issue:** Can't save multiple Ollama servers
**Better:** Support multiple connections, mark one as default per provider

### 7. ❌ No LM Studio Support
**Issue:** Complete gap in provider support
**Better:** Add LM Studio as first-class provider

---

## VISUAL/STYLING CONSISTENCY

### Color Coding by Provider
**Proposed scheme:**
- **Ollama**: Blue (#3B82F6)
- **LM Studio**: Purple (#8B5CF6)  
- **OpenCode**: Teal (#14B8A6)

Apply to:
- Connection card icons
- Section headers
- Status badges
- Model cards (optional: provider indicator)

### Icons by Provider
- **Ollama**: 🏢 (factory/server)
- **LM Studio**: 🎓 (graduation cap/education)
- **OpenCode**: ☁️ (cloud/gateway)

---

## MIGRATION STRATEGY

### Phase 1: Foundation
- [ ] Create new connection components
- [ ] Update types (add LM Studio)
- [ ] Update store to support multiple connections

### Phase 2: Settings Refactor
- [ ] Create SelfHostedServersSection
- [ ] Implement OllamaConnectionsList
- [ ] Implement LmStudioConnectionsList
- [ ] Add ConnectionDialog for all providers
- [ ] Update test result messages

### Phase 3: Models View
- [ ] Create ModelSection component
- [ ] Implement sectioned model display
- [ ] Add provider-specific empty states
- [ ] Enhance OpenCode visibility controls

### Phase 4: Polish
- [ ] Add color coding by provider
- [ ] Icons in section headers
- [ ] Refine error messages
- [ ] Test all flows

---

## RECOMMENDED COPY CHANGES

### Section Headers
```
BEFORE: "Backend Connection"
AFTER:  "🖥️ Self-Hosted Servers"

BEFORE: [implicit OpenCode section]
AFTER:  "☁️ Cloud Providers (via OpenCode)"
```

### Connection Dialog Titles
```
BEFORE: "Edit OpenCode Server" | "Add OpenCode Server"
AFTER:
- "Add Ollama Server" / "Edit Ollama Server"
- "Add LM Studio Server" / "Edit LM Studio Server"
- "Add OpenCode Server" / "Edit OpenCode Server"
```

### Test Results
```
BEFORE: "Connected successfully"
AFTER:  "Connected · 5 models" (with model count for OpenCode)

BEFORE: "Connection failed..."
AFTER:
- Ollama: "Connection failed. Verify Ollama is running at the selected host/port."
- LM Studio: "Connection failed. Verify LM Studio is running and the API token is correct."
- OpenCode: "Connection failed. Verify address, credentials, and network."
```

### Empty States
```
BEFORE: "Connect to a backend to see available models."
AFTER:
- No Ollama: "No Ollama connection found. Add one in Settings."
- No LM Studio: "No LM Studio connection found. Add one in Settings."
- No OpenCode: "No OpenCode server found. Add one in Settings."
- All connected but no models: "[Provider]-specific guidance"
```

---

## SUMMARY TABLE

| Aspect | Current State | Target State |
|--------|---------------|--------------|
| **Providers** | Ollama + OpenCode | Ollama + LM Studio + OpenCode |
| **Connections** | Single per backend | Multiple per provider |
| **Settings UI** | Single form | Sectioned provider lists |
| **Connection mgmt** | Basic fields | Full CRUD with test/default |
| **Models view** | Single list | Sectioned by provider |
| **LM Studio support** | ❌ None | ✅ Full |
| **Empty states** | Generic | Provider-specific |
| **Visual hierarchy** | Flat | Organized by provider |
| **Error messaging** | Generic | Provider-specific guidance |

