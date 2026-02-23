# Architecture: Local & Remote Model System

## Overview

This document defines the technical architecture for a unified chat system that seamlessly integrates local (LiteRT) and remote (Ollama) AI models with intelligent offline support and automatic message queueing.

**Date:** January 25, 2026  
**Status:** Complete Specification  
**Related Documents:**
- [UX_DESIGN_LOCAL_REMOTE_MODEL_SYSTEM.md](UX_DESIGN_LOCAL_REMOTE_MODEL_SYSTEM.md)
- [LITERT_INTEGRATION_AUDIT.md](../audit/LITERT_INTEGRATION_AUDIT.md)
- [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Layer                                 │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │ Conversation   │  │   Chat Screen  │  │ Model Management │  │
│  │ List Screen    │  │                │  │     Screen       │  │
│  └────────┬───────┘  └───────┬────────┘  └──────┬───────────┘  │
└───────────┼──────────────────┼──────────────────┼──────────────┘
            │                  │                  │
┌───────────┼──────────────────┼──────────────────┼──────────────┐
│           │      Service Layer                  │              │
│           ▼                  ▼                  ▼              │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              ChatService (Central Router)              │   │
│  │  • Routes to local or remote based on model type       │   │
│  │  • Manages conversations and messages                  │   │
│  │  • Handles offline queueing                            │   │
│  │  • Coordinates connectivity and queue services         │   │
│  └──┬─────────────────────┬─────────────────────┬─────────┘   │
│     │                     │                     │             │
│     ▼                     ▼                     ▼             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │UnifiedModel  │  │Connectivity  │  │MessageQueue      │   │
│  │Service       │  │Service       │  │Service           │   │
│  │              │  │              │  │                  │   │
│  │• Combine     │  │• Monitor     │  │• Queue messages  │   │
│  │  models      │  │  connection  │  │• FIFO processing │   │
│  │• Detect type │  │• Health      │  │• Retry logic     │   │
│  │              │  │  checks      │  │                  │   │
│  └──┬───────────┘  └──────────────┘  └──────────────────┘   │
│     │                                                         │
│     ├─────────────────┬───────────────────┐                  │
│     ▼                 ▼                   ▼                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │OnDeviceLLM   │  │InferenceConfig│  │ModelDownload     │   │
│  │Service       │  │Service       │  │Service           │   │
│  │              │  │              │  │                  │   │
│  │• LiteRT impl │  │• Mode prefs  │  │• Download models │   │
│  │• Local       │  │• Settings    │  │• Track progress  │   │
│  │  inference   │  │              │  │• Manage storage  │   │
│  └──┬───────────┘  └──────────────┘  └──────┬───────────┘   │
│     │                                        │               │
│     ▼                                        ▼               │
│  ┌──────────────────┐              ┌───────────────────┐    │
│  │ModelManager      │              │StorageService     │    │
│  │                  │              │                   │    │
│  │• Load/unload     │              │• SharedPreferences│    │
│  │• Auto-unload     │              │• Local cache      │    │
│  │• Lifecycle       │              │                   │    │
│  └──┬───────────────┘              └───────────────────┘    │
│     │                                                        │
└─────┼────────────────────────────────────────────────────────┘
      │
┌─────┼────────────────────────────────────────────────────────┐
│     │           Platform Layer                               │
│     ▼                                                         │
│  ┌──────────────────┐              ┌───────────────────┐     │
│  │LiteRTPlatform    │              │Ollama Toolkit     │     │
│  │Channel           │              │                   │     │
│  │                  │              │• HTTP client      │     │
│  │• Method channel  │              │• API wrapper      │     │
│  │• Event stream    │              │• Streaming        │     │
│  │• Native bridge   │              │                   │     │
│  └──┬───────────────┘              └───────────────────┘     │
│     │                                                         │
└─────┼─────────────────────────────────────────────────────────┘
      │
┌─────┼─────────────────────────────────────────────────────────┐
│     │           Native Layer (Android)                        │
│     ▼                                                          │
│  ┌──────────────────┐              ┌────────────────────┐    │
│  │LiteRTPlugin.kt   │              │Ollama Server       │    │
│  │                  │              │                    │    │
│  │• LiteRT-LM SDK   │              │• Remote HTTP API   │    │
│  │• Model loading   │              │• /api/chat         │    │
│  │• Inference       │              │• /api/tags         │    │
│  │• Resource mgmt   │              │                    │    │
│  └──────────────────┘              └────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. ChatService (Central Router)

**Purpose:** Central hub for all chat functionality with intelligent routing

**Responsibilities:**
- Route messages to local or remote backend
- Manage conversations and message persistence
- Handle offline queueing automatically
- Coordinate connectivity monitoring
- Process message queue when online
- Provide conversation update streams

**Key Methods:**

```dart
class ChatService {
  // Streaming message send (returns conversation updates)
  Stream<Conversation> sendMessage(String conversationId, String text);
  
  // Routes to local backend
  Stream<Conversation> _sendMessageOnDevice(String conversationId, String text);
  
  // Routes to remote backend
  Stream<Conversation> _sendMessageRemote(String conversationId, String text);
  
  // Queue management
  Future<Conversation> queueMessage(String conversationId, String text);
  Future<void> processMessageQueue();
  
  // Connectivity helpers
  bool get isOnline;
  bool get isOffline;
  
  // Services
  ConnectivityService get connectivityService;
  MessageQueueService get queueService;
  OnDeviceLLMService? get onDeviceLLMService;
}
```

**Routing Logic:**

```dart
Stream<Conversation> sendMessage(String conversationId, String text) async* {
  final conversation = getConversation(conversationId);
  final modelId = conversation.modelName;
  
  // 1. Check if model is local (has 'local:' prefix)
  if (UnifiedModelService.isLocalModel(modelId)) {
    _log('Using on-device inference (local model selected)');
    yield* _sendMessageOnDevice(conversationId, text);
    return;
  }
  
  // 2. Check explicit inference mode
  if (currentInferenceMode == InferenceMode.onDevice) {
    _log('Using on-device inference (mode explicitly set)');
    yield* _sendMessageOnDevice(conversationId, text);
    return;
  }
  
  // 3. Check if offline
  if (!isOnline) {
    // Try local fallback if available
    if (_onDeviceLLMService != null && await isOnDeviceAvailable()) {
      _log('Ollama offline: falling back to on-device inference');
      yield* _sendMessageOnDevice(conversationId, text);
      return;
    }
    
    // No fallback - queue the message
    _log('Offline mode: queueing message');
    final queued = await queueMessage(conversationId, text);
    yield queued;
    return;
  }
  
  // 4. Default: use remote
  yield* _sendMessageRemote(conversationId, text);
}
```

---

### 2. UnifiedModelService

**Purpose:** Provide single unified list of all available models (local + remote)

**Responsibilities:**
- Fetch remote models from Ollama
- Fetch local models from OnDeviceLLMService
- Combine into unified list
- Add appropriate prefixes and metadata
- Detect model type from ID

**Implementation:**

```dart
class UnifiedModelService {
  final OnDeviceLLMService? _onDeviceLLMService;
  
  // Prefix for local models to distinguish from remote
  static const String localModelPrefix = 'local:';
  
  /// Get unified list of all models
  Future<List<ModelInfo>> getUnifiedModelList(
    List<OllamaModelInfo> ollamaModels,
  ) async {
    final List<ModelInfo> unifiedList = [];
    
    // 1. Add Ollama models (remote)
    for (final ollamaModel in ollamaModels) {
      unifiedList.add(
        ModelInfo(
          id: ollamaModel.name,
          name: ollamaModel.name,
          description: ollamaModel.details ?? 'Ollama model',
          sizeBytes: ollamaModel.size,
          isDownloaded: true,
          capabilities: _getOllamaCapabilities(ollamaModel),
          isLocal: false, // Remote model
        ),
      );
    }
    
    // 2. Add on-device models (local)
    if (_onDeviceLLMService != null) {
      try {
        final localModels =
            await _onDeviceLLMService!.modelManager.getDownloadedModels();
        
        for (final localModel in localModels) {
          unifiedList.add(
            ModelInfo(
              id: '$localModelPrefix${localModel.id}', // Add prefix
              name: localModel.name,
              description: localModel.description,
              sizeBytes: localModel.sizeBytes,
              isDownloaded: localModel.isDownloaded,
              capabilities: localModel.capabilities,
              isLocal: true, // Local model
            ),
          );
        }
      } catch (e) {
        _log('Failed to fetch local models: $e');
      }
    }
    
    return unifiedList;
  }
  
  /// Check if model ID represents a local model
  static bool isLocalModel(String modelId) {
    return modelId.startsWith(localModelPrefix);
  }
  
  /// Check if model ID represents a remote model
  static bool isRemoteModel(String modelId) {
    return !isLocalModel(modelId);
  }
  
  /// Extract original model ID (remove prefix if present)
  static String getOriginalModelId(String modelId) {
    return modelId.replaceFirst(localModelPrefix, '');
  }
}
```

**Model List Structure:**

```dart
class ModelInfo {
  final String id;              // 'llama3:latest' or 'local:gemma3-1b'
  final String name;            // Display name
  final String description;     // Short description
  final int sizeBytes;          // Model size
  final bool isDownloaded;      // Downloaded locally
  final List<String> capabilities; // ['text', 'vision', 'tools']
  final String? downloadUrl;    // For local models
  final bool isLocal;           // true = LiteRT, false = Ollama
  
  String get sizeString; // Human-readable size
  String get typeLabel;  // 'Remote' or 'On-Device'
}
```

---

### 3. ConnectivityService

**Purpose:** Monitor Ollama server connectivity in real-time

**Responsibilities:**
- Periodic health checks (every 30s)
- Detect connection state changes
- Provide status stream for UI updates
- Manual refresh capability

**Implementation:**

```dart
class ConnectivityService {
  final OllamaConnectionManager _ollamaManager;
  
  Timer? _healthCheckTimer;
  final _statusController = StreamController<OllamaConnectivityStatus>.broadcast();
  OllamaConnectivityStatus _currentStatus = OllamaConnectivityStatus.disconnected;
  
  Stream<OllamaConnectivityStatus> get statusStream => _statusController.stream;
  OllamaConnectivityStatus get currentStatus => _currentStatus;
  
  bool get isOnline => _currentStatus == OllamaConnectivityStatus.connected;
  bool get isOffline => _currentStatus == OllamaConnectivityStatus.offline;
  
  ConnectivityService(this._ollamaManager) {
    _startHealthChecks();
  }
  
  void _startHealthChecks() {
    _healthCheckTimer?.cancel();
    _healthCheckTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _checkHealth(),
    );
    _checkHealth(); // Check immediately
  }
  
  Future<void> _checkHealth() async {
    try {
      final connection = _ollamaManager.connection;
      if (connection == null) {
        _updateStatus(OllamaConnectivityStatus.disconnected);
        return;
      }
      
      // Ping Ollama server
      final result = await _ollamaManager.testConnection();
      _updateStatus(result.isSuccessful
          ? OllamaConnectivityStatus.connected
          : OllamaConnectivityStatus.disconnected);
    } catch (e) {
      _updateStatus(OllamaConnectivityStatus.offline);
    }
  }
  
  void _updateStatus(OllamaConnectivityStatus newStatus) {
    if (_currentStatus != newStatus) {
      _currentStatus = newStatus;
      _statusController.add(newStatus);
    }
  }
  
  Future<void> refresh() async {
    await _checkHealth();
  }
  
  void dispose() {
    _healthCheckTimer?.cancel();
    _statusController.close();
  }
}

enum OllamaConnectivityStatus {
  connected,    // Successfully connected to Ollama
  disconnected, // Cannot reach Ollama (but network available)
  offline,      // No network connectivity
}
```

---

### 4. MessageQueueService

**Purpose:** Queue messages when offline and process when online

**Responsibilities:**
- FIFO queue management
- Persist queue to storage
- Retry logic with exponential backoff
- Max queue size enforcement
- Queue status updates

**Implementation:**

```dart
class MessageQueueService {
  final StorageService _storage;
  static const String _queueKey = 'message_queue';
  static const int _maxQueueSize = 50;
  static const List<int> _retryDelays = [0, 5, 15]; // seconds
  
  final _queueUpdateController = StreamController<List<QueueItem>>.broadcast();
  
  Stream<List<QueueItem>> get queueUpdates => _queueUpdateController.stream;
  
  /// Enqueue a message
  Future<void> enqueue({
    required String conversationId,
    required String messageId,
  }) async {
    final queue = getQueue();
    
    // Check size limit
    if (queue.length >= _maxQueueSize) {
      throw Exception('Queue is full (max: $_maxQueueSize)');
    }
    
    // Add to queue
    final item = QueueItem(
      id: const Uuid().v4(),
      conversationId: conversationId,
      messageId: messageId,
      enqueuedAt: DateTime.now(),
      retryCount: 0,
    );
    
    queue.add(item);
    await _saveQueue(queue);
    _queueUpdateController.add(queue);
  }
  
  /// Dequeue next item
  QueueItem? getNextQueueItem() {
    final queue = getQueue();
    return queue.isNotEmpty ? queue.first : null;
  }
  
  /// Remove item from queue
  Future<void> remove(String itemId) async {
    final queue = getQueue();
    queue.removeWhere((item) => item.id == itemId);
    await _saveQueue(queue);
    _queueUpdateController.add(queue);
  }
  
  /// Mark item as failed (increment retry count)
  Future<void> markFailed(String itemId) async {
    final queue = getQueue();
    final index = queue.indexWhere((item) => item.id == itemId);
    
    if (index != -1) {
      queue[index] = queue[index].copyWith(
        retryCount: queue[index].retryCount + 1,
        lastRetryAt: DateTime.now(),
      );
      await _saveQueue(queue);
      _queueUpdateController.add(queue);
    }
  }
  
  /// Check if item has exceeded max retries
  bool hasExceededMaxRetries(QueueItem item) {
    return item.retryCount >= _retryDelays.length;
  }
  
  /// Get queue count
  int getQueueCount() {
    return getQueue().length;
  }
  
  /// Get queue for specific conversation
  List<QueueItem> getConversationQueue(String conversationId) {
    return getQueue()
        .where((item) => item.conversationId == conversationId)
        .toList();
  }
  
  /// Get conversation queue count
  int getConversationQueueCount(String conversationId) {
    return getConversationQueue(conversationId).length;
  }
  
  /// Get entire queue
  List<QueueItem> getQueue() {
    final jsonString = _storage.getString(_queueKey);
    if (jsonString == null) return [];
    
    try {
      final List<dynamic> jsonList = jsonDecode(jsonString);
      return jsonList
          .map((json) => QueueItem.fromJson(json as Map<String, dynamic>))
          .toList();
    } catch (e) {
      return [];
    }
  }
  
  Future<void> _saveQueue(List<QueueItem> queue) async {
    final jsonString = jsonEncode(queue.map((item) => item.toJson()).toList());
    await _storage.setString(_queueKey, jsonString);
  }
  
  void dispose() {
    _queueUpdateController.close();
  }
}
```

**Queue Item Model:**

```dart
class QueueItem {
  final String id;
  final String conversationId;
  final String messageId;
  final DateTime enqueuedAt;
  final int retryCount;
  final DateTime? lastRetryAt;
  
  QueueItem({
    required this.id,
    required this.conversationId,
    required this.messageId,
    required this.enqueuedAt,
    required this.retryCount,
    this.lastRetryAt,
  });
  
  QueueItem copyWith({
    int? retryCount,
    DateTime? lastRetryAt,
  }) {
    return QueueItem(
      id: id,
      conversationId: conversationId,
      messageId: messageId,
      enqueuedAt: enqueuedAt,
      retryCount: retryCount ?? this.retryCount,
      lastRetryAt: lastRetryAt ?? this.lastRetryAt,
    );
  }
  
  Map<String, dynamic> toJson() => {
    'id': id,
    'conversationId': conversationId,
    'messageId': messageId,
    'enqueuedAt': enqueuedAt.toIso8601String(),
    'retryCount': retryCount,
    'lastRetryAt': lastRetryAt?.toIso8601String(),
  };
  
  factory QueueItem.fromJson(Map<String, dynamic> json) {
    return QueueItem(
      id: json['id'] as String,
      conversationId: json['conversationId'] as String,
      messageId: json['messageId'] as String,
      enqueuedAt: DateTime.parse(json['enqueuedAt'] as String),
      retryCount: json['retryCount'] as int,
      lastRetryAt: json['lastRetryAt'] != null
          ? DateTime.parse(json['lastRetryAt'] as String)
          : null,
    );
  }
}
```

---

### 5. OnDeviceLLMService

**Purpose:** Local inference using LiteRT-LM

**Responsibilities:**
- Load/unload local models
- Generate responses via platform channel
- Manage model lifecycle
- Support configurable parameters

**Implementation:** (Already exists, but key interface)

```dart
class OnDeviceLLMService implements LLMService {
  final ModelManager _modelManager;
  final LiteRTPlatformChannel _platformChannel;
  final InferenceConfigService? _configService;
  
  String? _currentModelId;
  
  @override
  Future<bool> isAvailable() async {
    return await _platformChannel.isAvailable();
  }
  
  @override
  Future<void> loadModel(String modelId) async {
    final success = await _modelManager.loadModel(modelId);
    if (success) {
      _currentModelId = modelId;
    } else {
      throw Exception('Failed to load model: $modelId');
    }
  }
  
  @override
  Stream<String> generateResponse({
    required String prompt,
    required String modelId,
    List<Message>? conversationHistory,
    String? systemPrompt,
    double temperature = 0.7,
    int? maxTokens,
  }) async* {
    // Ensure model is loaded
    if (_currentModelId != modelId) {
      await loadModel(modelId);
    }
    
    // Build full prompt with context
    final fullPrompt = _buildPrompt(
      prompt: prompt,
      systemPrompt: systemPrompt,
      conversationHistory: conversationHistory,
    );
    
    // Stream response
    yield* _platformChannel.generateTextStream(
      prompt: fullPrompt,
      temperature: temperature,
      maxTokens: maxTokens ?? 256,
    );
    
    // Reset auto-unload timer
    _modelManager.resetUnloadTimer();
  }
  
  ModelManager get modelManager => _modelManager;
}
```

---

## Data Flow

### Sending a Message (Online, Remote Model)

```
User taps send
    ↓
ChatService.sendMessage()
    ↓
Check model type: remote
    ↓
Check connectivity: online
    ↓
Create user message, add to conversation
    ↓
Save conversation to storage
    ↓
Create placeholder assistant message
    ↓
_sendMessageRemote()
    ↓
Build request with history
    ↓
OllamaConnectionManager.sendMessage()
    ↓
Stream response chunks
    ↓
For each chunk:
  - Update assistant message text
  - Update conversation in storage
  - Emit conversation to stream
    ↓
Mark message as complete
    ↓
UI receives updates via stream
```

### Sending a Message (Offline, Queue)

```
User taps send
    ↓
ChatService.sendMessage()
    ↓
Check model type: remote
    ↓
Check connectivity: offline
    ↓
Check local model available: no
    ↓
queueMessage()
    ↓
Create user message with status: queued
    ↓
Add to conversation, save to storage
    ↓
MessageQueueService.enqueue()
    ↓
Save queue item to storage
    ↓
Emit queue update
    ↓
UI shows message with queued icon
    ↓
Banner shows "X messages queued"
```

### Processing Queue (Connection Restored)

```
ConnectivityService detects online
    ↓
Emits connected status
    ↓
ChatService receives status update
    ↓
Calls processMessageQueue()
    ↓
For each queued message (FIFO):
  ↓
  Get queue item
  ↓
  Get conversation and message
  ↓
  Update message status: sending
  ↓
  Try to send via Ollama
  ↓
  If success:
    - Update message status: sent
    - Remove from queue
    - Continue to next
  ↓
  If failed:
    - Increment retry count
    - Check max retries
    - If exceeded: mark failed
    - If not: keep in queue
    ↓
Queue processing complete
    ↓
UI updates all messages
    ↓
Banner disappears
```

### Sending with Local Model

```
User taps send
    ↓
ChatService.sendMessage()
    ↓
Check model type: local (has 'local:' prefix)
    ↓
_sendMessageOnDevice()
    ↓
Extract original model ID
    ↓
Create user message, add to conversation
    ↓
Create placeholder assistant message
    ↓
OnDeviceLLMService.generateResponse()
    ↓
ModelManager.loadModel() if needed
    ↓
Build prompt with history
    ↓
LiteRTPlatformChannel.generateTextStream()
    ↓
LiteRTPlugin.generateText() (Kotlin)
    ↓
LiteRT-LM SDK inference
    ↓
Stream response chunks back
    ↓
For each chunk:
  - Update assistant message
  - Save conversation
  - Emit to stream
    ↓
ModelManager.resetUnloadTimer()
    ↓
UI receives updates
```

---

## Message Status State Machine

```
draft
  │
  ├─ Online + Remote ───────────► sending ──────► sent
  │                                  │
  │                                  └─► failed
  │
  ├─ Offline + Remote ──────────────► queued
  │                                     │
  │                                     └─► sending ──────► sent
  │                                           │
  │                                           └─► failed
  │
  └─ Local Model ───────────────────► sending ──────► sent
                                         │
                                         └─► failed
```

**State Definitions:**

- **draft**: Being composed by user
- **queued**: Waiting to send (offline)
- **sending**: Currently being sent to LLM
- **sent**: Successfully sent and response received
- **failed**: Send failed after retries

---

## Storage Schema

### Conversations

```dart
{
  "id": "uuid",
  "title": "string",
  "modelName": "string", // Can be "llama3:latest" or "local:gemma3-1b"
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "systemPrompt": "string?",
  "projectId": "string?",
  "messages": [
    {
      "id": "uuid",
      "role": "user|assistant",
      "text": "string",
      "timestamp": "ISO8601",
      "status": "draft|queued|sending|sent|failed",
      "queuedAt": "ISO8601?",
      "isStreaming": "bool"
    }
  ]
}
```

### Message Queue

```dart
[
  {
    "id": "uuid",
    "conversationId": "uuid",
    "messageId": "uuid",
    "enqueuedAt": "ISO8601",
    "retryCount": "int",
    "lastRetryAt": "ISO8601?"
  }
]
```

### Preferences

```dart
{
  "inference_mode": "remote|onDevice|auto",
  "auto_queue_offline": "bool",
  "show_queue_banner": "bool",
  "local_fallback_prompt": "bool"
}
```

---

## API Contracts

### UnifiedModelService.getUnifiedModelList()

**Input:**
```dart
List<OllamaModelInfo> ollamaModels
```

**Output:**
```dart
Future<List<ModelInfo>>
```

**Behavior:**
- Combines Ollama and local models
- Adds `local:` prefix to local model IDs
- Sets `isLocal` flag appropriately

---

### ChatService.sendMessage()

**Input:**
```dart
String conversationId
String text
```

**Output:**
```dart
Stream<Conversation>
```

**Behavior:**
1. Check model type from conversation
2. Route to appropriate backend
3. If offline + remote: queue message
4. Return stream of conversation updates

---

### MessageQueueService.enqueue()

**Input:**
```dart
String conversationId
String messageId
```

**Output:**
```dart
Future<void>
```

**Behavior:**
- Add to queue (FIFO)
- Persist to storage
- Emit queue update
- Throw if queue full

---

### ConnectivityService.statusStream

**Output:**
```dart
Stream<OllamaConnectivityStatus>
```

**Behavior:**
- Emits status changes
- Updated every 30 seconds
- Can be manually refreshed

---

## Error Handling

### Network Errors

**Connection Timeout:**
```dart
try {
  await ollamaManager.sendMessage(...);
} on TimeoutException {
  // Queue message
  await queueMessage(conversationId, messageId);
}
```

**Connection Refused:**
```dart
try {
  await ollamaManager.sendMessage(...);
} on SocketException {
  // Mark offline
  connectivityService.updateStatus(OllamaConnectivityStatus.offline);
  // Queue message
  await queueMessage(conversationId, messageId);
}
```

### Queue Errors

**Queue Full:**
```dart
try {
  await queueService.enqueue(...);
} on Exception catch (e) {
  // Show error to user
  showSnackBar('Queue is full. Please wait or clear queue.');
}
```

**Max Retries Exceeded:**
```dart
if (queueService.hasExceededMaxRetries(item)) {
  // Mark message as failed
  await markMessageAsFailed(conversationId, messageId);
  // Remove from queue
  await queueService.remove(item.id);
  // Notify user
  showNotification('Message failed to send after 3 attempts');
}
```

### Model Errors

**Model Not Found:**
```dart
try {
  await onDeviceService.loadModel(modelId);
} on Exception {
  // Prompt user to download
  showDialog('Model not available. Download now?');
}
```

**Inference Failed:**
```dart
try {
  await platformChannel.generateText(...);
} on PlatformException catch (e) {
  // Log error
  // Mark message as failed
  // Show user-friendly error
}
```

---

## Performance Considerations

### Model Loading

**Challenge:** Loading models takes time (1-5 seconds)

**Solution:**
- Load model on first message
- Keep loaded for 5 minutes (auto-unload timer)
- Reset timer on each generation
- Show loading indicator during load

### Queue Processing

**Challenge:** Processing large queues can take time

**Solution:**
- Process asynchronously in background
- Show progress (X of Y messages)
- Allow cancellation
- Batch updates to UI

### Memory Usage

**Challenge:** Large conversations + models use memory

**Solution:**
- Auto-unload models after timeout
- Limit conversation history in prompts (last N messages)
- Stream responses (don't buffer entire response)
- Clean up completed streams

---

## Testing Strategy

### Unit Tests

**ChatService:**
- Test routing logic (local vs remote)
- Test queueing when offline
- Test queue processing
- Test status updates

**UnifiedModelService:**
- Test model list combination
- Test prefix addition
- Test type detection

**MessageQueueService:**
- Test enqueue/dequeue
- Test retry logic
- Test max queue size
- Test persistence

**ConnectivityService:**
- Test status detection
- Test status stream
- Test health checks

### Integration Tests

**End-to-End Flow:**
1. Send message online → Success
2. Go offline → Message queued
3. Go online → Queue processed
4. Switch to local model → Works offline

**Offline Scenarios:**
- Queue message when offline
- Process queue when online
- Retry failed messages
- Max retries handling

**Local Model Scenarios:**
- Select local model
- Send message (works offline)
- Switch to remote model
- Fallback to local when offline

### UI Tests

**Model Selection:**
- Display unified list
- Visual distinction (local vs remote)
- Selection updates conversation

**Queue Banner:**
- Shows when messages queued
- Updates with progress
- Dismisses when empty

**Message Status:**
- Shows correct icon
- Updates on status change
- Retry action works

---

## Migration Path

### Phase 1: Foundation (Current)
- ✅ ChatService routing
- ✅ UnifiedModelService
- ✅ MessageQueueService
- ✅ ConnectivityService
- ✅ OnDeviceLLMService

### Phase 2: UI Integration
- Update model selector to use unified list
- Add queue status banner
- Add message status indicators
- Add retry actions

### Phase 3: Polish
- Add local fallback prompt
- Improve error messages
- Add queue management UI
- Performance optimizations

### Phase 4: Advanced Features
- Smart model suggestions
- Queue prioritization
- Background processing
- Multi-device sync (future)

---

## Configuration

### Default Settings

```dart
class AppConfig {
  // Connectivity
  static const healthCheckInterval = Duration(seconds: 30);
  static const requestTimeout = Duration(seconds: 60);
  
  // Queue
  static const maxQueueSize = 50;
  static const retryDelays = [0, 5, 15]; // seconds
  
  // Local models
  static const autoUnloadTimeout = Duration(minutes: 5);
  static const defaultTemperature = 0.7;
  static const defaultMaxTokens = 256;
  
  // UI
  static const showQueueBanner = true;
  static const showLocalFallbackPrompt = true;
}
```

### User Preferences

```dart
class UserPreferences {
  InferenceMode inferenceMode = InferenceMode.auto;
  bool autoQueueOffline = true;
  bool showQueueBanner = true;
  bool localFallbackPrompt = true;
}
```

---

## Security Considerations

### Local Model Security

**Threat:** Malicious model files

**Mitigation:**
- Download only from trusted sources (Hugging Face)
- Verify checksums
- Sandboxed execution (Android app sandbox)

### Queue Security

**Threat:** Queue manipulation

**Mitigation:**
- Queue stored in app-private storage
- No external access
- Encrypted if containing sensitive data

### Network Security

**Threat:** MITM attacks on Ollama connection

**Mitigation:**
- Support HTTPS
- Certificate pinning (optional)
- Local network assumed trusted

---

## Monitoring & Observability

### Metrics to Track

**Usage:**
- Messages sent (local vs remote)
- Queue size over time
- Retry rates
- Model selection distribution

**Performance:**
- Model load time
- Inference time (local vs remote)
- Queue processing time
- Network latency

**Errors:**
- Connection failures
- Queue failures
- Model load failures
- Inference failures

### Logging

```dart
class ChatServiceLogger {
  void logMessageSent(String modelId, bool isLocal, Duration latency);
  void logQueueAdded(int queueSize);
  void logQueueProcessed(int count, int failed);
  void logConnectivityChange(OllamaConnectivityStatus status);
  void logError(String operation, Exception error);
}
```

---

## Future Enhancements

### Short Term
- Batch queue processing
- Smarter retry delays (exponential backoff)
- Queue persistence improvements
- Better error categorization

### Medium Term
- Model caching strategies
- Prefetch models based on usage
- Background queue processing
- Push notifications for queue completion

### Long Term
- Multi-device queue sync
- Cloud backup for local models
- Federated learning integration
- Edge computing optimization

---

## Conclusion

This architecture provides a **robust, scalable, and user-friendly** system for unified local and remote model chat with intelligent offline support. Key strengths:

1. **Clean Separation:** Services have clear responsibilities
2. **Extensible:** Easy to add new model backends
3. **Reliable:** Automatic queueing and retry logic
4. **Performant:** Efficient resource management
5. **Observable:** Comprehensive logging and metrics

The system is designed to **just work** for users while providing flexibility for advanced use cases.

---

**End of Document**
