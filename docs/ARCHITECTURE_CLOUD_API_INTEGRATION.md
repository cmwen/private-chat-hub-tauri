# Architecture: Cloud API Integration (v1.5)

**Document Version:** 1.0  
**Created:** January 26, 2026  
**Status:** Active Design  
**Related:** [PRODUCT_REQUIREMENTS_V1.5.md](PRODUCT_REQUIREMENTS_V1.5.md), [ARCHITECTURE_LOCAL_REMOTE_MODEL_SYSTEM.md](ARCHITECTURE_LOCAL_REMOTE_MODEL_SYSTEM.md)

---

## Overview

This document defines the technical architecture for integrating cloud AI APIs (OpenAI, Anthropic, Google AI) into Private Chat Hub, building on the existing local + Ollama hybrid architecture.

**Key Goals:**
1. **Provider Abstraction**: Clean interface supporting any LLM provider
2. **Unified Experience**: Seamless UX regardless of model source
3. **Smart Routing**: Automatic fallbacks and health monitoring
4. **Cost Awareness**: Track usage and costs transparently

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        UI Layer                              │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐  │
│  │Unified Model │  │Chat Interface │  │Provider Settings│  │
│  │Picker        │  │               │  │                 │  │
│  └──────────────┘  └───────────────┘  └─────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   Service Layer                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         ChatService (Central Router)                   │ │
│  │  • Routes to appropriate provider                      │ │
│  │  • Handles fallback chains                             │ │
│  │  • Manages conversation state                          │ │
│  └──────┬─────────────────┬──────────────────┬────────────┘ │
│         │                 │                  │              │
│  ┌──────▼────┐     ┌──────▼────┐     ┌──────▼────────┐    │
│  │Provider   │     │Health     │     │Cost Tracking  │    │
│  │Registry   │     │Monitor    │     │Service        │    │
│  └───────────┘     └───────────┘     └───────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   Provider Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │LLMProvider   │  │LLMProvider   │  │LLMProvider       │  │
│  │(Abstract)    │  │(Abstract)    │  │(Abstract)        │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────┘  │
│         │                 │                  │              │
│  ┌──────▼───────┐  ┌──────▼────────┐  ┌─────▼──────────┐  │
│  │Local         │  │Self-Hosted    │  │Cloud APIs      │  │
│  ├──────────────┤  ├───────────────┤  ├────────────────┤  │
│  │• LiteRT      │  │• Ollama       │  │• OpenAI        │  │
│  │  Provider    │  │  Provider     │  │• Anthropic     │  │
│  │              │  │               │  │• Google AI     │  │
│  └──────┬───────┘  └──────┬────────┘  └─────┬──────────┘  │
│         │                 │                  │              │
└─────────┼─────────────────┼──────────────────┼──────────────┘
          │                 │                  │
┌─────────▼─────────────────▼──────────────────▼──────────────┐
│                Backend Implementations                        │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │On-Device   │  │Local Network│  │Cloud APIs            │  │
│  │LiteRT      │  │Ollama       │  │• api.openai.com      │  │
│  │            │  │Server       │  │• api.anthropic.com   │  │
│  │            │  │             │  │• generativelanguage  │  │
│  │            │  │             │  │  .googleapis.com     │  │
│  └────────────┘  └─────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. LLMProvider Interface (Abstract)

**Purpose:** Unified interface for all LLM providers (local, self-hosted, cloud).

**Interface:**
```dart
abstract class LLMProvider {
  // Metadata
  String get providerId;        // "openai", "anthropic", "google", "ollama", "local"
  String get providerName;      // Display name
  ProviderType get type;        // CLOUD_API, SELF_HOSTED, LOCAL
  
  // Configuration
  bool get requiresApiKey;
  bool get requiresConnection;  // false for local
  bool get supportsStreaming;
  
  // Capabilities
  Future<ProviderCapabilities> getCapabilities();
  
  // Models
  Future<List<ModelInfo>> listModels();
  Future<ModelInfo?> getModelInfo(String modelId);
  
  // Core functionality
  Stream<ChatResponse> sendMessage({
    required String modelId,
    required List<Message> messages,
    ModelParameters? parameters,
  });
  
  // Health & status
  Future<ProviderHealth> checkHealth();
  ProviderStatus get currentStatus;
  
  // Cost (cloud only)
  Future<TokenUsage>? estimateCost(String modelId, List<Message> messages);
  
  // Lifecycle
  Future<void> initialize();
  Future<void> dispose();
}

enum ProviderType {
  LOCAL,          // On-device (LiteRT)
  SELF_HOSTED,    // Local network (Ollama)
  CLOUD_API,      // Cloud services (OpenAI, Anthropic, Google)
}

enum ProviderStatus {
  READY,          // Configured and working
  UNCONFIGURED,   // Needs setup
  OFFLINE,        // Network/connection issue
  ERROR,          // Provider error
  DISABLED,       // User disabled
  RATE_LIMITED,   // Temporarily unavailable
}
```

---

### 2. Provider Implementations

#### 2.1 OpenAIProvider

**Configuration:**
```dart
class OpenAIConfig {
  String apiKey;
  String? organizationId;
  String baseUrl;  // Default: https://api.openai.com/v1
  Duration timeout;  // Default: 30s
}
```

**Supported Models:**
```dart
static const models = [
  ModelInfo(
    id: "gpt-4o",
    name: "GPT-4o",
    contextWindow: 128000,
    inputCostPer1k: 0.0025,
    outputCostPer1k: 0.010,
    capabilities: [ModelCapability.VISION, ModelCapability.TOOLS, ModelCapability.STREAMING],
  ),
  ModelInfo(
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    contextWindow: 128000,
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.0006,
    capabilities: [ModelCapability.VISION, ModelCapability.TOOLS, ModelCapability.STREAMING],
  ),
  // ... other models
];
```

**Streaming Implementation:**
```dart
Stream<ChatResponse> sendMessage({
  required String modelId,
  required List<Message> messages,
  ModelParameters? parameters,
}) async* {
  final request = OpenAIChatCompletionRequest(
    model: modelId,
    messages: messages.map(_toOpenAIMessage).toList(),
    stream: true,
    temperature: parameters?.temperature,
    max_tokens: parameters?.maxTokens,
  );
  
  final response = await _httpClient.post(
    Uri.parse('$baseUrl/chat/completions'),
    headers: {
      'Authorization': 'Bearer $apiKey',
      'Content-Type': 'application/json',
    },
    body: jsonEncode(request.toJson()),
  );
  
  // Parse SSE stream
  await for (final line in response.stream.transform(utf8.decoder).transform(LineSplitter())) {
    if (line.startsWith('data: ')) {
      final data = line.substring(6);
      if (data == '[DONE]') break;
      
      final chunk = OpenAIChatCompletionChunk.fromJson(jsonDecode(data));
      final delta = chunk.choices[0].delta;
      
      if (delta.content != null) {
        yield ChatResponse(
          type: ChatResponseType.CONTENT,
          content: delta.content,
          model: modelId,
          provider: providerId,
        );
      }
      
      if (chunk.usage != null) {
        yield ChatResponse(
          type: ChatResponseType.USAGE,
          tokenUsage: TokenUsage(
            inputTokens: chunk.usage!.prompt_tokens,
            outputTokens: chunk.usage!.completion_tokens,
            totalTokens: chunk.usage!.total_tokens,
          ),
        );
      }
    }
  }
}
```

**Error Handling:**
```dart
try {
  // ... API call
} on OpenAIException catch (e) {
  if (e.statusCode == 401) {
    throw LLMProviderException(
      code: 'INVALID_API_KEY',
      message: 'Invalid OpenAI API key',
      recoverable: false,
      userAction: 'Please check your API key in Settings > Providers > OpenAI',
    );
  } else if (e.statusCode == 429) {
    throw LLMProviderException(
      code: 'RATE_LIMITED',
      message: 'OpenAI rate limit exceeded',
      recoverable: true,
      retryAfter: Duration(seconds: 60),
      userAction: 'Try again in a minute or use a different model',
    );
  } else if (e.statusCode == 503) {
    throw LLMProviderException(
      code: 'SERVICE_UNAVAILABLE',
      message: 'OpenAI is temporarily unavailable',
      recoverable: true,
      suggestedFallback: 'claude-3-5-sonnet-20241022',  // Suggest Anthropic
    );
  }
}
```

---

#### 2.2 AnthropicProvider

**Configuration:**
```dart
class AnthropicConfig {
  String apiKey;
  String baseUrl;  // Default: https://api.anthropic.com
  Duration timeout;  // Default: 45s (Claude can be slower)
  String apiVersion;  // Default: "2023-06-01"
}
```

**Key Differences:**
- Uses `anthropic-version` header
- System prompts handled separately
- Vision images sent as base64 in message content
- Different token counting (needs estimation before call)

**Streaming:**
```dart
Stream<ChatResponse> sendMessage(...) async* {
  final request = AnthropicMessageRequest(
    model: modelId,
    messages: messages.map(_toAnthropicMessage).toList(),
    system: systemPrompt,  // Extracted separately
    stream: true,
    max_tokens: parameters?.maxTokens ?? 4096,
    temperature: parameters?.temperature,
  );
  
  final response = await _httpClient.post(
    Uri.parse('$baseUrl/v1/messages'),
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': apiVersion,
      'content-type': 'application/json',
    },
    body: jsonEncode(request.toJson()),
  );
  
  // Parse SSE stream (similar to OpenAI but different format)
  await for (final event in _parseAnthropicSSE(response.stream)) {
    if (event.type == 'content_block_delta') {
      yield ChatResponse(
        type: ChatResponseType.CONTENT,
        content: event.delta.text,
        model: modelId,
        provider: providerId,
      );
    } else if (event.type == 'message_stop') {
      yield ChatResponse(
        type: ChatResponseType.USAGE,
        tokenUsage: event.usage,
      );
    }
  }
}
```

---

#### 2.3 GoogleAIProvider

**Configuration:**
```dart
class GoogleAIConfig {
  String apiKey;
  String baseUrl;  // Default: https://generativelanguage.googleapis.com
  String apiVersion;  // Default: "v1beta"
}
```

**Key Differences:**
- Uses query parameter for API key (`?key=...`)
- Different message format (parts-based)
- Streaming uses different endpoint structure
- No explicit system prompts (uses first user message)

**Streaming:**
```dart
Stream<ChatResponse> sendMessage(...) async* {
  // Google uses different endpoint structure
  final url = '$baseUrl/$apiVersion/models/$modelId:streamGenerateContent?key=$apiKey';
  
  final request = GoogleGenerateContentRequest(
    contents: messages.map(_toGoogleContent).toList(),
    generationConfig: GoogleGenerationConfig(
      temperature: parameters?.temperature,
      maxOutputTokens: parameters?.maxTokens,
      topP: parameters?.topP,
      topK: parameters?.topK,
    ),
  );
  
  final response = await _httpClient.post(
    Uri.parse(url),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode(request.toJson()),
  );
  
  // Parse JSON stream (not SSE, newline-delimited JSON)
  await for (final line in response.stream.transform(utf8.decoder).transform(LineSplitter())) {
    if (line.trim().isEmpty) continue;
    
    final chunk = GoogleGenerateContentResponse.fromJson(jsonDecode(line));
    final candidate = chunk.candidates[0];
    
    if (candidate.content.parts.isNotEmpty) {
      final text = candidate.content.parts[0].text;
      yield ChatResponse(
        type: ChatResponseType.CONTENT,
        content: text,
        model: modelId,
        provider: providerId,
      );
    }
    
    if (chunk.usageMetadata != null) {
      yield ChatResponse(
        type: ChatResponseType.USAGE,
        tokenUsage: TokenUsage(
          inputTokens: chunk.usageMetadata!.promptTokenCount,
          outputTokens: chunk.usageMetadata!.candidatesTokenCount,
          totalTokens: chunk.usageMetadata!.totalTokenCount,
        ),
      );
    }
  }
}
```

---

### 3. ProviderRegistry

**Purpose:** Central registry for all providers with health monitoring.

**Implementation:**
```dart
class ProviderRegistry {
  final Map<String, LLMProvider> _providers = {};
  final ProviderHealthMonitor _healthMonitor;
  final ProviderConfigService _configService;
  
  // Register providers
  void register(LLMProvider provider) {
    _providers[provider.providerId] = provider;
    _healthMonitor.track(provider);
  }
  
  // Get provider by ID
  LLMProvider? getProvider(String providerId) => _providers[providerId];
  
  // List providers by status
  List<LLMProvider> listProviders({
    ProviderStatus? status,
    ProviderType? type,
    bool enabledOnly = false,
  }) {
    return _providers.values.where((p) {
      if (status != null && p.currentStatus != status) return false;
      if (type != null && p.type != type) return false;
      if (enabledOnly && !_configService.isEnabled(p.providerId)) return false;
      return true;
    }).toList();
  }
  
  // Get best available provider for model
  LLMProvider? getBestProvider({
    required String modelId,
    required List<ProviderType> preferredTypes,
  }) {
    // Find providers that have this model
    final candidates = _providers.values.where((p) {
      final models = p.listModels();
      return models.any((m) => m.id == modelId);
    }).toList();
    
    // Sort by: enabled > healthy > user preference > type preference
    candidates.sort((a, b) {
      final aEnabled = _configService.isEnabled(a.providerId);
      final bEnabled = _configService.isEnabled(b.providerId);
      if (aEnabled != bEnabled) return aEnabled ? -1 : 1;
      
      final aHealthy = a.currentStatus == ProviderStatus.READY;
      final bHealthy = b.currentStatus == ProviderStatus.READY;
      if (aHealthy != bHealthy) return aHealthy ? -1 : 1;
      
      final aPref = _configService.getPreference(a.providerId);
      final bPref = _configService.getPreference(b.providerId);
      return aPref.compareTo(bPref);
    });
    
    return candidates.isEmpty ? null : candidates.first;
  }
  
  // Initialize all providers
  Future<void> initializeAll() async {
    await Future.wait(_providers.values.map((p) => p.initialize()));
  }
}
```

---

### 4. ChatService (Updated)

**Purpose:** Central router integrating provider abstraction.

**Key Changes:**
```dart
class ChatService {
  final ProviderRegistry _providerRegistry;
  final FallbackStrategy _fallbackStrategy;
  final CostTrackingService _costTracker;
  final MessageQueueService _messageQueue;
  
  Stream<Conversation> sendMessage(
    String conversationId,
    String text,
  ) async* {
    final conversation = await _getConversation(conversationId);
    final modelId = conversation.modelId;
    final providerId = _extractProviderId(modelId);
    
    // Get provider
    LLMProvider? provider = _providerRegistry.getProvider(providerId);
    
    // Check provider status
    if (provider == null || provider.currentStatus != ProviderStatus.READY) {
      // Try fallback
      provider = await _fallbackStrategy.getFallback(
        originalProvider: providerId,
        modelId: modelId,
        conversation: conversation,
      );
      
      if (provider == null) {
        // No fallback available - queue message
        final queued = await _messageQueue.queueMessage(conversationId, text);
        yield queued;
        return;
      }
    }
    
    // Send message via provider
    final messages = await _buildMessageHistory(conversation, text);
    
    try {
      String fullResponse = '';
      TokenUsage? usage;
      
      await for (final response in provider.sendMessage(
        modelId: modelId,
        messages: messages,
      )) {
        if (response.type == ChatResponseType.CONTENT) {
          fullResponse += response.content!;
          
          // Update conversation with partial response
          final updated = conversation.addAssistantMessage(
            fullResponse,
            isComplete: false,
          );
          yield updated;
        } else if (response.type == ChatResponseType.USAGE) {
          usage = response.tokenUsage;
        }
      }
      
      // Finalize message
      final finalConversation = conversation.addAssistantMessage(
        fullResponse,
        isComplete: true,
        tokenUsage: usage,
      );
      
      // Track cost (cloud APIs only)
      if (provider.type == ProviderType.CLOUD_API && usage != null) {
        await _costTracker.recordUsage(
          providerId: providerId,
          modelId: modelId,
          tokenUsage: usage,
          conversationId: conversationId,
        );
      }
      
      yield finalConversation;
      
    } on LLMProviderException catch (e) {
      // Handle provider errors
      if (e.recoverable && e.suggestedFallback != null) {
        // Try suggested fallback
        final fallbackProvider = _providerRegistry.getProvider(e.suggestedFallback!);
        if (fallbackProvider != null) {
          yield* sendMessage(conversationId, text);  // Retry with fallback
          return;
        }
      }
      
      // Show error to user
      yield conversation.addError(e.message, e.userAction);
    }
  }
}
```

---

### 5. FallbackStrategy

**Purpose:** Intelligent fallback selection when primary provider fails.

**Implementation:**
```dart
class FallbackStrategy {
  final ProviderRegistry _providerRegistry;
  final ProviderConfigService _configService;
  
  Future<LLMProvider?> getFallback({
    required String originalProvider,
    required String modelId,
    required Conversation conversation,
  }) async {
    // Get user fallback preferences
    final prefs = _configService.getFallbackPreferences();
    
    if (!prefs.enabled) return null;
    
    // Determine fallback chain based on original provider type
    List<ProviderType> fallbackChain;
    
    switch (originalProvider) {
      case 'openai':
      case 'anthropic':
      case 'google':
        // Cloud API failed → Try other cloud → Ollama → Local
        fallbackChain = [
          ProviderType.CLOUD_API,
          ProviderType.SELF_HOSTED,
          ProviderType.LOCAL,
        ];
        break;
      
      case 'ollama':
        // Ollama failed → Try cloud (if configured) → Local
        fallbackChain = [
          ProviderType.CLOUD_API,
          ProviderType.LOCAL,
        ];
        break;
      
      case 'local':
        // Local failed → Try Ollama → Cloud
        fallbackChain = [
          ProviderType.SELF_HOSTED,
          ProviderType.CLOUD_API,
        ];
        break;
      
      default:
        return null;
    }
    
    // Try each provider type in fallback chain
    for (final type in fallbackChain) {
      final providers = _providerRegistry.listProviders(
        type: type,
        enabledOnly: true,
      ).where((p) => p.currentStatus == ProviderStatus.READY).toList();
      
      if (providers.isEmpty) continue;
      
      // Check if model requires specific capabilities
      final capabilities = _getRequiredCapabilities(conversation);
      
      for (final provider in providers) {
        final models = await provider.listModels();
        final compatibleModel = models.firstWhere(
          (m) => _hasCapabilities(m, capabilities),
          orElse: () => null,
        );
        
        if (compatibleModel != null) {
          // Ask user if configured
          if (prefs.alwaysAsk) {
            final confirmed = await _showFallbackDialog(
              originalProvider: originalProvider,
              fallbackProvider: provider.providerId,
              fallbackModel: compatibleModel.id,
            );
            if (!confirmed) continue;
          }
          
          return provider;
        }
      }
    }
    
    return null;
  }
}
```

---

### 6. CostTrackingService

**Purpose:** Track token usage and costs for cloud APIs.

**Implementation:**
```dart
class CostTrackingService {
  final Database _db;
  final PricingDatabase _pricingDb;
  
  Future<void> recordUsage({
    required String providerId,
    required String modelId,
    required TokenUsage tokenUsage,
    required String conversationId,
    String? messageId,
  }) async {
    final pricing = await _pricingDb.getPricing(providerId, modelId);
    final cost = _calculateCost(tokenUsage, pricing);
    
    await _db.insert('token_usage', {
      'provider_id': providerId,
      'model_id': modelId,
      'conversation_id': conversationId,
      'message_id': messageId,
      'input_tokens': tokenUsage.inputTokens,
      'output_tokens': tokenUsage.outputTokens,
      'total_tokens': tokenUsage.totalTokens,
      'estimated_cost_usd': cost,
      'timestamp': DateTime.now().toIso8601String(),
    });
    
    // Check cost limits
    await _checkCostLimits(providerId);
  }
  
  double _calculateCost(TokenUsage usage, ModelPricing pricing) {
    final inputCost = (usage.inputTokens / 1000.0) * pricing.inputCostPer1k;
    final outputCost = (usage.outputTokens / 1000.0) * pricing.outputCostPer1k;
    return inputCost + outputCost;
  }
  
  Future<void> _checkCostLimits(String providerId) async {
    final limits = await _db.getCostLimits(providerId);
    if (limits == null) return;
    
    final usage = await getUsage(
      providerId: providerId,
      period: limits.period,
    );
    
    if (usage.totalCost >= limits.hardLimit) {
      // Disable provider
      await _configService.setEnabled(providerId, false);
      _notificationService.show(
        title: 'Cost Limit Reached',
        body: 'Disabled ${providerId} due to reaching cost limit of \$${limits.hardLimit}',
      );
    } else if (usage.totalCost >= limits.warningThreshold) {
      // Show warning
      _notificationService.show(
        title: 'Cost Warning',
        body: 'You\'ve used \$${usage.totalCost.toStringAsFixed(2)} of your \$${limits.hardLimit} limit for ${providerId}',
      );
    }
  }
  
  Future<UsageSummary> getUsage({
    String? providerId,
    String? modelId,
    UsagePeriod? period,
  }) async {
    // Query database with filters
    final results = await _db.query(
      'token_usage',
      where: _buildWhereClause(providerId, modelId, period),
    );
    
    return UsageSummary(
      totalTokens: results.fold(0, (sum, r) => sum + r['total_tokens']),
      totalCost: results.fold(0.0, (sum, r) => sum + r['estimated_cost_usd']),
      messageCount: results.length,
      breakdown: _buildBreakdown(results),
    );
  }
}
```

---

## Data Models

### ProviderCapabilities
```dart
class ProviderCapabilities {
  final List<ModelCapability> capabilities;
  final int maxContextWindow;
  final bool supportsVision;
  final bool supportsTools;
  final bool supportsStreaming;
  final bool supportsSystemPrompt;
}

enum ModelCapability {
  VISION,
  TOOLS,
  STREAMING,
  CODE_EXECUTION,
  WEB_SEARCH,
}
```

### ModelInfo
```dart
class ModelInfo {
  final String id;
  final String name;
  final String providerId;
  final int contextWindow;
  final double? inputCostPer1k;
  final double? outputCostPer1k;
  final List<ModelCapability> capabilities;
  final DateTime? lastUpdated;
  final String? description;
}
```

### TokenUsage
```dart
class TokenUsage {
  final int inputTokens;
  final int outputTokens;
  final int totalTokens;
  final double? cacheReadTokens;  // For future cache support
  final double? cacheWriteTokens;
}
```

### ChatResponse
```dart
class ChatResponse {
  final ChatResponseType type;
  final String? content;
  final TokenUsage? tokenUsage;
  final String? modelId;
  final String? providerId;
  final Map<String, dynamic>? metadata;
}

enum ChatResponseType {
  CONTENT,        // Text content delta
  USAGE,          // Token usage info
  TOOL_CALL,      // Tool invocation (v2)
  ERROR,          // Error occurred
}
```

---

## Database Schema

### Provider Configurations
```sql
CREATE TABLE provider_configs (
  provider_id TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT 1,
  api_key_ref TEXT,  -- Reference to secure storage
  base_url TEXT,
  custom_settings TEXT,  -- JSON
  preference_order INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Token Usage Tracking
```sql
CREATE TABLE token_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id TEXT,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  estimated_cost_usd REAL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX idx_token_usage_provider ON token_usage(provider_id);
CREATE INDEX idx_token_usage_timestamp ON token_usage(timestamp);
CREATE INDEX idx_token_usage_conversation ON token_usage(conversation_id);
```

### Cost Limits
```sql
CREATE TABLE cost_limits (
  provider_id TEXT PRIMARY KEY,
  period TEXT NOT NULL,  -- 'daily', 'monthly'
  warning_threshold REAL,
  hard_limit REAL,
  FOREIGN KEY (provider_id) REFERENCES provider_configs(provider_id)
);
```

---

## Security Considerations

### API Key Storage
- Use `flutter_secure_storage` for all API keys
- Never log API keys (even partially)
- Clear keys on app uninstall
- Encrypt database containing usage data
- Support biometric unlock for viewing keys

### Network Security
- HTTPS only for all cloud APIs
- Certificate pinning (optional, for paranoid mode)
- Request signing where supported
- Timeout enforcement (prevent hanging requests)

### Data Privacy
- No telemetry sent to Private Chat Hub servers
- Cloud API providers receive only message content
- Local database encrypted by default
- Crash reports exclude message content and API keys
- Export functionality excludes API keys

---

## Error Handling

### Error Types
```dart
class LLMProviderException implements Exception {
  final String code;
  final String message;
  final bool recoverable;
  final String? userAction;
  final Duration? retryAfter;
  final String? suggestedFallback;
  
  LLMProviderException({
    required this.code,
    required this.message,
    this.recoverable = false,
    this.userAction,
    this.retryAfter,
    this.suggestedFallback,
  });
}
```

### Common Error Codes
- `INVALID_API_KEY`: API key invalid or expired
- `RATE_LIMITED`: Rate limit exceeded
- `QUOTA_EXCEEDED`: Usage quota exceeded
- `SERVICE_UNAVAILABLE`: Provider temporarily down
- `NETWORK_ERROR`: Network connectivity issue
- `TIMEOUT`: Request timed out
- `INVALID_MODEL`: Model not found or unavailable
- `CONTEXT_TOO_LONG`: Message exceeds context window
- `UNSAFE_CONTENT`: Content blocked by provider

---

## Performance Optimizations

### Connection Pooling
- Reuse HTTP clients per provider
- Keep connections alive (keep-alive header)
- Connection pool size: 5 per provider

### Caching
- Cache model lists (TTL: 1 hour)
- Cache provider capabilities (TTL: 24 hours)
- Cache pricing data (updated with app)

### Parallel Operations
- Health checks run in parallel
- Model list fetching parallelized
- Multiple provider queries concurrent

---

## Testing Strategy

### Unit Tests
- Each provider implementation isolated
- Mock HTTP responses
- Test all error scenarios
- Test token counting accuracy
- Test cost calculations

### Integration Tests
- End-to-end message flow
- Fallback chain execution
- Health monitoring
- Cost tracking and limits
- API key management

### E2E Tests
- Real API calls (test keys)
- Streaming performance
- Error recovery
- UI responsiveness

---

## Migration Path

### Phase 1: Infrastructure (Week 1-2)
1. Implement `LLMProvider` interface
2. Refactor `OllamaService` → `OllamaProvider`
3. Refactor `OnDeviceLLMService` → `LocalProvider`
4. Create `ProviderRegistry`
5. Update `ChatService` to use registry

### Phase 2: Cloud APIs (Week 3-4)
1. Implement `OpenAIProvider`
2. Implement `AnthropicProvider`
3. Implement `GoogleAIProvider`
4. Add API key management UI
5. Test streaming for all providers

### Phase 3: Advanced Features (Week 5-6)
1. Implement `FallbackStrategy`
2. Implement `CostTrackingService`
3. Add health monitoring
4. Update model picker UI
5. Add cost display in messages

### Phase 4: Polish (Week 7)
1. Comprehensive error handling
2. Performance optimizations
3. User documentation
4. Beta testing
5. Bug fixes

---

## Related Documents

- [PRODUCT_REQUIREMENTS_V1.5.md](PRODUCT_REQUIREMENTS_V1.5.md) - Functional requirements
- [PRODUCT_VISION.md](PRODUCT_VISION.md) - Product strategy
- [ARCHITECTURE_LOCAL_REMOTE_MODEL_SYSTEM.md](ARCHITECTURE_LOCAL_REMOTE_MODEL_SYSTEM.md) - v1.0 architecture baseline

---

**Status:** Active Design - Ready for Implementation

**Next Steps:**
1. Review architecture with technical team
2. Validate provider abstractions with proof-of-concept
3. Begin Phase 1 implementation
4. Create detailed API integration guides for each provider
