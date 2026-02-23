# Architecture Decisions: Private Chat Hub

**Document Version:** 1.0  
**Created:** December 31, 2025  
**Purpose:** Document architectural decisions and their rationale  
**Audience:** Developers, architects, technical stakeholders

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Architecture Decisions](#2-core-architecture-decisions)
3. [Data Layer Decisions](#3-data-layer-decisions)
4. [Network Layer Decisions](#4-network-layer-decisions)
5. [State Management Decisions](#5-state-management-decisions)
6. [UI Architecture Decisions](#6-ui-architecture-decisions)
7. [Security Architecture Decisions](#7-security-architecture-decisions)
8. [Performance Architecture Decisions](#8-performance-architecture-decisions)
9. [Trade-offs & Alternatives Considered](#9-trade-offs--alternatives-considered)
10. [Decision Log](#10-decision-log)

---

## 1. Architecture Overview

### System Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    SYSTEM CONTEXT                                        │
└─────────────────────────────────────────────────────────────────────────────────────────┘

                                    ┌─────────────────┐
                                    │   Android User  │
                                    │   (5 Personas)  │
                                    └────────┬────────┘
                                             │
                                             │ Uses
                                             ▼
                              ┌──────────────────────────────┐
                              │                              │
                              │     Private Chat Hub         │
                              │     (Flutter Android App)    │
                              │                              │
                              │  • Chat Interface            │
                              │  • Model Management          │
                              │  • Conversation Storage      │
                              │  • Settings & Export         │
                              │                              │
                              └──────────────┬───────────────┘
                                             │
                                             │ HTTP/HTTPS
                                             │ REST API
                                             ▼
                              ┌──────────────────────────────┐
                              │                              │
                              │     Ollama Server            │
                              │     (User's Network)         │
                              │                              │
                              │  • LLM Inference             │
                              │  • Model Downloads           │
                              │  • Vision Processing         │
                              │                              │
                              └──────────────────────────────┘
```

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 APPLICATION LAYERS                                       │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │   Chat Screen    │  │  Models Screen   │  │ Settings Screen  │  │   Onboarding     │ │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘ │
│           │                     │                     │                     │           │
│  ┌────────┴─────────────────────┴─────────────────────┴─────────────────────┴────────┐  │
│  │                           RIVERPOD PROVIDERS                                       │  │
│  │   chatProvider │ modelsProvider │ settingsProvider │ connectionProvider            │  │
│  └────────────────────────────────────────┬──────────────────────────────────────────┘  │
└───────────────────────────────────────────┼─────────────────────────────────────────────┘
                                            │
┌───────────────────────────────────────────┼─────────────────────────────────────────────┐
│                              DOMAIN LAYER │                                              │
│  ┌──────────────────┐  ┌─────────────────┴──┐  ┌──────────────────┐                     │
│  │    Entities      │  │     Use Cases      │  │   Repositories   │                     │
│  │                  │  │                    │  │   (Interfaces)   │                     │
│  │  • Conversation  │  │  • SendMessage     │  │                  │                     │
│  │  • Message       │  │  • SwitchModel     │  │  • IChatRepo     │                     │
│  │  • OllamaModel   │  │  • DownloadModel   │  │  • IModelRepo    │                     │
│  │  • Connection    │  │  • ExportData      │  │  • ISettingsRepo │                     │
│  └──────────────────┘  └────────────────────┘  └──────────────────┘                     │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
┌───────────────────────────────────────────┼─────────────────────────────────────────────┐
│                               DATA LAYER  │                                              │
│  ┌────────────────────────────────────────┴──────────────────────────────────────────┐  │
│  │                           REPOSITORIES (Implementations)                           │  │
│  │    ChatRepository    │    ModelRepository    │    SettingsRepository               │  │
│  └────────────────────────────────────────┬──────────────────────────────────────────┘  │
│                                           │                                              │
│  ┌────────────────────────────────────────┼──────────────────────────────────────────┐  │
│  │                            DATA SOURCES                                            │  │
│  │                                        │                                           │  │
│  │  ┌─────────────────────┐     ┌─────────┴──────────┐     ┌─────────────────────┐   │  │
│  │  │   LOCAL (SQLite)    │     │   REMOTE (Ollama)  │     │   PREFERENCES       │   │  │
│  │  │                     │     │                    │     │                     │   │  │
│  │  │  • conversations    │     │  • GET /api/tags   │     │  • connection host  │   │  │
│  │  │  • messages         │     │  • POST /api/chat  │     │  • theme settings   │   │  │
│  │  │  • messages_fts     │     │  • POST /api/pull  │     │  • default model    │   │  │
│  │  │  • connection_profs │     │  • POST /api/show  │     │  • font size        │   │  │
│  │  └─────────────────────┘     └────────────────────┘     └─────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architecture Decisions

### Decision 2.1: Clean Architecture Pattern

**Decision:** Use Clean Architecture with clear separation between Presentation, Domain, and Data layers.

**Rationale:**
| Criteria | Benefit |
|----------|---------|
| Testability | Each layer can be tested independently |
| Maintainability | Changes in one layer don't cascade |
| Flexibility | Easy to swap implementations (e.g., different DB) |
| Scalability | Clear boundaries for team collaboration |
| Dependency Rule | Inner layers don't know about outer layers |

**Alternatives Considered:**
| Pattern | Pros | Cons | Decision |
|---------|------|------|----------|
| MVC | Simple, well-known | Tight coupling, fat controllers | ❌ Rejected |
| MVVM | Good for data binding | Overkill for Flutter's reactive model | ❌ Rejected |
| **Clean Architecture** | Testable, scalable, clear boundaries | More boilerplate | ✅ Chosen |
| Feature-First | Good for large teams | Can lead to duplication | ❌ Rejected |

**Implementation:**
```
lib/
├── core/           # Shared utilities, constants, errors
├── data/           # Data sources, models, repository implementations
├── domain/         # Business logic, entities, use cases, interfaces
├── presentation/   # UI, widgets, screens, providers
└── services/       # Cross-cutting services (share, storage)
```

---

### Decision 2.2: Riverpod for State Management

**Decision:** Use Riverpod 3.0+ as the primary state management solution.

**Rationale:**
| Feature | Riverpod Advantage |
|---------|-------------------|
| Async State | Built-in `AsyncValue` for loading/error/data |
| Caching | Automatic with `keepAlive` and `autoDispose` |
| Dependency Injection | Providers can depend on other providers |
| Testing | Easy to override providers in tests |
| Compile-time Safety | No runtime errors from missing providers |
| No BuildContext | Access state anywhere without widget tree |

**Comparison with Alternatives:**
| Solution | Pros | Cons | Decision |
|----------|------|------|----------|
| setState | Simple, built-in | No caching, prop drilling | ❌ Rejected |
| Provider | Popular, mature | Verbose, context-dependent | ❌ Rejected |
| Bloc | Predictable, events | Verbose, over-engineered for chat | ❌ Rejected |
| GetX | Easy, less boilerplate | Magic, testing difficulties | ❌ Rejected |
| **Riverpod** | Type-safe, flexible, testable | Learning curve | ✅ Chosen |

**Provider Types Used:**
```dart
// Simple synchronous state
final themeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.dark);

// Async data loading
final modelsProvider = FutureProvider<List<OllamaModel>>((ref) async {
  final client = ref.watch(ollamaClientProvider);
  return client.listModels();
});

// Streaming data
final chatStreamProvider = StreamProvider.family<Message, ChatRequest>(
  (ref, request) => ref.watch(ollamaClientProvider).streamChat(request),
);

// State notifier for complex state
final chatStateProvider = StateNotifierProvider<ChatNotifier, ChatState>(
  (ref) => ChatNotifier(ref),
);
```

---

### Decision 2.3: Offline-First Architecture

**Decision:** Design the app to work offline with local storage as the primary data source.

**Rationale:**
- Target persona Alex prioritizes privacy and local-first design
- Network connectivity to Ollama server may be intermittent
- All conversation data should persist without cloud dependency
- Reduces latency by caching model list and history

**Implementation Strategy:**
```
┌─────────────────────────────────────────────────────────────────┐
│                     OFFLINE-FIRST FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User Action                                                     │
│      │                                                           │
│      ▼                                                           │
│  ┌─────────────────┐                                            │
│  │ Save to Local   │ ◀─── Always save locally first             │
│  │ Database        │                                            │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │ Is Connected?   │────▶│ Send to Ollama  │                    │
│  │                 │ Yes │                 │                    │
│  └────────┬────────┘     └────────┬────────┘                    │
│           │ No                    │                              │
│           ▼                       ▼                              │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │ Queue for Later │     │ Update DB with  │                    │
│  │ (mark pending)  │     │ Response        │                    │
│  └─────────────────┘     └─────────────────┘                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Data Flow:**
1. All messages saved to SQLite immediately
2. Messages marked as `pending` until Ollama responds
3. Model list cached locally, refreshed on connect
4. Failed sends queued for automatic retry
5. UI always reads from local DB, not network

---

### Decision 2.4: Single Codebase, Android Target

**Decision:** Build for Android only in MVP, but maintain cross-platform compatible code.

**Rationale:**
| Consideration | Decision |
|---------------|----------|
| MVP scope | Android-first reduces testing matrix |
| User base | Majority of target users on Android |
| Flutter capability | Code is inherently cross-platform |
| Future iOS | Minimal changes needed to add iOS later |
| Package compatibility | All chosen packages support both platforms |

**Future-Proofing:**
- Avoid Android-specific APIs where possible
- Abstract platform-specific code behind interfaces
- Use conditional imports for platform differences
- Test on iOS simulator periodically

---

## 3. Data Layer Decisions

### Decision 3.1: SQLite with sqflite

**Decision:** Use SQLite (via sqflite package) for local data persistence.

**Rationale:**
| Requirement | SQLite Capability |
|-------------|-------------------|
| Structured data | ✅ Full relational model |
| Efficient queries | ✅ Indexes, joins |
| Full-text search | ✅ FTS5 extension |
| Transactions | ✅ ACID compliance |
| No server needed | ✅ Embedded database |
| Proven reliability | ✅ 20+ years maturity |

**Alternatives Rejected:**
| Solution | Reason for Rejection |
|----------|---------------------|
| Hive | No full-text search, NoSQL limitations |
| Isar | Newer, less community support |
| ObjectBox | Commercial licensing concerns |
| shared_preferences | Not suitable for structured data |
| Drift | Good option, but sqflite is simpler |

**Schema Design Principles:**
1. Normalize for data integrity (conversations ↔ messages)
2. Denormalize for read performance (model_name in messages)
3. Use FTS5 for search (messages_fts virtual table)
4. Soft delete for recoverability (is_archived flag)
5. Timestamps as integers (Unix epoch for simplicity)

---

### Decision 3.2: Database Schema

**Decision:** Use the following normalized schema with FTS5 search.

**Schema:**
```sql
-- Core tables
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  model_name TEXT,
  system_prompt TEXT,
  is_archived INTEGER DEFAULT 0
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model_name TEXT,
  created_at INTEGER NOT NULL,
  token_count INTEGER,
  images TEXT,    -- JSON array of paths
  files TEXT,     -- JSON array of metadata
  status TEXT DEFAULT 'sent', -- pending, sent, error
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Full-text search
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;

-- Connection profiles
CREATE TABLE connection_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 11434,
  is_default INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Model cache
CREATE TABLE cached_models (
  name TEXT PRIMARY KEY,
  size INTEGER,
  parameter_size TEXT,
  capabilities TEXT, -- JSON array
  last_updated INTEGER
);

-- Indexes
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);
```

**Entity Relationships:**
```
┌──────────────────┐       ┌──────────────────┐
│  conversations   │       │  messages        │
├──────────────────┤       ├──────────────────┤
│ id (PK)          │───┐   │ id (PK)          │
│ title            │   │   │ conversation_id  │◀──┘
│ created_at       │   │   │ role             │
│ updated_at       │   │   │ content          │
│ model_name       │   │   │ model_name       │
│ system_prompt    │   │   │ created_at       │
│ is_archived      │   │   │ token_count      │
└──────────────────┘   │   │ images           │
                       │   │ files            │
                       │   │ status           │
                       │   └──────────────────┘
                       │
                       └── 1:N relationship
```

---

### Decision 3.3: Image and File Storage

**Decision:** Store images/files in app-private directory, reference by path in database.

**Rationale:**
| Consideration | Decision |
|---------------|----------|
| Blob vs File | Files are more memory-efficient |
| Location | App-private directory (encrypted on Android) |
| Naming | UUID + original extension |
| Reference | Store relative path in messages.images JSON |
| Cleanup | Delete files when message/conversation deleted |

**Storage Structure:**
```
app_documents/
├── attachments/
│   ├── images/
│   │   ├── uuid-1.jpg
│   │   └── uuid-2.png
│   └── files/
│       ├── uuid-3.pdf
│       └── uuid-4.txt
└── exports/
    └── conversation-2025-01-01.json
```

**Implementation:**
```dart
class AttachmentService {
  Future<String> saveImage(Uint8List bytes, String extension) async {
    final dir = await getApplicationDocumentsDirectory();
    final uuid = Uuid().v4();
    final path = '${dir.path}/attachments/images/$uuid.$extension';
    await File(path).writeAsBytes(bytes);
    return path;
  }
  
  Future<void> deleteAttachment(String path) async {
    final file = File(path);
    if (await file.exists()) {
      await file.delete();
    }
  }
}
```

---

## 4. Network Layer Decisions

### Decision 4.1: Dio HTTP Client

**Decision:** Use Dio as the HTTP client for all Ollama API communication.

**Rationale:**
| Feature | Dio Advantage |
|---------|---------------|
| Streaming | `ResponseType.stream` for chat responses |
| Cancellation | `CancelToken` for stopping generation |
| Interceptors | Logging, error handling, retry logic |
| Timeout | Configurable connect/receive timeouts |
| Progress | Upload/download progress callbacks |

**Alternatives Rejected:**
| Client | Reason for Rejection |
|--------|---------------------|
| http | No built-in streaming, limited features |
| Chopper | Over-abstracted for simple REST |
| Retrofit | More suited for code-generated clients |

**Configuration:**
```dart
class OllamaClient {
  late final Dio _dio;
  
  OllamaClient({required String baseUrl}) {
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: Duration(seconds: 10),
      receiveTimeout: Duration(minutes: 5), // Long for model responses
    ));
    
    _dio.interceptors.addAll([
      LogInterceptor(requestBody: true, responseBody: false),
      RetryInterceptor(retries: 3),
    ]);
  }
}
```

---

### Decision 4.2: Streaming Response Handling

**Decision:** Parse Ollama streaming responses using a buffered line-by-line approach.

**Rationale:**
- Ollama streams JSON objects separated by newlines
- Chunks may split across JSON boundaries
- Need buffer to accumulate partial JSON

**Implementation:**
```dart
Stream<ChatChunk> streamChat(ChatRequest request) async* {
  final response = await _dio.post(
    '/api/chat',
    data: request.toJson(),
    options: Options(responseType: ResponseType.stream),
  );

  String buffer = '';
  await for (var chunk in response.data.stream) {
    buffer += utf8.decode(chunk);
    
    // Process complete lines
    while (buffer.contains('\n')) {
      final newlineIndex = buffer.indexOf('\n');
      final line = buffer.substring(0, newlineIndex);
      buffer = buffer.substring(newlineIndex + 1);
      
      if (line.isNotEmpty) {
        yield ChatChunk.fromJson(jsonDecode(line));
      }
    }
  }
}
```

---

### Decision 4.3: Connection Health Monitoring

**Decision:** Implement proactive connection health checks with status indicator.

**Rationale:**
- Users need to know if Ollama is reachable before sending
- Prevents confusion when messages fail
- Enables graceful degradation to offline mode

**Implementation:**
```dart
enum ConnectionStatus { connected, connecting, disconnected, error }

class ConnectionMonitor {
  final Duration healthCheckInterval = Duration(seconds: 30);
  final StreamController<ConnectionStatus> _statusController;
  
  Stream<ConnectionStatus> get statusStream => _statusController.stream;
  
  Future<void> checkHealth() async {
    try {
      _statusController.add(ConnectionStatus.connecting);
      final response = await _dio.get('/api/version');
      if (response.statusCode == 200) {
        _statusController.add(ConnectionStatus.connected);
      }
    } catch (e) {
      _statusController.add(ConnectionStatus.disconnected);
    }
  }
}
```

**Reconnection Strategy:**
```
Disconnected → Wait 5s → Retry → Success → Connected
                  ↓                   ↓
            Wait 10s → Retry → Fail → Wait 20s → ...
                               (Exponential backoff, max 60s)
```

---

### Decision 4.4: Request Cancellation

**Decision:** Support canceling in-progress chat generation via Dio CancelToken.

**Rationale:**
- Users may want to stop a long-running response
- Prevents wasted computation on Ollama server
- Better UX than waiting for completion

**Implementation:**
```dart
class ChatService {
  CancelToken? _currentCancelToken;
  
  Future<void> sendMessage(String content) async {
    _currentCancelToken = CancelToken();
    
    try {
      await for (final chunk in streamChat(content, _currentCancelToken)) {
        // Process chunk
      }
    } on DioException catch (e) {
      if (CancelToken.isCancel(e)) {
        // User cancelled, handle gracefully
      }
    }
  }
  
  void stopGeneration() {
    _currentCancelToken?.cancel('User stopped generation');
  }
}
```

---

## 5. State Management Decisions

### Decision 5.1: Provider Organization

**Decision:** Organize providers by feature domain with clear dependencies.

**Provider Hierarchy:**
```
┌─────────────────────────────────────────────────────────────────┐
│                     PROVIDER DEPENDENCY GRAPH                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  settingsProvider ─────────────────────────────┐                │
│        │                                       │                │
│        ▼                                       ▼                │
│  connectionProvider ──────────────────▶ ollamaClientProvider    │
│        │                                       │                │
│        │                    ┌──────────────────┼────────┐       │
│        │                    ▼                  ▼        ▼       │
│        │             modelsProvider    chatProvider  pullProvider│
│        │                    │                  │                │
│        ▼                    ▼                  ▼                │
│  connectionStatusProvider   modelDetailsProvider  messagesProvider│
│                                                                  │
│  databaseProvider ──────────────────────────────────────────────│
│        │                                                         │
│        └──────▶ conversationsProvider, searchProvider            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Provider File Structure:**
```
lib/presentation/providers/
├── connection_providers.dart   # Connection, status, client
├── chat_providers.dart         # Messages, streaming, conversations
├── model_providers.dart        # Model list, details, downloads
├── settings_providers.dart     # Theme, preferences
└── search_providers.dart       # FTS search
```

---

### Decision 5.2: Async State Handling

**Decision:** Use Riverpod's `AsyncValue` consistently for all async operations.

**Rationale:**
- Provides unified pattern for loading/error/data states
- Built-in helpers: `.when()`, `.maybeWhen()`, `.whenData()`
- Type-safe, no null checks needed
- Automatic error propagation

**Pattern:**
```dart
// Provider definition
final modelsProvider = FutureProvider<List<OllamaModel>>((ref) async {
  final client = ref.watch(ollamaClientProvider);
  return client.listModels();
});

// Widget usage
class ModelsScreen extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final modelsAsync = ref.watch(modelsProvider);
    
    return modelsAsync.when(
      loading: () => const LoadingIndicator(),
      error: (error, stack) => ErrorView(error: error, onRetry: () {
        ref.invalidate(modelsProvider);
      }),
      data: (models) => ModelsList(models: models),
    );
  }
}
```

---

### Decision 5.3: State Notifier for Complex State

**Decision:** Use `StateNotifier` for screens with complex, mutable state.

**When to Use StateNotifier:**
- Chat screen (multiple interacting states)
- Download manager (progress, queue, status)
- Form screens (validation, submission)

**Example:**
```dart
@freezed
class ChatState with _$ChatState {
  const factory ChatState({
    required List<Message> messages,
    required bool isGenerating,
    required String currentModel,
    String? pendingMessage,
    String? error,
  }) = _ChatState;
}

class ChatNotifier extends StateNotifier<ChatState> {
  ChatNotifier(this._ref) : super(ChatState.initial());
  
  final Ref _ref;
  
  Future<void> sendMessage(String content) async {
    state = state.copyWith(
      pendingMessage: content,
      isGenerating: true,
    );
    
    try {
      // Send and stream response
    } catch (e) {
      state = state.copyWith(error: e.toString(), isGenerating: false);
    }
  }
  
  void stopGeneration() {
    _ref.read(ollamaClientProvider).cancelCurrentRequest();
    state = state.copyWith(isGenerating: false);
  }
}
```

---

## 6. UI Architecture Decisions

### Decision 6.1: Widget Composition Over Inheritance

**Decision:** Build complex UIs by composing smaller, focused widgets.

**Rationale:**
- Flutter favors composition over inheritance
- Smaller widgets are easier to test
- Enables reuse across screens
- Improves build performance (smaller rebuild scope)

**Widget Hierarchy Example:**
```
ChatScreen
├── AppBar
│   ├── DrawerButton
│   ├── ConversationTitle
│   └── ModelChip (tappable)
├── MessagesList
│   ├── MessageBubble
│   │   ├── UserMessage
│   │   │   ├── MessageText
│   │   │   └── AttachmentPreview
│   │   └── AssistantMessage
│   │       ├── MarkdownContent
│   │       │   └── CodeBlock (with copy)
│   │       └── TypingIndicator
│   └── DateDivider
├── ErrorBanner (conditional)
└── InputBar
    ├── AttachmentButton
    ├── TextField
    └── SendButton
```

---

### Decision 6.2: Feature-Based Screen Organization

**Decision:** Organize screens by feature, with shared widgets in common directory.

**Directory Structure:**
```
lib/presentation/
├── screens/
│   ├── chat/
│   │   ├── chat_screen.dart
│   │   ├── widgets/
│   │   │   ├── message_bubble.dart
│   │   │   ├── input_bar.dart
│   │   │   └── typing_indicator.dart
│   │   └── chat_screen_test.dart
│   ├── models/
│   │   ├── models_screen.dart
│   │   ├── model_details_screen.dart
│   │   └── widgets/
│   ├── settings/
│   └── onboarding/
└── widgets/
    ├── common/
    │   ├── loading_indicator.dart
    │   ├── error_view.dart
    │   └── empty_state.dart
    └── layout/
        ├── app_scaffold.dart
        └── drawer_navigation.dart
```

---

### Decision 6.3: Material Design 3 Theming

**Decision:** Use Material 3 with `ColorScheme.fromSeed()` for consistent theming.

**Rationale:**
- Modern Android design language (Android 12+)
- Dynamic color support adapts to wallpaper
- Simplified color management with semantic names
- Built-in dark mode support

**Implementation:**
```dart
final ThemeData lightTheme = ThemeData(
  useMaterial3: true,
  colorScheme: ColorScheme.fromSeed(
    seedColor: const Color(0xFF6750A4), // Primary brand color
    brightness: Brightness.light,
  ),
);

final ThemeData darkTheme = ThemeData(
  useMaterial3: true,
  colorScheme: ColorScheme.fromSeed(
    seedColor: const Color(0xFF6750A4),
    brightness: Brightness.dark,
  ),
);
```

---

## 7. Security Architecture Decisions

### Decision 7.1: Data at Rest Protection

**Decision:** Rely on Android's app-private storage encryption; no additional encryption layer.

**Rationale:**
| Consideration | Decision |
|---------------|----------|
| Android encryption | Enabled by default on Android 10+ |
| App-private directory | Only accessible by this app |
| SQLite encryption | Adds complexity, marginal benefit |
| User expectation | Local app, not enterprise security |

**Data Classification:**
| Data Type | Storage | Protection |
|-----------|---------|------------|
| Messages | SQLite in app-private | Android encryption |
| Images/Files | App-private files | Android encryption |
| Settings | SharedPreferences | Non-sensitive |
| Connection profiles | SQLite | Consider encryption for passwords |

---

### Decision 7.2: Network Security

**Decision:** Support both HTTP and HTTPS; encourage HTTPS with clear warnings.

**Rationale:**
- Local network Ollama often uses HTTP (simpler setup)
- HTTPS requires certificate management
- User choice with informed warning

**Implementation:**
```dart
// Show warning for HTTP connections
if (!url.startsWith('https://')) {
  showSecurityWarning(context, '''
    This connection is not encrypted. Data between 
    your device and Ollama server is visible on the network.
    
    For secure connections, configure Ollama with TLS.
  ''');
}
```

---

### Decision 7.3: No Telemetry

**Decision:** Zero telemetry, analytics, or external network calls beyond Ollama.

**Rationale:**
- Core privacy promise to users
- Differentiator from cloud-based alternatives
- Simplifies privacy policy
- Reduces attack surface

**Verification:**
- Code review for any external URLs
- Network traffic analysis in testing
- Privacy policy explicitly states no tracking

---

## 8. Performance Architecture Decisions

### Decision 8.1: Virtualized Lists

**Decision:** Use `ListView.builder` for all message lists with pagination.

**Rationale:**
- Only visible items are built/rendered
- Handles thousands of messages efficiently
- Memory usage bounded by viewport size
- Standard Flutter pattern

**Implementation:**
```dart
ListView.builder(
  reverse: true, // New messages at bottom
  itemCount: messages.length,
  itemBuilder: (context, index) {
    return MessageBubble(message: messages[index]);
  },
)
```

**Pagination Strategy:**
- Load 50 messages initially
- Load 50 more when scrolling to top
- Preserve scroll position during load

---

### Decision 8.2: Streaming UI Updates

**Decision:** Debounce streaming text updates to 16ms (60 FPS) to prevent jank.

**Rationale:**
- Ollama can stream tokens faster than 60 FPS
- Each setState triggers rebuild
- Batching updates maintains smooth scrolling

**Implementation:**
```dart
class StreamingMessageWidget extends StatefulWidget {
  // ...
}

class _StreamingMessageWidgetState extends State<StreamingMessageWidget> {
  String _displayedContent = '';
  Timer? _debounceTimer;
  
  void _updateContent(String newContent) {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(Duration(milliseconds: 16), () {
      setState(() {
        _displayedContent = newContent;
      });
    });
  }
}
```

---

### Decision 8.3: Image Compression

**Decision:** Compress images before sending to Ollama (max 1024px, 80% quality).

**Rationale:**
- Vision models don't need 4K images
- Reduces base64 payload size
- Faster network transmission
- Lower memory usage

**Implementation:**
```dart
Future<Uint8List> compressImage(Uint8List bytes) async {
  final image = await decodeImage(bytes);
  
  // Resize if larger than 1024px
  final resized = await resizeImage(image, maxDimension: 1024);
  
  // Compress to JPEG 80%
  return await encodeJpeg(resized, quality: 80);
}
```

---

## 9. Trade-offs & Alternatives Considered

### Trade-off 9.1: Clean Architecture Boilerplate

**Tension:** Clean Architecture adds more files and layers.

**Resolution:** Accept boilerplate for testability and maintainability.
- Use code generation (freezed, riverpod_generator) to reduce manual code
- Clear templates for new features
- Worth it for 12-20 week project lifespan

---

### Trade-off 9.2: SQLite vs NoSQL

**Tension:** SQLite requires schema definition; NoSQL is more flexible.

**Resolution:** SQLite chosen for:
- Full-text search (FTS5) is critical for message search
- Relational queries for conversation-message joins
- Proven reliability over decades
- Better tooling for debugging (DB browser)

---

### Trade-off 9.3: Offline-First Complexity

**Tension:** Offline-first adds sync logic and state management.

**Resolution:** Accept complexity for better UX:
- Privacy-focused users expect local-first
- Network to Ollama may be unreliable
- Simpler than cloud sync (no conflict resolution)

---

### Alternative Rejected: GraphQL for Ollama

**Reason:** Ollama uses REST API only
- No control over Ollama's API design
- REST is sufficient for all operations
- No benefit to wrapping REST in GraphQL layer

---

### Alternative Rejected: Code Generation for API Client

**Reason:** Ollama API is simple enough
- Only ~10 endpoints
- Streaming responses need custom handling
- Manual client provides full control
- Retrofit/Chopper add unnecessary abstraction

---

## 10. Decision Log

| ID | Decision | Date | Status | Owner |
|----|----------|------|--------|-------|
| 2.1 | Clean Architecture pattern | 2025-12-31 | ✅ Approved | @architect |
| 2.2 | Riverpod state management | 2025-12-31 | ✅ Approved | @architect |
| 2.3 | Offline-first architecture | 2025-12-31 | ✅ Approved | @architect |
| 2.4 | Android-only MVP | 2025-12-31 | ✅ Approved | @product-owner |
| 3.1 | SQLite with sqflite | 2025-12-31 | ✅ Approved | @architect |
| 3.2 | Database schema | 2025-12-31 | ✅ Approved | @architect |
| 3.3 | File-based attachment storage | 2025-12-31 | ✅ Approved | @architect |
| 4.1 | Dio HTTP client | 2025-12-31 | ✅ Approved | @researcher |
| 4.2 | Buffered stream parsing | 2025-12-31 | ✅ Approved | @architect |
| 4.3 | Connection health monitoring | 2025-12-31 | ✅ Approved | @architect |
| 4.4 | Request cancellation support | 2025-12-31 | ✅ Approved | @architect |
| 5.1 | Feature-based provider organization | 2025-12-31 | ✅ Approved | @architect |
| 5.2 | AsyncValue pattern | 2025-12-31 | ✅ Approved | @architect |
| 5.3 | StateNotifier for complex state | 2025-12-31 | ✅ Approved | @architect |
| 6.1 | Widget composition | 2025-12-31 | ✅ Approved | @architect |
| 6.2 | Feature-based screen organization | 2025-12-31 | ✅ Approved | @architect |
| 6.3 | Material Design 3 theming | 2025-12-31 | ✅ Approved | @experience-designer |
| 7.1 | Android encryption for data at rest | 2025-12-31 | ✅ Approved | @architect |
| 7.2 | HTTP/HTTPS with warnings | 2025-12-31 | ✅ Approved | @architect |
| 7.3 | Zero telemetry policy | 2025-12-31 | ✅ Approved | @product-owner |
| 8.1 | Virtualized message lists | 2025-12-31 | ✅ Approved | @architect |
| 8.2 | Debounced streaming updates | 2025-12-31 | ✅ Approved | @architect |
| 8.3 | Image compression before send | 2025-12-31 | ✅ Approved | @architect |

---

## Related Documents

- [TECHNICAL_FEASIBILITY.md](TECHNICAL_FEASIBILITY.md) - Package research and API analysis
- [UX_DESIGN.md](UX_DESIGN.md) - Screen designs and user flows
- [UX_DESIGN_DECISIONS.md](UX_DESIGN_DECISIONS.md) - UX decision rationale
- [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) - Functional requirements
- [USER_STORIES_MVP.md](USER_STORIES_MVP.md) - Implementation stories

---

*This document should be updated when architectural decisions are revisited or new decisions are made during development.*
