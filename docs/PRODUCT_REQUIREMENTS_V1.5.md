# Product Requirements: Private Chat Hub v1.5 - Cloud API Integration

**Document Version:** 1.0  
**Created:** January 26, 2026  
**Status:** Active Planning  
**Target Release:** Q2 2026 (6-8 weeks)  
**Related:** [PRODUCT_VISION.md](PRODUCT_VISION.md)

---

## 📋 Document Overview

This document defines **functional** and **non-functional requirements** for Private Chat Hub v1.5, which transforms the app from an Ollama-focused client into a **universal AI chat hub** supporting:

1. **Local Models** (LiteRT/Gemini Nano) - Already implemented ✅
2. **Self-Hosted Models** (Ollama) - Already implemented ✅
3. **Cloud APIs** (OpenAI, Anthropic, Google AI) - **NEW in v1.5** 🆕

---

## 🎯 v1.5 Strategic Goals

### Business Goals
- **Expand Market**: Reach users who want cloud AI convenience with local AI privacy
- **Differentiate**: Become the only mobile app supporting local + cloud + self-hosted
- **User Flexibility**: Let users choose their privacy/performance/cost balance
- **Revenue Potential**: Enable future monetization through cost optimization features

### Technical Goals
- **Provider Abstraction**: Clean interface supporting any LLM provider
- **Unified UX**: Seamless experience regardless of model source
- **Smart Routing**: Automatic fallback chains and provider health monitoring
- **Cost Awareness**: Track token usage and costs across providers

---

## 1. Functional Requirements

### 1.1 Provider Abstraction Layer

#### FR-1.1.1: Abstract LLM Provider Interface (Must Have)
**Description:** Create provider-agnostic interface for all LLM backends.

**Interface Definition:**
```dart
abstract class LLMProvider {
  // Provider metadata
  String get providerId;        // "openai", "anthropic", "google", "ollama", "local"
  String get providerName;      // "OpenAI", "Anthropic", etc.
  ProviderType get type;        // CLOUD_API, SELF_HOSTED, LOCAL
  bool get requiresApiKey;      // true for cloud APIs
  bool get requiresConnection;  // false for local, true for others
  
  // Capabilities
  Future<ProviderCapabilities> getCapabilities();
  
  // Model management
  Future<List<ModelInfo>> listModels();
  Future<ModelInfo> getModelInfo(String modelId);
  
  // Chat operations
  Stream<ChatResponse> sendMessage({
    required String modelId,
    required List<Message> messages,
    Map<String, dynamic>? parameters,
  });
  
  // Health and status
  Future<ProviderHealth> checkHealth();
  
  // Cost tracking (cloud APIs only)
  Future<TokenUsage>? estimateCost(String modelId, List<Message> messages);
}
```

**Requirements:**
- Interface supports all existing providers (Ollama, LiteRT)
- Interface supports new cloud providers (OpenAI, Anthropic, Google)
- Streaming responses work consistently across all providers
- Error handling standardized across providers
- Provider can report capabilities (vision, tools, max context)

**Acceptance Criteria:**
- [ ] All 5 providers implement the interface
- [ ] Unit tests for each provider pass
- [ ] Streaming works for all providers
- [ ] Error handling tested for all error types
- [ ] Provider capabilities accurately reported

**Priority:** P0 (Must Have)

---

#### FR-1.1.2: Provider Registry & Selection (Must Have)
**Description:** System to register, discover, and select providers.

**Requirements:**
- Central registry of all available providers
- User can enable/disable providers
- User can set provider priority/preference
- System tracks provider health status
- UI shows available providers with status badges
- Providers sorted by: enabled → healthy → user preference

**Provider Status:**
```dart
enum ProviderStatus {
  READY,          // Configured and healthy
  UNCONFIGURED,   // Needs API key or setup
  OFFLINE,        // Network/connection issue
  ERROR,          // Provider-specific error
  DISABLED,       // User disabled
}
```

**Acceptance Criteria:**
- [ ] Provider registry implemented
- [ ] User can enable/disable providers in settings
- [ ] Provider status updates in real-time
- [ ] Provider sorting works correctly
- [ ] UI reflects provider status accurately

**Priority:** P0 (Must Have)

---

### 1.2 Cloud API Integration

#### FR-1.2.1: OpenAI API Integration (Must Have)
**Description:** Full integration with OpenAI API for GPT models.

**Supported Models:**
- GPT-4o (128K context, vision, tools)
- GPT-4o-mini (128K context, vision, tools)
- GPT-4-turbo (128K context, vision, tools)
- GPT-3.5-turbo (16K context, tools)
- o1-preview (reasoning model, 128K context)
- o1-mini (reasoning model, 128K context)

**Requirements:**
- Streaming responses via SSE
- Vision support (image URLs and base64)
- Function/tool calling support (for v2)
- Error handling for rate limits, invalid keys, quota exceeded
- Cost estimation (input tokens × rate + output tokens × rate)
- Respect model-specific max context lengths
- Support for temperature, top_p, max_tokens parameters

**API Configuration:**
- API key stored securely (Flutter secure_storage)
- Optional organization ID
- Optional custom API base URL (for proxies)
- Request timeout: 30s (configurable)

**Acceptance Criteria:**
- [ ] All listed models work correctly
- [ ] Streaming responses render in real-time
- [ ] Vision models accept image inputs
- [ ] Rate limit errors handled gracefully
- [ ] Cost estimation accurate within 5%
- [ ] API key validation on save

**Priority:** P0 (Must Have)

---

#### FR-1.2.2: Anthropic API Integration (Must Have)
**Description:** Full integration with Anthropic API for Claude models.

**Supported Models:**
- Claude 3.5 Sonnet (200K context, vision, tools)
- Claude 3 Opus (200K context, vision, tools)
- Claude 3 Sonnet (200K context, vision, tools)
- Claude 3 Haiku (200K context, vision, tools)

**Requirements:**
- Streaming responses via SSE
- Vision support (base64 images in messages)
- Function/tool calling support (for v2)
- System prompts support
- Error handling for rate limits, invalid keys
- Cost estimation (input tokens × rate + output tokens × rate)
- Support for temperature, top_p, top_k, max_tokens parameters

**API Configuration:**
- API key stored securely
- Optional custom API base URL
- Request timeout: 45s (Claude can be slower)

**Acceptance Criteria:**
- [ ] All listed models work correctly
- [ ] Streaming responses render in real-time
- [ ] Vision models accept image inputs
- [ ] System prompts applied correctly
- [ ] Rate limit errors handled gracefully
- [ ] Cost estimation accurate within 5%

**Priority:** P0 (Must Have)

---

#### FR-1.2.3: Google AI API Integration (Must Have)
**Description:** Integration with Google AI Studio API for Gemini models.

**Supported Models:**
- Gemini 1.5 Pro (2M context, vision, tools)
- Gemini 1.5 Flash (1M context, vision, tools)
- Gemini 1.0 Pro (32K context, tools)

**Requirements:**
- Streaming responses via SSE
- Vision support (inline images)
- Function/tool calling support (for v2)
- Error handling for rate limits, invalid keys
- Cost estimation (input tokens × rate + output tokens × rate)
- Support for temperature, top_p, top_k, max_output_tokens parameters
- Handle Google's unique message format

**API Configuration:**
- API key stored securely
- Optional custom API base URL
- Request timeout: 30s

**Acceptance Criteria:**
- [ ] All listed models work correctly
- [ ] Streaming responses render in real-time
- [ ] Vision models accept image inputs
- [ ] Rate limit errors handled gracefully
- [ ] Cost estimation accurate within 5%
- [ ] Message format conversion works correctly

**Priority:** P0 (Must Have)

---

### 1.3 Smart Routing & Fallbacks

#### FR-1.3.1: Automatic Provider Fallback (Must Have)
**Description:** When primary provider fails, automatically try fallback providers.

**Fallback Chain:**
```
1. User's selected model/provider
2. If offline/unavailable → Check fallback preference
3. Cloud API fails → Try Ollama (if available)
4. Ollama fails → Try Local (if model downloaded)
5. All fail → Queue message with error notification
```

**User Configuration:**
- Enable/disable automatic fallbacks
- Set fallback priority order
- Choose: "Always ask" vs "Auto-fallback"

**Fallback Scenarios:**
- Network offline → Fallback to local
- Cloud API rate limited → Try different cloud provider or Ollama
- Ollama offline → Try cloud API or local
- Model unavailable → Suggest alternative model

**UI Feedback:**
```
⚠️ OpenAI is currently unavailable

Would you like to:
• Try Claude 3.5 Sonnet (similar capability)
• Use Ollama llama3:latest (self-hosted)
• Use Gemma 3 1B (on-device)
• Queue message and retry later
```

**Acceptance Criteria:**
- [ ] Fallback chain executes correctly
- [ ] User preferences respected
- [ ] UI provides clear fallback options
- [ ] Fallback happens within 2 seconds
- [ ] User can disable auto-fallback

**Priority:** P0 (Must Have)

---

#### FR-1.3.2: Provider Health Monitoring (Should Have)
**Description:** Continuously monitor provider health and availability.

**Health Checks:**
- Periodic health pings (every 60 seconds)
- Track success/failure rates
- Measure response latency
- Detect rate limiting
- Monitor API quota usage

**Health Status:**
```dart
class ProviderHealth {
  ProviderStatus status;
  DateTime lastCheck;
  double successRate;        // Last 100 requests
  Duration avgLatency;       // p50
  String? errorMessage;
  DateTime? nextAvailableAt; // If rate limited
}
```

**UI Indicators:**
- Green dot: Healthy (success rate > 95%)
- Yellow dot: Degraded (success rate 80-95%)
- Red dot: Unavailable (success rate < 80%)
- Gray dot: Disabled or not configured

**Acceptance Criteria:**
- [ ] Health checks run on schedule
- [ ] Status updates reflected in UI
- [ ] Rate limiting detected accurately
- [ ] Health data persisted across restarts
- [ ] Minimal battery impact from health checks

**Priority:** P1 (Should Have)

---

### 1.4 Cost Tracking & Awareness

#### FR-1.4.1: Token Usage Tracking (Must Have)
**Description:** Track token usage for all cloud API requests.

**Data to Track:**
```dart
class TokenUsage {
  String providerId;
  String modelId;
  int inputTokens;
  int outputTokens;
  int totalTokens;
  double estimatedCost;     // USD
  DateTime timestamp;
  String conversationId;
  String messageId;
}
```

**Requirements:**
- Track per message, per conversation, per model
- Calculate estimated cost using current pricing
- Store in local database
- Display in UI (per message, conversation summary, monthly total)
- Export token usage data

**Pricing Database:**
- Embedded pricing data (updated with app updates)
- Per-provider, per-model pricing
- Input token rate, output token rate
- Cache token rate (for future use)

**Acceptance Criteria:**
- [ ] Token usage tracked for all cloud API messages
- [ ] Cost estimation accurate within 5%
- [ ] Data persisted in database
- [ ] UI displays usage clearly
- [ ] Export functionality works

**Priority:** P0 (Must Have)

---

#### FR-1.4.2: Cost Limits & Warnings (Should Have)
**Description:** Alert users when approaching cost limits.

**User Configuration:**
- Set daily/monthly cost limits per provider
- Warning threshold (e.g., 80% of limit)
- Hard limit (stop requests)
- Email/notification on limit reached

**Warning UI:**
```
⚠️ OpenAI Usage Alert

You've used $8.50 of your $10 monthly limit.

• Remaining: $1.50
• Estimated messages left: ~150 (GPT-4o-mini)
• Reset: February 1, 2026

[Switch to Free Model]  [Adjust Limit]
```

**Acceptance Criteria:**
- [ ] Limits configurable per provider
- [ ] Warnings displayed at threshold
- [ ] Hard limits enforced
- [ ] Reset logic works correctly
- [ ] Suggestions for free alternatives

**Priority:** P1 (Should Have)

---

#### FR-1.4.3: Cost Optimization Suggestions (Could Have)
**Description:** Suggest cost-effective alternatives for expensive models.

**Suggestions:**
```
💡 Cost Tip: GPT-4o costs 20x more than GPT-4o-mini

For this simple question, GPT-4o-mini would give similar results at $0.01 instead of $0.20.

[Use GPT-4o-mini]  [Continue with GPT-4o]  [Don't show again]
```

**Logic:**
- Analyze message complexity (word count, context)
- Compare model capabilities vs requirements
- Suggest cheaper model if sufficient
- Learn from user choices (ML model for future releases)

**Acceptance Criteria:**
- [ ] Suggestions appear for high-cost models
- [ ] User can dismiss or accept
- [ ] Suggestions stop if user dismisses repeatedly
- [ ] Suggestions are accurate and helpful

**Priority:** P2 (Could Have)

---

### 1.5 UI/UX Updates

#### FR-1.5.1: Unified Model Picker (Must Have)
**Description:** Single model picker showing all models from all providers.

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Select Model                       [Search] │
├─────────────────────────────────────────────┤
│ 🌟 Favorites                                │
│   ☁️ GPT-4o (OpenAI)                       │
│   📱 Gemma 3 1B (Local)                    │
├─────────────────────────────────────────────┤
│ ☁️ Cloud APIs                              │
│   OpenAI (🟢 Healthy)                      │
│     • GPT-4o              $0.005/1K   128K │
│     • GPT-4o-mini         $0.0002/1K  128K │
│   Anthropic (🟢 Healthy)                   │
│     • Claude 3.5 Sonnet   $0.003/1K   200K │
│     • Claude 3 Haiku      $0.0003/1K  200K │
│   Google AI (🔴 Unconfigured)              │
│     [Add API Key]                          │
├─────────────────────────────────────────────┤
│ 🖥️ Self-Hosted (Ollama)                    │
│   llama3:latest (🟢 Online)                │
│   mistral:latest (🟢 Online)               │
├─────────────────────────────────────────────┤
│ 📱 Local (On-Device)                       │
│   Gemma 3 1B (✅ Downloaded)               │
│   Phi-4 Mini (⬇️ Available)                │
└─────────────────────────────────────────────┘
```

**Features:**
- Grouped by provider type
- Provider status indicators
- Cost per 1K tokens (cloud APIs)
- Context length indicator
- Capability badges (vision 👁️, tools 🔧)
- Quick add API key button
- Search/filter models
- Favorites section at top

**Acceptance Criteria:**
- [ ] All models from all providers shown
- [ ] Grouping and sorting correct
- [ ] Status indicators accurate
- [ ] Cost information displayed
- [ ] Search/filter works
- [ ] Favorites persist

**Priority:** P0 (Must Have)

---

#### FR-1.5.2: Message Cost Display (Should Have)
**Description:** Show token usage and cost for each cloud API message.

**Display:**
```
┌────────────────────────────────────────────┐
│ 🤖 GPT-4o                        10:30 AM  │
│ [AI response content here...]              │
│                                            │
│ 📊 125 tokens ($0.0006) • 1.2s            │
└────────────────────────────────────────────┘
```

**Details:**
- Token count (input + output)
- Estimated cost in USD
- Response time
- Tap to expand for breakdown
- Monthly running total in conversation header

**Acceptance Criteria:**
- [ ] Cost displayed for all cloud API messages
- [ ] Breakdown shows input/output split
- [ ] Running total accurate
- [ ] Zero cost for local/Ollama models
- [ ] UI is not cluttered

**Priority:** P1 (Should Have)

---

#### FR-1.5.3: Provider Settings Screen (Must Have)
**Description:** Dedicated settings screen for managing providers.

**Settings Structure:**
```
Settings > Providers

☁️ Cloud API Providers
  • OpenAI
  • Anthropic  
  • Google AI

🖥️ Self-Hosted
  • Ollama

📱 Local Models
  • LiteRT

Provider Details (OpenAI):
  ✅ Enabled
  🔑 API Key: sk-...abc (configured)
  🌐 Base URL: https://api.openai.com/v1
  📊 Monthly Usage: $12.50 / $50.00
  🔄 Health: Healthy (last check: 2 min ago)
  
  [Test Connection]
  [View Usage History]
  [Configure Models]
```

**Features:**
- Enable/disable providers
- Add/edit API keys (secure input)
- Set custom base URLs (for proxies)
- View usage statistics
- Test connection
- Configure cost limits
- Set fallback preferences

**Acceptance Criteria:**
- [ ] All providers listed
- [ ] API keys stored securely
- [ ] Connection test works
- [ ] Usage statistics accurate
- [ ] UI is intuitive

**Priority:** P0 (Must Have)

---

### 1.6 Data Management

#### FR-1.6.1: Provider Configuration Storage (Must Have)
**Description:** Securely store provider configurations and credentials.

**Data to Store:**
- Provider enabled/disabled state
- API keys (encrypted, secure storage)
- Custom base URLs
- Cost limits and preferences
- Fallback preferences
- Model favorites

**Security Requirements:**
- API keys stored using flutter_secure_storage
- Never log API keys
- Clear API keys on app uninstall
- Encrypt database containing usage data
- No API keys in crash reports

**Acceptance Criteria:**
- [ ] Configurations persist across restarts
- [ ] API keys stored securely
- [ ] No sensitive data in logs
- [ ] Database encrypted
- [ ] Uninstall clears all credentials

**Priority:** P0 (Must Have)

---

#### FR-1.6.2: Usage Data Export (Should Have)
**Description:** Export token usage and cost data.

**Export Formats:**
- CSV (for spreadsheet analysis)
- JSON (for programmatic access)
- PDF report (monthly summary)

**Export Includes:**
- Date range
- Per-provider breakdown
- Per-model breakdown
- Total costs
- Token usage
- Message counts

**Acceptance Criteria:**
- [ ] All formats export correctly
- [ ] Data is accurate
- [ ] Export includes filters (date, provider, model)
- [ ] Large exports don't crash app
- [ ] Export completes in < 5s for 1000 messages

**Priority:** P1 (Should Have)

---

## 2. Non-Functional Requirements

### NFR-2.1: Performance

#### NFR-2.1.1: API Response Time (Must Have)
**Target:**
- Cloud API first token: < 2s (p95)
- Cloud API streaming: smooth, no stutters
- Model picker load: < 500ms
- Provider status update: < 1s

**Acceptance Criteria:**
- [ ] First token latency meets target 95% of time
- [ ] No visible lag in streaming
- [ ] UI remains responsive during API calls

---

#### NFR-2.1.2: Offline Performance (Must Have)
**Target:**
- Offline mode detection: < 500ms
- Message queueing: < 100ms
- Fallback to local: < 1s

**Acceptance Criteria:**
- [ ] Offline detection is instant
- [ ] No blocking on network calls
- [ ] UI never freezes

---

### NFR-2.2: Security

#### NFR-2.2.1: Credential Security (Must Have)
**Requirements:**
- API keys encrypted at rest
- HTTPS only for all cloud APIs
- Certificate pinning (optional, for paranoid mode)
- No credentials in memory dumps
- Secure key input (obscured, paste-only option)

**Acceptance Criteria:**
- [ ] Security audit passes
- [ ] No credentials in plain text anywhere
- [ ] HTTPS enforced

---

#### NFR-2.2.2: Data Privacy (Must Have)
**Requirements:**
- No telemetry sent to Private Chat Hub servers
- Cloud API providers receive only necessary data
- User conversations never logged by app
- Local database encrypted (optional setting)
- Crash reports exclude message content

**Acceptance Criteria:**
- [ ] Privacy audit passes
- [ ] No unexpected network requests
- [ ] User data stays private

---

### NFR-2.3: Reliability

#### NFR-2.3.1: Error Handling (Must Have)
**Requirements:**
- All API errors handled gracefully
- User-friendly error messages
- Automatic retry with exponential backoff
- Fallback to alternative providers
- No crashes due to API failures

**Common Errors:**
- Invalid API key → Show setup instructions
- Rate limit → Show retry time, suggest fallback
- Network timeout → Show retry button, queue option
- Model unavailable → Suggest alternative
- Quota exceeded → Show usage, upgrade prompt

**Acceptance Criteria:**
- [ ] No crashes from API errors
- [ ] All error messages are helpful
- [ ] Retry logic works correctly

---

#### NFR-2.3.2: Offline Resilience (Must Have)
**Requirements:**
- Full functionality with local models offline
- Graceful degradation for cloud APIs offline
- Message queue for cloud/Ollama offline
- Auto-resend when connection restored
- No data loss

**Acceptance Criteria:**
- [ ] App works offline with local models
- [ ] Messages queue correctly
- [ ] Auto-resend works
- [ ] No messages lost

---

### NFR-2.4: Usability

#### NFR-2.4.1: Onboarding (Should Have)
**Requirements:**
- First-time setup wizard
- Explain provider types (local/cloud/self-hosted)
- Guide through API key setup
- Suggest starter models
- Optional: skip cloud APIs entirely

**Acceptance Criteria:**
- [ ] New users understand provider types
- [ ] API key setup is clear
- [ ] Can skip cloud setup

---

#### NFR-2.4.2: Documentation (Must Have)
**Requirements:**
- In-app help for each provider
- Links to provider documentation
- Troubleshooting guides
- Cost estimation explanation
- Privacy policy updates

**Acceptance Criteria:**
- [ ] Help is comprehensive
- [ ] Links are up to date
- [ ] Users can self-serve

---

## 3. MVP Scope for v1.5

### Phase 1A: Core Infrastructure (4 weeks)

**Week 1-2: Provider Abstraction**
- Implement LLMProvider interface
- Refactor existing Ollama + LiteRT to use interface
- Create provider registry
- Implement health monitoring

**Week 3-4: Cloud API Integration**
- OpenAI API client + streaming
- Anthropic API client + streaming
- Google AI API client + streaming
- Error handling for all providers
- Token usage tracking

**Deliverable:** Working cloud API integration with streaming

---

### Phase 1B: UX & Polish (2-3 weeks)

**Week 5-6: UI Updates**
- Unified model picker
- Provider settings screen
- Cost display in messages
- Status indicators
- API key management UI

**Week 7 (optional): Advanced Features**
- Smart fallback system
- Cost limits and warnings
- Provider health monitoring UI
- Usage analytics

**Deliverable:** Production-ready v1.5

---

## 4. Out of Scope for v1.5

### Explicitly Not Included
- ❌ Advanced tool calling (v2)
- ❌ Model comparison UI (v2)
- ❌ Additional providers (Mistral, Cohere, etc.) - future
- ❌ API gateway integration (LiteLLM, OpenRouter) - v3
- ❌ Voice input/output - v2
- ❌ Multi-model conversations - v2
- ❌ Cost optimization AI - future
- ❌ Team/enterprise features - future

---

## 5. Success Metrics

### User Adoption
- 60%+ of users configure at least one cloud API
- 40%+ of users configure multiple providers
- 80%+ of users enable smart fallbacks

### Technical Performance
- Cloud API success rate > 95%
- Average first token latency < 2s
- Zero credential leaks or security issues
- Crash-free sessions > 99.5%

### User Satisfaction
- App Store rating maintained at 4.5+
- Feature request: "More cloud providers" 
- Retention improves due to flexibility

---

## 6. Dependencies

### External
- OpenAI API access and documentation
- Anthropic API access and documentation
- Google AI Studio API access
- Flutter packages: http, flutter_secure_storage

### Internal
- Existing v1.0 architecture (local + Ollama)
- Database schema updates for usage tracking
- Settings UI refactor

---

## 7. Related Documents

- [PRODUCT_VISION.md](PRODUCT_VISION.md) - Strategic vision and positioning
- [ARCHITECTURE_CLOUD_API_INTEGRATION.md](ARCHITECTURE_CLOUD_API_INTEGRATION.md) - Technical architecture
- [PRODUCT_ROADMAP_V1.5.md](PRODUCT_ROADMAP_V1.5.md) - Detailed timeline
- [USER_STORIES_V1.5.md](USER_STORIES_V1.5.md) - User stories with acceptance criteria

---

## 8. Approval & Sign-Off

**Status:** Draft - Awaiting Review

**Reviewers:**
- Product Owner: ___________
- Technical Lead: ___________
- UX Designer: ___________

**Approval Date:** ___________

---

**Next Steps:**
1. Review requirements with stakeholders
2. Create detailed architecture document
3. Estimate effort for each requirement
4. Create sprint plan for 6-8 week timeline
5. Begin implementation with provider abstraction layer
