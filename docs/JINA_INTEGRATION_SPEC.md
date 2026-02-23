# Technical Specification: Jina AI Integration for Web Search

**Document Version:** 1.0  
**Phase:** Phase 1 (Tool Calling)  
**Timeline:** Weeks 1-10  
**Priority:** P0 (Critical for tool calling MVP)

---

## Table of Contents

1. [Jina API Overview](#1-jina-api-overview)
2. [Integration Architecture](#2-integration-architecture)
3. [Implementation Details](#3-implementation-details)
4. [Error Handling & Reliability](#4-error-handling--reliability)
5. [Performance Optimization](#5-performance-optimization)
6. [Security Considerations](#6-security-considerations)
7. [Cost & Quota Management](#7-cost--quota-management)
8. [Testing Strategy](#8-testing-strategy)
9. [Rollout Plan](#9-rollout-plan)

---

## 1. Jina API Overview

### 1.1 API Endpoints

**Jina provides three main endpoints for v2:**

| Endpoint | Purpose | Rate | Auth | Response |
|----------|---------|------|------|----------|
| `/search` | Web search | 100/min | API Key | JSON results |
| `/reader` (r.jina.ai) | Fetch & parse URL | 1000/day | None | Markdown |
| `/qa` | Q&A over context | 100/min | API Key | Text answer |

### 1.2 Search Endpoint

**URL:** `https://api.jina.ai/search`  
**Method:** `GET`  
**Auth:** Header `Authorization: Bearer {API_KEY}`

**Query Parameters:**
```
q         (string, required)  : Search query
limit     (integer)           : Results count (default 10, max 50)
lang      (string)           : Language code (default "en")
region    (string)           : Region code (default "us")
fresh     (string)           : Freshness filter ("d" day, "w" week, "m" month)
```

**Example Request:**
```bash
curl -H "Authorization: Bearer jina_****" \
  "https://api.jina.ai/search?q=flutter+widgets&limit=10"
```

**Example Response:**
```json
{
  "data": [
    {
      "title": "Flutter Widgets Library",
      "url": "https://flutter.dev/docs/development/ui/widgets",
      "snippet": "A comprehensive guide to Flutter's widget library...",
      "favicon": "https://flutter.dev/favicon.ico"
    },
    {
      "title": "Building Custom Widgets in Flutter",
      "url": "https://medium.com/...",
      "snippet": "Learn how to create custom widgets...",
      "favicon": null
    }
  ],
  "query": "flutter widgets",
  "searchTime": 0.284,
  "normalizedResults": 10
}
```

### 1.3 Reader Endpoint (URL Fetch)

**URL:** `https://r.jina.ai/{target-url}`  
**Method:** `GET`  
**Auth:** None required (public endpoint)

**Example Request:**
```bash
curl "https://r.jina.ai/https://example.com/article"
```

**Response:** Markdown-formatted content

### 1.4 Q&A Endpoint

**URL:** `https://api.jina.ai/qa`  
**Method:** `POST`  
**Auth:** Header `Authorization: Bearer {API_KEY}`

**Request Body:**
```json
{
  "question": "What is Flutter?",
  "context": "Flutter is Google's UI framework for building..."
}
```

**Response:**
```json
{
  "answer": "Flutter is a UI framework by Google...",
  "confidence": 0.95
}
```

---

## 2. Integration Architecture

### 2.1 Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              JinaSearchService                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Public Methods (Riverpod Providers)                 │  │
│  │                                                      │  │
│  │ • search(query) → Future<SearchResults>            │  │
│  │ • fetchContent(url) → Future<String>               │  │
│  │ • answerQuestion(q, context) → Future<String>      │  │
│  │ • getSearchMetrics() → SearchMetrics               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Internal Methods                                      │  │
│  │                                                      │  │
│  │ • _validateApiKey()                                 │  │
│  │ • _makeRequest()                                    │  │
│  │ • _parseResponse()                                  │  │
│  │ • _handleRateLimiting()                             │  │
│  │ • _cacheResult()                                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┼───────────┐
                │           │           │
                ▼           ▼           ▼
            ┌────────┐ ┌────────┐ ┌──────────┐
            │ Jina   │ │ Local  │ │ Riverpod │
            │ API    │ │Cache   │ │Providers │
            │        │ │(SQLite)│ │          │
            └────────┘ └────────┘ └──────────┘
```

### 2.2 Implementation Flow

**Search Request Flow:**
```
User asks question needing web search
         │
         ▼
ChatService detects tool needed
         │
         ▼
Send tool call to Ollama
         │
         ▼
Model decides to use web_search tool
         │
         ▼
Extract search query from model
         │
         ▼
Call JinaSearchService.search(query)
         │
         ├─ Check local cache
         │  (if < 24h old, return cached)
         │
         ├─ If not cached:
         │  ├─ Validate API key
         │  ├─ Make HTTPS request to api.jina.ai
         │  ├─ Parse JSON response
         │  ├─ Save to cache
         │  └─ Return results
         │
         ▼
Format results as tool_response
         │
         ▼
Send back to Ollama with context
         │
         ▼
Model generates final response using search results
         │
         ▼
Display to user with tool badge
```

### 2.3 Dart Service Implementation

```dart
/// Service for Jina API integration
class JinaSearchService {
  static const String _baseUrl = 'https://api.jina.ai';
  static const String _readerUrl = 'https://r.jina.ai';
  
  final String apiKey;
  final http.Client httpClient;
  final SearchCacheRepository cacheRepository;
  
  // Rate limiting tracking
  final _requestCount = <DateTime>[];
  static const _rateLimitPerMinute = 100;
  
  JinaSearchService({
    required this.apiKey,
    required this.cacheRepository,
    http.Client? httpClient,
  }) : httpClient = httpClient ?? http.Client();
  
  /// Perform web search using Jina API
  /// 
  /// Parameters:
  /// - query: Search query string
  /// - limit: Number of results (1-50, default 10)
  /// - lang: Language code (default "en")
  /// - fresh: Freshness filter ("d", "w", "m", or null)
  /// 
  /// Returns: SearchResults with title, URL, snippet for each result
  /// 
  /// Throws: JinaException on API errors
  Future<SearchResults> search(
    String query, {
    int limit = 10,
    String lang = 'en',
    String? fresh,
  }) async {
    // Validate inputs
    if (query.isEmpty) {
      throw ArgumentError('Search query cannot be empty');
    }
    if (limit < 1 || limit > 50) {
      throw ArgumentError('Limit must be between 1 and 50');
    }
    
    // Check cache first
    final cacheKey = _getCacheKey(query, lang, fresh);
    final cached = await cacheRepository.getSearchResults(cacheKey);
    
    if (cached != null && !cached.isExpired) {
      return cached.results;
    }
    
    // Check rate limiting
    await _checkRateLimit();
    
    // Build request
    final uri = Uri.parse('$_baseUrl/search').replace(
      queryParameters: {
        'q': query,
        'limit': limit.toString(),
        'lang': lang,
        if (fresh != null) 'fresh': fresh,
      },
    );
    
    final request = http.Request('GET', uri);
    request.headers['Authorization'] = 'Bearer $apiKey';
    request.headers['User-Agent'] = 'PrivateChatHub/1.0';
    
    try {
      // Make request with timeout
      final response = await httpClient.send(request).timeout(
        const Duration(seconds: 30),
        onTimeout: () => throw JinaException(
          'Request timeout after 30 seconds',
          statusCode: -1,
        ),
      );
      
      // Handle status codes
      if (response.statusCode == 401) {
        throw JinaException('Invalid API key', statusCode: 401);
      }
      if (response.statusCode == 429) {
        throw JinaException('Rate limit exceeded', statusCode: 429);
      }
      if (response.statusCode != 200) {
        throw JinaException(
          'HTTP ${response.statusCode}: ${response.reasonPhrase}',
          statusCode: response.statusCode,
        );
      }
      
      // Parse response
      final body = await response.stream.bytesToString();
      final json = jsonDecode(body) as Map<String, dynamic>;
      
      final results = _parseSearchResponse(json);
      
      // Cache results
      await cacheRepository.cacheSearchResults(
        cacheKey,
        results,
        expiryDuration: const Duration(hours: 24),
      );
      
      return results;
      
    } on JinaException {
      rethrow;
    } catch (e) {
      throw JinaException('Unexpected error: $e');
    }
  }
  
  /// Fetch and parse webpage content
  /// 
  /// Uses Jina Reader to fetch content from any URL
  /// and convert to clean Markdown
  /// 
  /// Parameters:
  /// - url: URL to fetch
  /// 
  /// Returns: Markdown-formatted content
  Future<String> fetchContent(String url) async {
    if (url.isEmpty || !url.startsWith('http')) {
      throw ArgumentError('Valid URL required');
    }
    
    try {
      final uri = Uri.parse('$_readerUrl/$url');
      
      final response = await httpClient.get(uri).timeout(
        const Duration(seconds: 30),
        onTimeout: () => throw JinaException(
          'Fetch timeout after 30 seconds',
          statusCode: -1,
        ),
      );
      
      if (response.statusCode != 200) {
        throw JinaException(
          'Failed to fetch URL (HTTP ${response.statusCode})',
          statusCode: response.statusCode,
        );
      }
      
      // Jina Reader returns Markdown
      return response.body;
      
    } catch (e) {
      throw JinaException('Failed to fetch content: $e');
    }
  }
  
  /// Answer a question given context
  /// Uses Jina Q&A API for better accuracy
  Future<String> answerQuestion(
    String question,
    String context, {
    int maxTokens = 500,
  }) async {
    if (question.isEmpty || context.isEmpty) {
      throw ArgumentError('Question and context required');
    }
    
    await _checkRateLimit();
    
    try {
      final response = await httpClient.post(
        Uri.parse('$_baseUrl/qa'),
        headers: {
          'Authorization': 'Bearer $apiKey',
          'Content-Type': 'application/json',
          'User-Agent': 'PrivateChatHub/1.0',
        },
        body: jsonEncode({
          'question': question,
          'context': context,
          'max_tokens': maxTokens,
        }),
      ).timeout(
        const Duration(seconds: 30),
        onTimeout: () => throw JinaException(
          'Q&A request timeout',
          statusCode: -1,
        ),
      );
      
      if (response.statusCode != 200) {
        throw JinaException(
          'Q&A API error (HTTP ${response.statusCode})',
          statusCode: response.statusCode,
        );
      }
      
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      return json['answer'] as String? ?? '';
      
    } catch (e) {
      throw JinaException('Q&A failed: $e');
    }
  }
  
  // Private helpers
  
  Future<void> _checkRateLimit() async {
    final now = DateTime.now();
    final oneMinuteAgo = now.subtract(const Duration(minutes: 1));
    
    // Remove old requests outside window
    _requestCount.removeWhere((t) => t.isBefore(oneMinuteAgo));
    
    if (_requestCount.length >= _rateLimitPerMinute) {
      throw JinaException(
        'Rate limit reached (${_rateLimitPerMinute} per minute)',
        statusCode: 429,
      );
    }
    
    _requestCount.add(now);
  }
  
  String _getCacheKey(String query, String lang, String? fresh) {
    return '${query}_${lang}_${fresh ?? 'all'}';
  }
  
  SearchResults _parseSearchResponse(Map<String, dynamic> json) {
    final dataList = json['data'] as List? ?? [];
    final searchTime = (json['searchTime'] as num?)?.toDouble() ?? 0.0;
    final normalizedResults = json['normalizedResults'] as int? ?? 0;
    
    final results = dataList.map<SearchResult>((item) {
      final map = item as Map<String, dynamic>;
      return SearchResult.fromJson(map);
    }).toList();
    
    return SearchResults(
      results: results,
      totalResults: normalizedResults,
      executionTime: Duration(
        milliseconds: (searchTime * 1000).toInt(),
      ),
    );
  }
}

/// Result models
class SearchResult {
  final String title;
  final String url;
  final String snippet;
  final String? favicon;
  
  SearchResult({
    required this.title,
    required this.url,
    required this.snippet,
    this.favicon,
  });
  
  factory SearchResult.fromJson(Map<String, dynamic> json) {
    return SearchResult(
      title: json['title'] as String? ?? 'Untitled',
      url: json['url'] as String? ?? '',
      snippet: json['snippet'] as String? ?? 
               json['description'] as String? ?? '',
      favicon: json['favicon'] as String?,
    );
  }
  
  Map<String, dynamic> toJson() => {
    'title': title,
    'url': url,
    'snippet': snippet,
    'favicon': favicon,
  };
}

class SearchResults {
  final List<SearchResult> results;
  final int totalResults;
  final Duration executionTime;
  
  SearchResults({
    required this.results,
    required this.totalResults,
    required this.executionTime,
  });
  
  int get count => results.length;
  
  /// Format results for tool response
  String toToolResponse() {
    if (results.isEmpty) {
      return 'No results found.';
    }
    
    final buffer = StringBuffer('Found ${results.length} results:\n\n');
    
    for (int i = 0; i < results.length; i++) {
      final result = results[i];
      buffer.write('${i + 1}. **${result.title}**\n');
      buffer.write('   URL: ${result.url}\n');
      buffer.write('   ${result.snippet}\n\n');
    }
    
    return buffer.toString();
  }
}

class JinaException implements Exception {
  final String message;
  final int statusCode;
  
  JinaException(this.message, {required this.statusCode});
  
  @override
  String toString() => 'JinaException: $message (HTTP $statusCode)';
}
```

---

## 3. Implementation Details

### 3.1 Tool Configuration

**User configures Jina in Settings:**

```dart
class ToolConfig {
  String? jinaApiKey;
  bool webSearchEnabled = true;
  int webSearchResultLimit = 10;
  String searchLanguage = 'en';
  bool cacheSearchResults = true;
  Duration cacheExpiry = const Duration(hours: 24);
  
  // Statistics
  int totalSearchesMade = 0;
  DateTime? lastSearchTime;
  
  Map<String, dynamic> toJson() => {
    'jinaApiKey': jinaApiKey,
    'webSearchEnabled': webSearchEnabled,
    'webSearchResultLimit': webSearchResultLimit,
    'searchLanguage': searchLanguage,
    'cacheSearchResults': cacheSearchResults,
    'cacheExpiryHours': cacheExpiry.inHours,
    'totalSearchesMade': totalSearchesMade,
    'lastSearchTime': lastSearchTime?.toIso8601String(),
  };
  
  factory ToolConfig.fromJson(Map<String, dynamic> json) {
    return ToolConfig()
      ..jinaApiKey = json['jinaApiKey']
      ..webSearchEnabled = json['webSearchEnabled'] ?? true
      ..webSearchResultLimit = json['webSearchResultLimit'] ?? 10
      ..searchLanguage = json['searchLanguage'] ?? 'en'
      ..cacheSearchResults = json['cacheSearchResults'] ?? true
      ..cacheExpiry = Duration(hours: json['cacheExpiryHours'] ?? 24)
      ..totalSearchesMade = json['totalSearchesMade'] ?? 0
      ..lastSearchTime = json['lastSearchTime'] != null
          ? DateTime.parse(json['lastSearchTime'])
          : null;
  }
}
```

### 3.2 Tool Registration with Ollama

**Register web search as available tool:**

```dart
/// Web search tool definition (Ollama format)
final webSearchToolDefinition = {
  'type': 'function',
  'function': {
    'name': 'web_search',
    'description': 'Search the web for current information and facts',
    'parameters': {
      'type': 'object',
      'properties': {
        'query': {
          'type': 'string',
          'description': 'The search query'
        },
        'limit': {
          'type': 'integer',
          'description': 'Maximum number of results (1-50)',
          'default': 10
        },
        'fresh': {
          'type': 'string',
          'enum': ['d', 'w', 'm', null],
          'description': 'Freshness: day (d), week (w), month (m)'
        }
      },
      'required': ['query']
    }
  }
};

// When sending message to Ollama with tools enabled:
final tools = modelSupportsTools ? [webSearchToolDefinition] : null;
await _ollama.sendChatStream(
  model: selectedModel,
  messages: messages,
  tools: tools,
  stream: true,
);
```

### 3.3 Tool Result Processing

**Handle Ollama tool calls:**

```dart
/// Process Ollama response that includes tool_calls
void _processToolCalls(Map<String, dynamic> response) {
  final toolCalls = response['tool_calls'] as List?;
  
  if (toolCalls == null || toolCalls.isEmpty) {
    // No tool calls, just response
    return;
  }
  
  for (final toolCall in toolCalls) {
    final name = toolCall['name'] as String?;
    final arguments = toolCall['arguments'] as Map?;
    
    if (name == 'web_search') {
      final query = arguments?['query'] as String?;
      final limit = arguments?['limit'] as int? ?? 10;
      
      // Execute tool
      _executeWebSearch(query ?? '', limit);
    }
  }
}

Future<void> _executeWebSearch(String query, int limit) async {
  try {
    final results = await _jinaService.search(
      query,
      limit: limit,
    );
    
    // Save tool invocation
    final invocation = ToolInvocation(
      toolName: 'web_search',
      arguments: {'query': query, 'limit': limit},
    );
    
    // Save tool result
    final result = ToolResult(
      toolInvocationId: invocation.id,
      toolName: 'web_search',
      result: results.toToolResponse(),
      executionTime: results.executionTime,
      success: true,
    );
    
    // Add to conversation context for next model call
    _addToolResultToContext(invocation, result);
    
    // Continue conversation with search results
    _continueWithToolResults([result]);
    
  } catch (e) {
    // Handle error
    _handleToolError('web_search', e);
  }
}
```

---

## 4. Error Handling & Reliability

### 4.1 Error Scenarios

```dart
enum JinaErrorType {
  invalidApiKey,
  rateLimitExceeded,
  networkError,
  timeout,
  invalidQuery,
  serverError,
  unknown,
}

class JinaErrorHandler {
  static JinaErrorType categorizeError(dynamic error) {
    if (error is JinaException) {
      switch (error.statusCode) {
        case 401:
          return JinaErrorType.invalidApiKey;
        case 429:
          return JinaErrorType.rateLimitExceeded;
        case 500:
        case 502:
        case 503:
          return JinaErrorType.serverError;
        default:
          return JinaErrorType.unknown;
      }
    }
    
    if (error is SocketException) {
      return JinaErrorType.networkError;
    }
    
    if (error is TimeoutException) {
      return JinaErrorType.timeout;
    }
    
    return JinaErrorType.unknown;
  }
  
  static String getUserMessage(JinaErrorType type) {
    return switch (type) {
      JinaErrorType.invalidApiKey =>
        'Web search API key is invalid. Check Settings → Tools.',
      JinaErrorType.rateLimitExceeded =>
        'Too many searches. Please wait a moment.',
      JinaErrorType.networkError =>
        'Network error. Check your internet connection.',
      JinaErrorType.timeout =>
        'Web search took too long. Try a simpler query.',
      JinaErrorType.invalidQuery =>
        'Invalid search query.',
      JinaErrorType.serverError =>
        'Jina service is temporarily unavailable.',
      JinaErrorType.unknown =>
        'Web search failed. Try again later.',
    };
  }
  
  static Future<void> handleError(dynamic error) async {
    final type = categorizeError(error);
    final message = getUserMessage(type);
    
    // Log error
    print('Jina Error: $message');
    
    // Show user notification
    // (in UI layer)
  }
}
```

### 4.2 Retry Strategy

```dart
/// Retry logic with exponential backoff
Future<T> _retryWithBackoff<T>(
  Future<T> Function() operation, {
  int maxAttempts = 3,
}) async {
  int attempt = 0;
  Duration backoff = const Duration(seconds: 1);
  
  while (attempt < maxAttempts) {
    try {
      return await operation();
    } catch (e) {
      attempt++;
      
      if (attempt >= maxAttempts) {
        rethrow;
      }
      
      // Don't retry on invalid API key
      if (e is JinaException && e.statusCode == 401) {
        rethrow;
      }
      
      // Wait before retry
      await Future.delayed(backoff);
      backoff *= 2;
    }
  }
  
  throw Exception('Max retries exceeded');
}

// Usage:
final results = await _retryWithBackoff(
  () => jinaService.search(query),
  maxAttempts: 3,
);
```

---

## 5. Performance Optimization

### 5.1 Caching Strategy

**Cache search results locally:**

```dart
class SearchCacheRepository {
  final Database database;
  
  /// Cache search results for 24 hours
  Future<void> cacheSearchResults(
    String key,
    SearchResults results, {
    Duration expiryDuration = const Duration(hours: 24),
  }) async {
    final expiresAt = DateTime.now().add(expiryDuration).millisecondsSinceEpoch;
    
    await database.insert(
      'web_search_cache',
      {
        'query': key,
        'results': jsonEncode(results.results.map((r) => r.toJson()).toList()),
        'cached_at': DateTime.now().millisecondsSinceEpoch,
        'expires_at': expiresAt,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }
  
  /// Get cached results if not expired
  Future<SearchResults?> getSearchResults(String key) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    
    final result = await database.query(
      'web_search_cache',
      where: 'query = ? AND expires_at > ?',
      whereArgs: [key, now],
      limit: 1,
    );
    
    if (result.isEmpty) return null;
    
    final row = result.first;
    final resultsJson = jsonDecode(row['results'] as String) as List;
    
    return SearchResults(
      results: resultsJson
          .map((r) => SearchResult.fromJson(r))
          .toList(),
      totalResults: resultsJson.length,
      executionTime: Duration.zero, // Cached
    );
  }
  
  /// Clear expired cache entries
  Future<void> clearExpiredCache() async {
    final now = DateTime.now().millisecondsSinceEpoch;
    
    await database.delete(
      'web_search_cache',
      where: 'expires_at <= ?',
      whereArgs: [now],
    );
  }
}
```

### 5.2 Request Batching

**Batch multiple search requests:**

```dart
class JinaSearchBatcher {
  final JinaSearchService jinaService;
  final _batch = <String, Future<SearchResults>>{};
  
  /// Deduplicate search requests
  Future<SearchResults> search(String query) {
    if (_batch.containsKey(query)) {
      return _batch[query]!;
    }
    
    final future = jinaService.search(query);
    _batch[query] = future;
    
    future.then((_) {
      _batch.remove(query);
    });
    
    return future;
  }
}
```

---

## 6. Security Considerations

### 6.1 API Key Management

**Store API key securely:**

```dart
class SecureApiKeyStorage {
  final FlutterSecureStorage _storage;
  
  static const String _jinaKeyKey = 'jina_api_key';
  
  /// Save API key to secure storage
  Future<void> saveJinaApiKey(String apiKey) async {
    // Validate format before saving
    if (!apiKey.startsWith('jina_')) {
      throw ArgumentError('Invalid Jina API key format');
    }
    
    await _storage.write(
      key: _jinaKeyKey,
      value: apiKey,
    );
  }
  
  /// Retrieve API key
  Future<String?> getJinaApiKey() async {
    return _storage.read(key: _jinaKeyKey);
  }
  
  /// Delete API key
  Future<void> clearJinaApiKey() async {
    await _storage.delete(key: _jinaKeyKey);
  }
}
```

### 6.2 Input Validation

**Validate search queries:**

```dart
class QueryValidator {
  static bool isValid(String query) {
    // Check length
    if (query.isEmpty || query.length > 1000) return false;
    
    // Check for malicious patterns
    final suspiciousPatterns = [
      RegExp(r'<script'),
      RegExp(r'javascript:'),
      RegExp(r'eval\('),
    ];
    
    for (final pattern in suspiciousPatterns) {
      if (pattern.hasMatch(query)) return false;
    }
    
    return true;
  }
  
  static String sanitize(String query) {
    return query
        .replaceAll(RegExp(r'<[^>]*>'), '') // Remove HTML tags
        .trim();
  }
}
```

### 6.3 HTTPS Only

**Enforce HTTPS for API calls:**

```dart
// All Jina endpoints use HTTPS:
// - https://api.jina.ai
// - https://r.jina.ai

// Verify certificate pinning (optional, for extra security):
final client = http.Client();
// Configure certificate pinning if needed
```

---

## 7. Cost & Quota Management

### 7.1 Pricing Model

**Jina Free Plan:**
- Search: 100 requests/month
- Reader: 1,000 requests/month
- Q&A: 100 requests/month

**Jina Pro Plan:**
- Search: $9.99/month for 10,000 requests
- Reader: Unlimited
- Q&A: $19.99/month for 100,000 requests

### 7.2 Quota Tracking

```dart
class JinaQuotaManager {
  final SettingsRepository settingsRepository;
  
  /// Track searches made this month
  Future<void> recordSearch() async {
    final config = await _getToolConfig();
    config.totalSearchesMade++;
    config.lastSearchTime = DateTime.now();
    await settingsRepository.saveToolConfig(config);
  }
  
  /// Get remaining quota
  Future<int> getRemainingQuota() async {
    // For free plan: 100/month
    final monthStart = DateTime(
      DateTime.now().year,
      DateTime.now().month,
    );
    
    final config = await _getToolConfig();
    final searchesThisMonth = 0; // Query from database
    
    return 100 - searchesThisMonth;
  }
  
  /// Show warning if quota low
  Future<void> checkQuotaAndWarn() async {
    final remaining = await getRemainingQuota();
    
    if (remaining < 5) {
      // Show warning to user
      // "Only X searches remaining this month"
    }
  }
}
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

```dart
test('jina_search_service', () {
  group('JinaSearchService', () {
    late JinaSearchService service;
    late MockHttpClient mockHttp;
    
    setUp(() {
      mockHttp = MockHttpClient();
      service = JinaSearchService(
        apiKey: 'jina_test_key',
        httpClient: mockHttp,
        cacheRepository: MockCacheRepository(),
      );
    });
    
    test('parses search results correctly', () async {
      mockHttp.mockResponse = http.StreamedResponse(
        Stream.value(jsonEncode({
          'data': [
            {
              'title': 'Test Title',
              'url': 'https://example.com',
              'snippet': 'Test snippet',
            }
          ],
          'searchTime': 0.5,
          'normalizedResults': 1,
        }).codeUnits),
        200,
      );
      
      final results = await service.search('flutter');
      
      expect(results.count, 1);
      expect(results.results.first.title, 'Test Title');
    });
    
    test('handles rate limit error', () async {
      mockHttp.mockResponse = http.StreamedResponse(
        Stream.value(''.codeUnits),
        429,
      );
      
      expect(
        () => service.search('flutter'),
        throwsA(isA<JinaException>()),
      );
    });
    
    test('handles invalid API key', () async {
      mockHttp.mockResponse = http.StreamedResponse(
        Stream.value(''.codeUnits),
        401,
      );
      
      expect(
        () => service.search('flutter'),
        throwsA(isA<JinaException>()),
      );
    });
    
    test('returns cached results within 24h', () async {
      // Setup cache with fresh results
      
      final results1 = await service.search('flutter');
      final results2 = await service.search('flutter');
      
      // Should return cached without HTTP call
      expect(identical(results1, results2), true);
    });
  });
});
```

### 8.2 Integration Tests

```dart
test('tool_calling_with_search', () {
  group('Web Search Tool Integration', () {
    test('ollama calls web search tool', () async {
      final chatService = ChatService(
        ollama: ollamaService,
        jinaSearch: jinaSearchService,
        storage: storageService,
      );
      
      // Send message that requires search
      final conversation = await chatService.sendMessage(
        conversationId: 'test_conv',
        content: 'What are latest AI developments?',
        modelName: 'llama3.2',
      );
      
      // Verify tool was called
      expect(
        conversation.messages.any((m) => m.toolName == 'web_search'),
        true,
      );
      
      // Verify tool results in context
      expect(
        conversation.messages.any((m) => m.content.contains('Found')),
        true,
      );
    });
  });
});
```

---

## 9. Rollout Plan

### Phase 1: Development (Weeks 1-4)

- [ ] Implement JinaSearchService
- [ ] Add tool configuration UI
- [ ] Integrate with ChatService
- [ ] Add caching layer
- [ ] Unit & integration tests

### Phase 1: Closed Beta (Week 5)

- [ ] Internal testing with small team
- [ ] Gather feedback
- [ ] Fix bugs found in testing
- [ ] Performance optimization

### Phase 1: Open Beta (Weeks 6-8)

- [ ] Release to beta testers
- [ ] Monitor quota usage
- [ ] Collect user feedback
- [ ] Rate limit adjustment if needed

### Phase 1: Production (Weeks 9-10)

- [ ] Final testing pass
- [ ] Release to all users
- [ ] Monitor error rates
- [ ] Provide documentation

---

## Jina Docs References

- **Getting Started:** https://docs.jina.ai/
- **API Reference:** https://docs.jina.ai/api-reference/
- **Search API:** https://docs.jina.ai/api-reference/search-api/
- **Reader API:** https://docs.jina.ai/api-reference/reader-api/
- **Q&A API:** https://docs.jina.ai/api-reference/qa-api/

