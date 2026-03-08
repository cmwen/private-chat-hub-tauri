# UX Implementation Checklist: Multi-Provider Support (Ollama, LM Studio, OpenCode)

## SCREEN-BY-SCREEN CHANGES

### ✅ Settings Screen (`src/components/settings/SettingsView.tsx`)

#### What Changes
1. **Line 28**: Replace `<ConnectionSettings />` with two new sections
2. **Add**: New `<SelfHostedServersSection />` (Ollama + LM Studio)
3. **Add**: New `<CloudProvidersSection />` (renamed from OpenCode-only)
4. **Keep**: Lines 30-36 (Theme, Tools, Sync, Data, About)

#### Before
```tsx
export function SettingsView() {
  return (
    <div className="settings-view">
      <h2>Settings</h2>
      <ConnectionSettings />  // ← REPLACE THIS
      <OpencodeModelPreferencesSettings />
      <ThemeSettings />
      ...
    </div>
  );
}
```

#### After
```tsx
export function SettingsView() {
  return (
    <div className="settings-view">
      <h2>Settings</h2>
      <SelfHostedServersSection />      // ← NEW
      <CloudProvidersSection />          // ← NEW (renamed)
      <OpencodeModelPreferencesSettings />
      <ThemeSettings />
      ...
    </div>
  );
}
```

#### Section: Self-Hosted Servers
**Header**: 🖥️ Self-Hosted Servers
**Description**: "Connect to servers running on your local network"

**Subsection 1: Ollama**
- Description: "Connect to Ollama to run open-source models"
- Component: `<OllamaConnectionsList />`
- Shows: List of Ollama connections OR empty state

**Subsection 2: LM Studio**
- Description: "Connect to LM Studio to access models via REST API"
- Component: `<LmStudioConnectionsList />`
- Shows: List of LM Studio connections OR empty state

#### Section: Cloud Providers
**Header**: ☁️ Cloud Providers (via OpenCode)
**Description**: "Connect to OpenCode gateway to access hosted providers"

**Component**: `<OpenCodeConnectionsList />`
- Shows: List of OpenCode connections OR empty state

---

### ✅ Models Screen (`src/components/models/ModelsView.tsx`)

#### What Changes
1. **Restructure**: From single flat list → sectioned by provider
2. **Add**: Section headers (Ollama Models, LM Studio Models, OpenCode Models)
3. **Enhance**: Provider-specific empty states
4. **Modify**: Pull Model button (only show for Ollama section)

#### Before
```tsx
export function ModelsView() {
  const { models, isLoading, error } = useModelStore();
  const isOpencode = activeConnection?.backend === 'opencode';

  return (
    <div className="models-view">
      <div className="view-header">...</div>
      
      {!isOpencode && <PullModelCard />}  // ← Confusing logic
      {error && <div className="error-banner">{error}</div>}
      
      <div className="model-grid">
        {models.map(model => <ModelCard ... />)}
      </div>
    </div>
  );
}
```

#### After
```tsx
export function ModelsView() {
  const { models, isLoading, error } = useModelStore();
  const { ollamaModels, lmStudioModels, openCodeModels } = 
    useSeparatedModels(models);

  return (
    <div className="models-view">
      <div className="view-header">
        <h2><Cpu size={24} /> Models</h2>
        <button className="btn btn-secondary" onClick={fetchModels}>
          <RefreshCw /> Refresh
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Ollama Section */}
      {ollamaModels.length > 0 && (
        <ModelSection
          title="Ollama Models"
          icon={<Cpu size={18} />}
          models={ollamaModels}
          onSelect={setSelectedModel}
          onDelete={deleteModel}
        />
      )}
      {ollamaModels.length === 0 && isOllamaConnected && (
        <OllamaEmptyState onShowPullDialog={showPullDialog} />
      )}

      {/* LM Studio Section */}
      {lmStudioModels.length > 0 && (
        <ModelSection
          title="LM Studio Models"
          icon={<Cpu size={18} />}
          models={lmStudioModels}
          onSelect={setSelectedModel}
        />
      )}
      {lmStudioModels.length === 0 && isLmStudioConnected && (
        <LmStudioEmptyState />
      )}

      {/* OpenCode Section */}
      {openCodeModels.length > 0 && (
        <OpenCodeModelSection
          models={openCodeModels}
          onSelect={setSelectedModel}
          onVisibilityChange={setModelVisibility}
          filterOptions={providers}
        />
      )}

      {/* Global Empty State */}
      {!isLoading && models.length === 0 && (
        <GlobalEmptyState />
      )}
    </div>
  );
}
```

#### New Components for Models View
1. `<ModelSection />` - Generic section for Ollama/LM Studio
2. `<OpenCodeModelSection />` - Special section for OpenCode (with filters)
3. `<OllamaEmptyState />` - Ollama-specific guidance
4. `<LmStudioEmptyState />` - LM Studio-specific guidance
5. `<GlobalEmptyState />` - When no connections exist

---

### ✅ Connection Types (`src/types/index.ts`)

#### Add/Modify Types
```typescript
// Extend BackendType
export type BackendType = 'ollama' | 'lm_studio' | 'opencode';

// Extend Connection interface
export interface Connection {
  id: string;
  name: string;
  backend: BackendType;
  host: string;
  port: number;
  useHttps: boolean;
  isDefault: boolean;
  createdAt: string;
  lastConnectedAt?: string;
}

// Provider-specific extensions (if needed later)
export interface OllamaConnection extends Connection {
  backend: 'ollama';
  // No additional fields
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

---

## NEW COMPONENTS TO CREATE

### 1. `src/components/connections/ProviderConnectionCard.tsx`
**Purpose**: Display a single saved connection
**Shows**:
- Provider icon + connection name
- Host:port URL
- Status badge (Connected/Disconnected/Error)
- Last connected timestamp
- Action buttons: [Test] [Edit] [Delete] [Set as Default]

**Props**:
```typescript
interface ProviderConnectionCardProps {
  connection: Connection;
  isDefault: boolean;
  isConnected: boolean;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  lastConnectedAt?: string;
}
```

**Styling**:
- Background: Light accent color (varies by provider)
- Icon: Provider-specific (🏢 Ollama, 🎓 LM Studio, ☁️ OpenCode)
- Border on left side with provider color

---

### 2. `src/components/connections/ConnectionDialog.tsx`
**Purpose**: Add/Edit connection for any provider
**Shows**:
- Form title: "Add/Edit [Provider] Server"
- Common fields:
  - Server Name (text, required)
  - Host (text, required)
  - Port (number, provider-specific default)
  - Use HTTPS (toggle)
- Provider-specific fields:
  - **LM Studio**: API Token (password field, optional)
  - **OpenCode**: Username (text, optional), Password (password, optional)
  - **Ollama**: None additional

**Props**:
```typescript
interface ConnectionDialogProps {
  provider: 'ollama' | 'lm_studio' | 'opencode';
  connection?: Connection;
  onSave: (draft: ConnectionDraft) => void;
  onCancel: () => void;
}
```

---

### 3. `src/components/connections/EmptyConnectionCard.tsx`
**Purpose**: Show when no connections exist for a provider
**Shows**:
- Large icon (provider-specific, 48px)
- Title: "No [Provider] servers"
- Description text (provider-specific help)
- CTA Button: "[Add Server]"

**Props**:
```typescript
interface EmptyConnectionCardProps {
  provider: 'ollama' | 'lm_studio' | 'opencode';
  onAddConnection: () => void;
}
```

**Example Content**:
| Provider | Title | Description | CTA |
|----------|-------|-------------|-----|
| Ollama | No Ollama servers | Add a local Ollama server to get started | Add Server |
| LM Studio | No LM Studio servers | Connect to LM Studio running on your network | Add Server |
| OpenCode | No OpenCode servers | Add an OpenCode gateway to access cloud providers | Add Server |

---

### 4. `src/components/connections/OllamaConnectionsList.tsx`
**Purpose**: Manage all Ollama connections
**Shows**:
- List of `<ProviderConnectionCard />` (one per connection)
- `<EmptyConnectionCard />` (if none exist)
- "[Add Server]" button at bottom (if any exist)

**Features**:
- Test connection
- Edit connection
- Delete connection with confirmation
- Set as default
- Show last connected timestamp

---

### 5. `src/components/connections/LmStudioConnectionsList.tsx`
**Purpose**: Manage all LM Studio connections
**Shows**:
- List of `<ProviderConnectionCard />` (one per connection)
- `<EmptyConnectionCard />` (if none exist)
- "[Add Server]" button at bottom

**Features**:
- Same as Ollama
- Plus: API Token handling in dialog

---

### 6. `src/components/connections/SectionHeader.tsx`
**Purpose**: Reusable section header
**Shows**:
- Icon
- Title
- Optional badge (e.g., "● Running" for sync)

**Props**:
```typescript
interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  badge?: string;
}
```

---

### 7. `src/components/models/ModelSection.tsx`
**Purpose**: Group models with header and actions
**Shows**:
- Section header (provider name)
- List of model cards
- Optional: Section-specific controls

**Props**:
```typescript
interface ModelSectionProps {
  title: string;
  icon?: React.ReactNode;
  models: OllamaModel[];
  onSelect: (model: string) => void;
  onDelete?: (model: string) => void;
  selectedModel?: string;
  isLoading?: boolean;
}
```

---

### 8. `src/components/models/OpenCodeModelSection.tsx`
**Purpose**: Manage OpenCode models with filtering
**Shows**:
- Section header with model count
- Search field: "Filter OpenCode models"
- Provider dropdown filter
- [Select All] [Deselect All] buttons
- List of model cards with visibility toggles

**Props**:
```typescript
interface OpenCodeModelSectionProps {
  models: OllamaModel[];
  providers: string[];
  onSelect: (model: string) => void;
  onVisibilityChange: (model: string, visible: boolean) => void;
  selectedModel?: string;
}
```

---

## TEXT/LABEL CHANGES

### Settings Screen Headers
```
CURRENT: "Backend Connection"
CHANGE TO: Remove this section entirely

ADD NEW: "🖥️ Self-Hosted Servers"
ADD NEW: "☁️ Cloud Providers (via OpenCode)"
```

### Connection Dialog Titles
```
For Ollama:
  Add: "Add Ollama Server"
  Edit: "Edit Ollama Server"

For LM Studio:
  Add: "Add LM Studio Server"
  Edit: "Edit LM Studio Server"

For OpenCode:
  Add: "Add OpenCode Server"
  Edit: "Edit OpenCode Server"
```

### Description Text
```
Self-Hosted Servers:
  "Connect to servers running on your local network"

Ollama:
  "Connect to Ollama to run open-source models"

LM Studio:
  "Connect to LM Studio to access models via REST API"

Cloud Providers:
  "Connect to OpenCode gateway to access hosted providers (Claude, GPT, Gemini, etc.)"
```

### Connection Test Results
```
SUCCESS:
  Current: "Connected successfully"
  New: "Connected · 5 models available" (if count available)
  
ERROR (Ollama):
  Current: "Connection failed. Verify Ollama is running..."
  New: "Connection failed. Verify Ollama is running at the selected host/port."

ERROR (LM Studio):
  New: "Connection failed. Verify LM Studio is running and the API token (if set) is correct."

ERROR (OpenCode):
  Current: "Verify host/port, auth, and that opencode serve is running."
  New: "Connection failed. Verify the address, credentials, and network connection."
```

### Models Screen Empty States
```
CURRENT:
  Generic: "Connect to a backend to see available models."
  Ollama-specific: "No models found. Pull a model to get started."

NEW:
  No connections: "Add a connection in Settings to get started."
  
  Ollama (no models): "No Ollama models found. Pull a model to begin chatting."
  
  LM Studio (no models): "No LM Studio models available. Check your server connection."
  
  OpenCode (no models): "No models available from connected OpenCode providers."
  
  Pull Model info: "Tip: Use 'Pull Model' to download new models from Ollama library"
```

### Model Cards/Visibility
```
CURRENT: Silent hiding of pull UI for OpenCode
NEW: Explicit section separation + provider-specific guidance
```

---

## STORE CHANGES (`src/stores/index.ts`)

### Connection Store Enhancements

**Current**:
```typescript
const useConnectionStore = create<{
  connections: Connection[];
  activeConnection?: Connection;
  isConnected: boolean;
  testConnection: (...) => Promise<boolean>;
  updateConnection: (...) => Promise<void>;
  // ...
}>(...)
```

**Add Support For**:
- Multiple connections per provider (not just 1 per backend)
- Default connection tracking per provider
- Last connected timestamp
- Separate default for each provider type

**Key Methods to Update**:
- `testConnection()` - enhance error messages by provider
- `updateConnection()` - handle provider-specific fields
- `addConnection()` - validate provider-specific fields

---

## STYLING/CSS ADDITIONS

### Provider Colors
```css
--color-ollama: #3B82F6;    /* Blue */
--color-lm-studio: #8B5CF6; /* Purple */
--color-opencode: #14B8A6;  /* Teal */
```

### Icon Placement
- Connection cards: 🏢 Ollama, 🎓 LM Studio, ☁️ OpenCode
- Section headers: same icons
- Model cards: optional provider badge (for OpenCode especially)

### Section Layout
```css
.settings-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.settings-section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.settings-subsection {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px dashed var(--border-color);
}
```

---

## IMPLEMENTATION ORDER

### Phase 1: Foundation (3-4 hours)
- [ ] Create new types in `types/index.ts`
- [ ] Create new connection components:
  - [ ] `ProviderConnectionCard.tsx`
  - [ ] `ConnectionDialog.tsx`
  - [ ] `EmptyConnectionCard.tsx`
  - [ ] `SectionHeader.tsx`

### Phase 2: Settings Refactor (4-5 hours)
- [ ] Create `OllamaConnectionsList.tsx`
- [ ] Create `LmStudioConnectionsList.tsx`
- [ ] Create `SelfHostedServersSection.tsx`
- [ ] Rename/refactor `CloudProvidersSection.tsx`
- [ ] Update `SettingsView.tsx` to use new sections
- [ ] Update connection store methods

### Phase 3: Models View (3-4 hours)
- [ ] Create `ModelSection.tsx`
- [ ] Create `OpenCodeModelSection.tsx`
- [ ] Create empty state components
- [ ] Refactor `ModelsView.tsx` for sections
- [ ] Update styling

### Phase 4: Testing & Polish (2-3 hours)
- [ ] Test all connection flows (add/edit/delete/test)
- [ ] Test model selection across providers
- [ ] Verify error messages
- [ ] Refine CSS/spacing

**Total Estimated Time**: 12-16 hours

---

## QUALITY CHECKLIST

### UX
- [ ] All provider types visible in settings
- [ ] Can manage multiple connections per provider
- [ ] Clear visual distinction between providers
- [ ] Provider-specific error messages
- [ ] Empty states guide user to fix issue

### Functionality
- [ ] Test connection works for all providers
- [ ] Models load correctly per provider
- [ ] Model selection persists per provider
- [ ] OpenCode model visibility filtering works
- [ ] Pull model only shows for Ollama

### Visual
- [ ] Consistent spacing/padding
- [ ] Icon usage consistent
- [ ] Colors are distinct per provider
- [ ] Responsive on different widths
- [ ] Dark mode compatible

---

