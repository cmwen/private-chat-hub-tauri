# UX Design Summary: Multi-Provider Support

## Overview
This document summarizes the recommended UX changes for adding **LM Studio** and enhancing **OpenCode** support in the Tauri app, following patterns from the mature Flutter reference implementation.

## Key Changes at a Glance

### What's Broken Today
1. **No LM Studio support** at all
2. **Settings UI is confusing** - single backend dropdown with smart port switching
3. **Model organization is flat** - no visual grouping by provider
4. **Error messages are generic** - doesn't tell user how to fix issues
5. **Pull Model button disappears** for OpenCode without explanation
6. **Can't save multiple Ollama servers** - only one connection per backend

### What the Fix Looks Like

**Settings Screen:**
- ❌ Remove: Single "Backend Connection" section
- ✅ Add: "🖥️ Self-Hosted Servers" section (Ollama + LM Studio)
  - Ollama subsection with connection list
  - LM Studio subsection with connection list
- ✅ Add: "☁️ Cloud Providers" section (OpenCode)
  - OpenCode connection list

**Models Screen:**
- ❌ Before: Single flat list
- ✅ After: Organized sections
  - Ollama Models (with Pull Model button)
  - LM Studio Models
  - OpenCode Models (with provider filter + visibility controls)

**Connection Management:**
- ✅ Each connection shown in a card with:
  - Server name, URL (host:port)
  - Status badge (Connected/Error)
  - Action buttons: Test | Edit | Delete | Set as Default

**Error Messages:**
```
Ollama Error:
  "Connection failed. Verify Ollama is running at the selected host/port."

LM Studio Error:
  "Connection failed. Verify LM Studio is running and the API token is correct."

OpenCode Error:
  "Connection failed. Verify the address, credentials, and network connection."
```

---

## File Changes Summary

| File | Change | Scope |
|------|--------|-------|
| `src/types/index.ts` | Add `lm_studio` to BackendType | 1-5 lines |
| `src/components/settings/SettingsView.tsx` | Replace ConnectionSettings with 2 new sections | 50-100 lines changed |
| `src/components/models/ModelsView.tsx` | Restructure to sections | 100-150 lines changed |
| `src/stores/index.ts` | Enhance connection management | 30-50 lines added |
| **NEW** | 8 new connection/model components | ~800 lines total |

---

## Component Structure (New)

```
src/components/
├── connections/  [NEW]
│   ├── ProviderConnectionCard.tsx       (displays single connection)
│   ├── ConnectionDialog.tsx              (add/edit form)
│   ├── EmptyConnectionCard.tsx           (empty state)
│   ├── OllamaConnectionsList.tsx         (list + actions)
│   ├── LmStudioConnectionsList.tsx       (list + actions)
│   ├── SectionHeader.tsx                 (reusable header)
│   └── CloudProvidersSection.tsx         (MOVED from settings)
└── models/
    ├── ModelsView.tsx                    (REFACTORED)
    ├── ModelSection.tsx                  [NEW]
    ├── OpenCodeModelSection.tsx          [NEW]
    └── EmptyState.tsx                    [ENHANCED]
```

---

## Visual Design

### Provider Colors
- **Ollama**: 🏢 Blue (#3B82F6)
- **LM Studio**: 🎓 Purple (#8B5CF6)
- **OpenCode**: ☁️ Teal (#14B8A6)

### Settings Section Hierarchy
```
┌─────────────────────────────────────┐
│ ⚙️ SETTINGS                         │
├─────────────────────────────────────┤
│                                     │
│ 🖥️ SELF-HOSTED SERVERS             │
│ Connect to servers on your network  │
│                                     │
│  ─ Ollama ────────────────────────  │
│    [Connection List / Empty State]  │
│                                     │
│  ─ LM Studio ──────────────────────  │
│    [Connection List / Empty State]  │
│                                     │
├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ──  │
│                                     │
│ ☁️  CLOUD PROVIDERS                 │
│ Access hosted models via OpenCode   │
│ [Connection List / Empty State]     │
│                                     │
├─────────────────────────────────────┤
│ (Other sections: Theme, Tools, etc)│
└─────────────────────────────────────┘
```

### Connection Card Layout
```
┌──────────────────────────────────────┐
│ 🏢 My Ollama Server       [Default]  │
│ localhost:11434                      │
│ Last connected: 2 hours ago          │
│ ───────────────────────────────────  │
│ [✓ Test] [✎ Edit] [🗑 Delete]      │
└──────────────────────────────────────┘
```

### Models Section Layout
```
OLLAMA MODELS
[Pull Model Button]
┌──────────────────────────────────────┐
│ llama2  7B  Q4  [●○○] Vision, Tools │
│ [Select]                             │
└──────────────────────────────────────┘

LM STUDIO MODELS
┌──────────────────────────────────────┐
│ neural-chat  3.2B  Q6  [●○○]        │
│ [Select]                             │
└──────────────────────────────────────┘

OPENCODE MODELS  (12/24 visible)
[Search...] [Provider ▼]
[Select All] [Deselect All]
┌──────────────────────────────────────┐
│ claude-3-opus   Claude  [✓ Visible] │
│ [Select]                             │
└──────────────────────────────────────┘
```

---

## UX Patterns from Flutter Reference

The Tauri implementation should follow these proven patterns:

1. **Provider Sections** - Separate UI for each provider type
2. **Connection Cards** - Show saved connections with status
3. **CRUD Operations** - Add/Edit/Delete/Test for each connection
4. **Default Selection** - Mark which connection is active per provider
5. **Empty States** - Contextual guidance when no connections exist
6. **Model Filtering** - Provider-specific filters (OpenCode: visibility toggle + provider dropdown)
7. **Error Guidance** - Provider-specific error messages telling user how to fix
8. **Status Indicators** - Show last connected, connection status, model count

---

## Critical Implementation Details

### Test Connection Response
Currently returns: Boolean
Should return: `{ success: boolean; modelCount?: number; error?: string; }`

This allows showing "Connected · 5 models" instead of just "Connected"

### Backend Dropdown Removal
Current logic in SettingsView (lines 107-113):
```tsx
if (nextBackend === 'opencode' && port === 11434) {
  setPort(4096);
  setPortAutoMessage('Port switched to 4096 for OpenCode');
}
```

This auto-switching should be **removed**. Instead:
- User picks which connection to use
- Each connection already has its port saved
- No auto-switching needed

### Model Organization
Current assumes: All models are from one backend
Should assume: Models come from any combination of Ollama + LM Studio + OpenCode

Updates to store:
```typescript
// Instead of filtering by activeConnection
// Group models by their source:
const ollamaModels = models.filter(m => m.source === 'ollama');
const lmStudioModels = models.filter(m => m.source === 'lm_studio');
const openCodeModels = models.filter(m => m.source === 'opencode');
```

### OpenCode Visibility Management
Keep existing feature BUT enhance UI:
- Currently: Hidden in a settings card
- Should be: Visible in Models screen with provider filter
- Add visual indicator: "12/24 visible" counter

---

## Field Definitions by Provider

### All Providers
- **Name** (required) - User-friendly connection name
- **Host** (required) - Hostname or IP address
- **Port** (required) - Default: Ollama=11434, LM Studio=1234, OpenCode=4096
- **Use HTTPS** (toggle) - Default: false

### LM Studio Only
- **API Token** (optional) - If LM Studio requires authentication

### OpenCode Only
- **Username** (optional) - Defaults to "opencode" if set
- **Password** (optional) - Only if password protection enabled

---

## Error Message Specificity

### Connection Test Failures
```
GENERIC (current):
"Connection failed. Check host and port."

OLLAMA (proposed):
"Connection failed. Verify Ollama is running at localhost:11434 
and check your network settings."

LM STUDIO (proposed):
"Connection failed. Verify LM Studio server is running and 
the API token (if required) is correct."

OPENCODE (proposed):
"Connection failed. Verify the server address, credentials, 
and that your network can reach the server."
```

### Model Loading Issues
```
GENERIC (current):
"No models found. Pull a model to get started."

OLLAMA (proposed):
"No Ollama models found. Use the Pull Model button to 
download models from the Ollama library."

LM STUDIO (proposed):
"No models loaded in LM Studio. Check your LM Studio 
server and load models there."

OPENCODE (proposed):
"No models available. Verify OpenCode server connection 
and that providers are configured."
```

---

## Backward Compatibility Notes

✅ **No breaking changes** - existing chat/conversation data unaffected
✅ **Migration automatic** - first connection becomes default
⚠️ **Connection form changes** - old settings.json format still supported but UI will show new structure

---

## Testing Scenarios

### Happy Path
1. User adds Ollama server → sees connection card → clicks Test → success
2. User adds LM Studio → dialog shows API token field → saves
3. User adds OpenCode → dialog shows username/password fields → saves
4. User can switch default per provider
5. Models from all 3 sources appear in Models screen under sections
6. Can select model from any provider

### Error Paths
1. Ollama offline → provider-specific error message
2. LM Studio with wrong token → specific guidance
3. OpenCode with bad credentials → specific guidance
4. No connections → empty states guide to Settings

### Edge Cases
1. Delete default connection → another auto-becomes default
2. Hide last visible OpenCode model → warning
3. Switch active model while testing → doesn't break
4. Pull model while LM Studio active → disabled (not applicable)

---

## Success Metrics

After implementation:
- ✅ User can add/manage multiple connections per provider
- ✅ Models clearly organized by source
- ✅ Error messages guide user to fix issues
- ✅ Visual distinction between providers
- ✅ All 3 providers equally supported
- ✅ OpenCode visibility filtering works
- ✅ No regression in existing flows

---

## Migration Path (for existing users)

1. App loads → existing connection migrated to new format
2. Settings screen shows new section layout
3. Previous "default" connection marked as default
4. All conversations continue to work
5. No data loss

---

## References

- Full analysis: `UX_ANALYSIS_OPENCODE_LMSTUDIO.md`
- Implementation guide: `UX_IMPLEMENTATION_CHECKLIST.md`
- Flutter reference: `/Users/cmwen/dev/private-chat-hub/lib/screens/settings_screen.dart`

