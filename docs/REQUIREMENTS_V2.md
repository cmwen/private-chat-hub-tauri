# Product Requirements: Private Chat Hub v2

**Document Version:** 1.0  
**Created:** January 3, 2026  
**Status:** Planning - v2 Requirements  
**Target Release:** Q2-Q3 2026

---

## Document Overview

This document defines functional and non-functional requirements for Private Chat Hub v2 features across all 5 phases.

---

## 🔧 Phase 1: Tool Calling & Web Search

### FR-1.1: Tool Calling Framework

#### FR-1.1.1: Abstract Tool Interface (Must Have)

**Description:** System supports pluggable tool interface for extensible tool support.

**Functional Requirements:**
- Tool defines: name, description, input schema, output schema
- Tool supports required and optional parameters
- Parameter types: string, number, boolean, array, object
- Tool can validate inputs before execution
- Tool execution is async and returns typed result
- Tool errors include error code, message, recovery suggestion
- Tool invocations are atomic (succeed or fail completely)

**Non-Functional Requirements:**
- Tool execution < 100ms overhead
- Schema validation < 50ms
- Support 50+ concurrent tool definitions
- Tool parameter limit: 20 per tool

**Acceptance Criteria:**
- [ ] Tool interface compiles and passes type checking
- [ ] Multiple tool implementations can coexist
- [ ] Tool schema validation works correctly
- [ ] Tool execution handles success and error cases
- [ ] Unit tests cover 100% of tool interface

---

#### FR-1.1.2: Tool Result Standardization (Must Have)

**Description:** All tool results follow consistent format with metadata.

**Data Structure:**
```
ToolResult {
  tool_name: string
  success: boolean
  result_type: string (enum: "text", "json", "file", "error")
  content: any
  metadata: {
    execution_time_ms: number
    invoked_at: timestamp
    cached: boolean
    tool_version: string
  }
  error?: {
    code: string
    message: string
    retry_possible: boolean
  }
}
```

**Requirements:**
- All tools return ToolResult
- Metadata always present
- Errors include recovery suggestions
- Result can be serialized/deserialized
- Support streaming results (partial updates)

**Acceptance Criteria:**
- [ ] All tool implementations return ToolResult
- [ ] Metadata fields populated accurately
- [ ] Error cases tested
- [ ] Serialization round-trip successful

---

#### FR-1.1.3: Tool Invocation Pipeline (Must Have)

**Description:** Consistent pipeline for tool invocation with error handling.

**Pipeline Steps:**
1. **Schema Validation**: Validate input parameters against tool schema
2. **Pre-execution**: Check prerequisites (permissions, resources)
3. **Execution**: Call tool with parameters
4. **Result Processing**: Format and cache result
5. **Post-execution**: Clean up resources

**Requirements:**
- Timeout per tool configurable (default: 30s)
- Rate limiting per tool type
- Logging of all invocations
- Error recovery for transient failures
- Metrics collection (latency, success rate)

**Acceptance Criteria:**
- [ ] Pipeline executes all 5 steps
- [ ] Timeouts enforced
- [ ] Transient errors retried (exponential backoff)
- [ ] Metrics logged for each invocation

---

#### FR-1.1.4: Tool Caching (Should Have)

**Description:** Cache tool results to avoid duplicate calls.

**Requirements:**
- Cache key: hash of tool name + parameters
- TTL: 1 hour default (configurable per tool)
- Cache eviction: LRU when size exceeds limit
- Max cache size: 100MB
- Cache persists across app sessions
- Option to bypass cache per invocation
- Cache hit/miss tracking

**Acceptance Criteria:**
- [ ] Identical calls return cached result
- [ ] Cache respects TTL
- [ ] Cache size managed correctly
- [ ] Performance improvement verified (< 50ms for cache hits)

---

#### FR-1.1.5: Tool Error Handling (Must Have)

**Description:** Robust error handling for tool failures.

**Error Categories:**
| Category | Handling | User Message |
|----------|----------|--------------|
| Network error | Retry with backoff | "Connection failed, retrying..." |
| Timeout | Fail and suggest cancel | "Tool took too long, request cancelled" |
| Invalid parameters | Fail immediately | "Invalid input: [details]" |
| Authorization | Fail with instructions | "API key invalid, check settings" |
| Service unavailable | Retry then fail | "Service temporarily unavailable" |
| Rate limited | Queue and retry | "Rate limited, trying later..." |
| Unknown error | Fail safely | "Tool error: [error code]" |

**Requirements:**
- Maximum 3 retry attempts with exponential backoff
- Total timeout: 30 seconds per tool invocation
- Error logged with full context for debugging
- Model continues conversation if tool fails
- User shown clear, actionable error messages
- Retry option available for transient errors

**Acceptance Criteria:**
- [ ] All error categories handled appropriately
- [ ] Retries succeed when issue is transient
- [ ] User can understand what went wrong
- [ ] Logging sufficient for debugging

---

### FR-1.2: Web Search Tool Implementation

#### FR-1.2.1: Web Search Execution (Must Have)

**Description:** Execute web searches through configured search API.

**Search API Support:**
- Ollama web search (if available)
- SerpAPI as backup option
- DuckDuckGo API
- Fallback: no search available

**Requirements:**
- Search query accepts: string, max 200 characters
- Results include: title, URL, snippet (max 300 chars), domain
- Returns 5-10 results per search
- Search response time: < 3 seconds (p95)
- Handles special characters and operators in query
- Supports language/region parameters
- Results ranked by relevance

**Search Parameters:**
```
WebSearchQuery {
  query: string (1-200 chars)
  num_results: int (1-20, default: 10)
  language: string (optional, e.g., "en", "fr")
  region: string (optional, e.g., "US", "FR")
  safe_search: boolean (default: true)
  time_filter: string (optional: "day", "week", "month", "year")
}
```

**Acceptance Criteria:**
- [ ] Search works with multiple APIs
- [ ] Handles all parameter types
- [ ] Response time < 3s
- [ ] Results formatted consistently
- [ ] Supports pagination/offset
- [ ] Handles no results gracefully

---

#### FR-1.2.2: Search API Configuration (Must Have)

**Description:** Configure and manage web search settings.

**Configuration Parameters:**
```
SearchConfig {
  enabled: boolean (default: true)
  provider: enum ("ollama", "serpapi", "duckduckgo")
  api_key?: string
  safe_search: boolean (default: true)
  num_results: int (default: 10, range: 1-20)
  cache_ttl_minutes: int (default: 60)
  timeout_seconds: int (default: 30)
  rate_limit_per_minute: int (default: 10)
}
```

**Requirements:**
- Configuration stored in secure preferences
- Multiple providers tested on startup
- API key validated before saving
- Config changes effective immediately
- Fallback provider if primary fails
- Usage statistics tracked
- Ability to disable web search globally

**Acceptance Criteria:**
- [ ] Config saved and restored correctly
- [ ] API keys secure (encrypted)
- [ ] Provider fallback works
- [ ] Usage stats accurate
- [ ] Settings UI accessible

---

#### FR-1.2.3: Search Result Rendering (Must Have)

**Description:** Display search results in chat naturally.

**Requirements:**
- Each result shows: title, snippet, domain, link
- Results grouped under "Web Search Results" header
- Each result is clickable (opens URL in browser)
- Snippet shows search term in context (bolded)
- Domain icon or text shown for visual hierarchy
- Results list can be collapsed
- Maximum 10 results shown at once
- "See more results" link for additional searches

**Result Card UI:**
```
┌─ 🔍 Web Search Results (5 results)
├─ ☐ [Title 1]
│  example.com › article
│  Snippet showing context with query highlighted...
├─ ☐ [Title 2]
│  other.org › page
│  Another result snippet...
└─ [See all 10 results]
```

**Acceptance Criteria:**
- [ ] All result components render correctly
- [ ] Links are clickable and functional
- [ ] Layout responsive on all screen sizes
- [ ] Results can be scrolled
- [ ] Proper spacing and typography

---

#### FR-1.2.4: Search Transparency (Should Have)

**Description:** Show users which searches were performed.

**Requirements:**
- Display which tool was invoked
- Show search query used
- Show number of results returned
- Display search execution time
- Option to modify and retry search
- Attribution to search source

**UI Element:**
```
🔍 Web Search
Search for: "latest AI breakthroughs"
Found 5 results in 1.2s
```

**Acceptance Criteria:**
- [ ] Search queries shown to user
- [ ] Execution time displayed
- [ ] Users can refine searches
- [ ] Clear attribution

---

### FR-1.3: Model Integration with Tools

#### FR-1.3.1: Tool Calling in Chat (Must Have)

**Description:** Models can invoke tools during conversation.

**Requirements:**
- Model detects when tool is needed (function calling)
- Tool invocation parameters extracted from model output
- Tool executed and result provided back to model
- Model incorporates tool result in response
- Maximum 3 tool calls per user message
- Tool calling works with all compatible models

**Flow:**
1. User sends message
2. Model responds with tool invocation
3. App extracts tool call from response
4. App executes tool
5. App provides result to model
6. Model generates final response
7. Final response shown to user

**Requirements:**
- Support OpenAI function calling format
- Support Ollama tool calling format
- Handle multiple sequential tool calls
- Tool results passed in context correctly
- Error handling if tool unavailable

**Acceptance Criteria:**
- [ ] Tool calling detected correctly
- [ ] Multiple sequential calls work
- [ ] Tool results properly formatted
- [ ] Model response incorporates results

---

#### FR-1.3.2: Tool Availability per Model (Should Have)

**Description:** Model only sees tools it supports.

**Requirements:**
- Detect model capabilities from Ollama metadata
- Web search available for most models
- Vision models may have additional tools
- Show available tools in model details
- Warn if model doesn't support tool calling
- Graceful fallback if tool unavailable

**Acceptance Criteria:**
- [ ] Model capabilities detected correctly
- [ ] Only compatible tools offered
- [ ] Users informed of limitations
- [ ] Fallback works smoothly

---

### FR-1.4: Non-Functional Requirements for Phase 1

| Requirement | Target | Measurement |
|-------------|--------|------------|
| Tool invocation latency | < 100ms overhead | Benchmark test |
| Search response time | < 3s (p95) | Load test with various queries |
| Cache hit rate | > 80% (for repeated queries) | Analytics |
| Tool success rate | > 95% | Error tracking |
| App responsiveness | < 500ms response to tool result | UI test |
| Memory for tools | < 50MB | Profiling |

---

## 🎯 Phase 2: Model Comparison

### FR-2.1: Parallel Model Requests

#### FR-2.1.1: Multi-Model Message Sending (Must Have)

**Description:** Send same message to multiple models simultaneously.

**Requirements:**
- Select 2-4 models for comparison
- Single message sent to all selected models in parallel
- Requests queued if server capacity limited
- Each request independent (no interference)
- Responses collected and returned together
- Maximum comparison size: 4 models
- Timeout per model: 60 seconds

**Flow:**
1. User selects models to compare (e.g., llama2, mistral, neural-chat)
2. User sends message
3. Message sent to all 4 models in parallel
4. Responses stream back as available
5. All responses shown together to user

**Acceptance Criteria:**
- [ ] All selected models receive message
- [ ] Responses return in reasonable time
- [ ] No interference between models
- [ ] Timeout enforced per model

---

#### FR-2.1.2: Response Aggregation (Must Have)

**Description:** Collect and organize responses from multiple models.

**Requirements:**
- Display responses in consistent order
- Show which response from which model
- Show response time for each model
- Show token count for each response
- All responses part of single conversation entry
- Can navigate between responses easily

**Data Structure:**
```
ComparisonMessage {
  user_message: string
  timestamp: datetime
  responses: [
    {
      model: string
      content: string
      tokens: int
      response_time_ms: int
      generated_at: datetime
    }
  ]
}
```

**Acceptance Criteria:**
- [ ] Responses properly attributed to models
- [ ] Performance metrics collected
- [ ] Navigation between responses smooth
- [ ] Data structure supports future features

---

#### FR-2.1.3: Queue Management for Ollama (Should Have)

**Description:** Smart queuing to avoid overwhelming Ollama server.

**Requirements:**
- Monitor Ollama server load
- Queue comparison requests if server busy
- FIFO queue with priority for single-model requests
- Max concurrent requests: configurable
- User notified if request queued
- Queue position shown if wait expected

**Configuration:**
```
QueueConfig {
  max_concurrent_requests: int (default: 2)
  max_queue_size: int (default: 10)
  request_timeout_seconds: int (default: 60)
  monitor_server_load: boolean (default: true)
}
```

**Acceptance Criteria:**
- [ ] Queue prevents server overload
- [ ] User feedback clear
- [ ] FIFO respected
- [ ] Configurable limits

---

### FR-2.2: Model Performance Metrics

#### FR-2.2.1: Per-Message Metrics (Must Have)

**Description:** Track and display performance metrics for each model response.

**Metrics to Track:**
```
ResponseMetrics {
  model: string
  response_time_total_ms: int
  time_to_first_token_ms: int
  token_count_input: int
  token_count_output: int
  tokens_per_second: float
  timestamp: datetime
  cached: boolean
  tool_calls: int
  quality_rating?: int (1-5, user-provided)
}
```

**Display Requirements:**
- Show metrics below each response
- Detailed metrics view available
- Comparison view highlights fast/slow models
- Metrics sorted by response time default
- User can rate response quality

**Acceptance Criteria:**
- [ ] All metrics collected accurately
- [ ] Metrics displayed clearly
- [ ] User ratings captured
- [ ] Storage efficient

---

#### FR-2.2.2: Aggregate Statistics (Should Have)

**Description:** Collect statistics over time per model.

**Aggregations:**
```
ModelStatistics {
  model: string
  total_messages: int
  avg_response_time_ms: int
  median_response_time_ms: int
  p95_response_time_ms: int
  p99_response_time_ms: int
  avg_tokens_per_message: int
  total_tokens_used: int
  estimated_token_cost: float
  quality_avg_rating: float (1-5)
  tool_call_frequency: float
  date_range: {start_date, end_date}
}
```

**Requirements:**
- Aggregations updated after each message
- Stats dashboard shows top 3 metrics
- Breakdown by date range available
- Export stats as CSV
- Statistics stored locally (privacy)

**Acceptance Criteria:**
- [ ] Stats calculated correctly
- [ ] Dashboard displays well
- [ ] Export functionality works
- [ ] Data persisted correctly

---

### FR-2.3: Model Comparison UI

#### FR-2.3.1: Comparison Mode Toggle (Must Have)

**Description:** Easy switching between single and multi-model chat.

**Requirements:**
- Model selector shows "Compare Models" option
- Selecting comparison mode shows model picker
- Can select/deselect models
- Minimum 2, maximum 4 models
- Selection persists for conversation
- Can change models mid-conversation
- Clear visual indication of comparison mode

**UI Flow:**
1. Chat screen, model selector
2. "Compare Models" option selected
3. Dialog with model checkboxes
4. User selects 2-4 models
5. Chat continues in comparison mode
6. Each message shows all responses

**Acceptance Criteria:**
- [ ] UI clear and accessible
- [ ] Model selection working
- [ ] Comparison persists
- [ ] Can change modes

---

#### FR-2.3.2: Side-by-Side Display (Should Have)

**Description:** Display multiple responses side-by-side for easy comparison.

**Requirements:**
- For 2 models: true side-by-side
- For 3-4 models: grid or tabs
- Responses at same scroll position
- Synchronized scrolling optional
- Can focus on single response
- Can collapse/expand responses
- Visual separation clear

**Layout Options:**
- 2 models: 50/50 split
- 3 models: 33% each (row)
- 4 models: 2x2 grid
- Mobile: tabs or swipe

**Acceptance Criteria:**
- [ ] Layout responsive
- [ ] Text readable at all sizes
- [ ] Navigation smooth
- [ ] Performance good with large responses

---

#### FR-2.3.3: Tabbed Response View (Should Have)

**Description:** Tab-based view for comparing responses.

**Requirements:**
- Tab for each model response
- Active tab highlighted
- Tab shows model name and response time
- Quick switching between tabs
- Metrics shown in tab header
- Smooth animation on tab switch

**Tab Header:**
```
[llama2 (2.3s, 450 tokens)] [mistral (1.8s, 380 tokens)] [neural-chat (2.1s, 420 tokens)]
```

**Acceptance Criteria:**
- [ ] Tabs render correctly
- [ ] Switching smooth
- [ ] All info visible

---

### FR-2.4: Non-Functional Requirements for Phase 2

| Requirement | Target | Measurement |
|-------------|--------|------------|
| Parallel request latency | < 10% overhead | Benchmark |
| Comparison response time | < 60s (p95) | Load test |
| Queue wait time | < 30s typical | Monitoring |
| Metrics accuracy | 100% | Validation |
| Memory per comparison | < 100MB | Profiling |
| UI responsiveness | < 500ms | Interaction test |

---

## 📱 Phase 3: Native Android Integration

### FR-3.1: Share Intent (Receive)

#### FR-3.1.1: Text Share Intent (Must Have)

**Description:** Receive text from other Android apps.

**Technical Requirements:**
- Register `android.intent.action.SEND` with `text/plain`
- Handle `EXTRA_TEXT` from intent
- App appears in share menu of all apps
- Works when app is running or not running
- Startup performance not impacted

**AndroidManifest.xml:**
```xml
<activity android:name=".MainActivity">
  <intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="text/plain" />
  </intent-filter>
</activity>
```

**Behavior:**
- Shared text populates chat input
- Text ready to edit before sending
- App navigates to chat screen
- Text remains if user cancels

**Acceptance Criteria:**
- [ ] App appears in share menu
- [ ] Text correctly extracted
- [ ] App handles missing input gracefully
- [ ] Works when app backgrounded

---

#### FR-3.1.2: Image Share Intent (Must Have)

**Description:** Receive images from gallery and other apps.

**Technical Requirements:**
- Register `android.intent.action.SEND` with `image/*`
- Register `android.intent.action.SEND_MULTIPLE` for multiple images
- Handle `EXTRA_STREAM` intent extra
- Support ContentUri and file:// URIs
- Maximum 5 images per share
- File size validation (max 20MB each)

**AndroidManifest.xml:**
```xml
<activity android:name=".MainActivity">
  <intent-filter>
    <action android:name="android.intent.action.SEND" />
    <action android:name="android.intent.action.SEND_MULTIPLE" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="image/*" />
  </intent-filter>
</activity>
```

**Image Handling:**
- Copy images to app cache
- Generate thumbnails
- Show preview in chat input
- Compress if necessary for Ollama
- Support formats: JPEG, PNG, WebP

**Acceptance Criteria:**
- [ ] Images received and stored
- [ ] Multiple images supported
- [ ] Size limits enforced
- [ ] Preview shown accurately

---

#### FR-3.1.3: Intent Error Handling (Should Have)

**Description:** Handle intent parsing errors gracefully.

**Error Cases:**
- Missing or invalid content
- Unsupported MIME type
- File access permissions denied
- File not found or moved
- Corrupted image file
- Exceeded file size limit

**User Experience:**
- Clear error toast messages
- Suggest actions to fix issue
- Don't crash or close app
- Offer manual entry as fallback

**Acceptance Criteria:**
- [ ] No crashes from invalid intents
- [ ] User informed of issues
- [ ] Fallback options available

---

### FR-3.2: Share Intent (Send)

#### FR-3.2.1: Share Message (Must Have)

**Description:** Share individual messages or conversations to other apps.

**Share Options:**
- Share single message
- Share conversation (with/without metadata)
- Format selection (plain text, markdown)
- Copy to clipboard
- Save as file

**Requirements:**
- Include sender (User/Model name)
- Include timestamp (optional)
- Preserve formatting in markdown
- Links are actual URLs
- Code blocks properly formatted
- Works with all Android share targets

**Share Sheet:**
```
┌─ Share Message
├─ Share to: [android choose dialog]
├─ Format: [Plain Text / Markdown / HTML]
├─ Include: [Timestamp] [Model Name]
└─ [Share] [Cancel]
```

**Formats Generated:**
- **Plain Text:** Clean text without formatting
- **Markdown:** Full markdown with code blocks
- **HTML:** Rich HTML for email/docs

**Acceptance Criteria:**
- [ ] All formats work correctly
- [ ] Links clickable in destinations
- [ ] Formatting preserved
- [ ] Works with all share targets

---

#### FR-3.2.2: Share Conversation (Should Have)

**Description:** Share entire conversation or thread.

**Requirements:**
- Export full conversation
- Export specific message range
- Include or exclude metadata
- Metadata: timestamps, model names, tokens
- Format options: text, markdown, HTML
- Option to save as file (.txt, .md, .html)

**Export Contents:**
```
# Private Chat Hub Conversation Export
Exported: 2026-01-03 14:22:45
Project: Research
Models: llama2, mistral

---

**User:** What is quantum computing?
*Generated by: llama2 | 2026-01-03 14:20:12*

Quantum computing harnesses...
```

**Acceptance Criteria:**
- [ ] Export complete and accurate
- [ ] All formats work
- [ ] File saving works
- [ ] Metadata optional and clear

---

#### FR-3.2.3: Share with Social Apps (Should Have)

**Description:** One-click sharing to WhatsApp, Telegram, etc.

**Requirements:**
- Direct sharing to popular messaging apps
- Message formatted nicely
- Image previews included
- Works offline (prepares share, waits for sync)
- Share shortcuts in message menu

**Supported Apps:**
- WhatsApp, Telegram, Signal
- Email, Gmail
- Notes, OneNote
- Google Drive, Dropbox

**Acceptance Criteria:**
- [ ] Shortcuts appear for installed apps
- [ ] Messages format correctly
- [ ] Sharing works smoothly

---

### FR-3.3: Text-to-Speech

#### FR-3.3.1: TTS Playback (Must Have)

**Description:** Play AI responses using system text-to-speech.

**Requirements:**
- Play button on each AI message
- High-quality audio (Android MediaPlayer)
- Playback controls: pause, resume, stop
- Progress slider
- Works with all response lengths
- Works with network connection (doesn't require offline TTS)
- Continues if app backgrounded

**Audio Implementation:**
- Use Android TextToSpeech API
- System voices (user-selectable)
- Queue TTS if not ready
- Show progress during TTS generation
- Handle TTS initialization errors

**UI Controls:**
```
┌─ AI Response Text...
├─ [▶ Speak] [⏸ Pause] [⏹ Stop]
├─ Progress: [===========   ] 65%
└─ Voice: System Default | Speed: 1.0x
```

**Playback States:**
- Ready (show play button)
- Generating (show spinner)
- Playing (show pause button)
- Paused (show resume button)
- Completed (show replay button)
- Error (show error message)

**Acceptance Criteria:**
- [ ] TTS initializes correctly
- [ ] Playback smooth and clear
- [ ] Controls responsive
- [ ] Works in background
- [ ] Handles errors gracefully

---

#### FR-3.3.2: TTS Speed & Voice Control (Should Have)

**Description:** Customize TTS voice and playback speed.

**Configuration:**
- Voice selection (system available voices)
- Speed adjustment (0.8x - 2.0x, default 1.0x)
- Pitch adjustment (0.5 - 2.0, if supported)
- Language selection

**Requirements:**
- Settings saved and persisted
- Quick controls accessible in chat
- Preview button to test voice
- Show available system voices
- Graceful fallback if voice unavailable

**Voice Settings UI:**
```
Text-to-Speech Settings
├─ Enable TTS: [toggle]
├─ Voice: [Dropdown - System Default]
├─ Speed: [Slider 0.8x to 2.0x]
├─ Pitch: [Slider 0.5 to 2.0]
└─ [Preview]
```

**Acceptance Criteria:**
- [ ] Settings persisted
- [ ] Speed/pitch controls work
- [ ] Preview functionality works
- [ ] Fallback for unavailable voices

---

#### FR-3.3.3: Streaming TTS (Could Have)

**Description:** Play TTS while response is still being generated.

**Requirements:**
- TTS starts playing before response complete
- No noticeable lag between generation and playback
- Handle text arriving out of order
- Smooth streaming without gaps
- Stop/pause works at any time

**Implementation:**
- Queue text chunks as they arrive
- Pre-process for TTS
- Buffer management
- Handle streaming interruption

**Acceptance Criteria:**
- [ ] Streaming works without major delays
- [ ] Quality maintained
- [ ] No stuttering or gaps
- [ ] Works reliably

---

#### FR-3.3.4: TTS Notification (Should Have)

**Description:** Audio control for TTS in system notification.

**Requirements:**
- When TTS playing, notification shows in status bar
- Notification shows current message preview
- Controls: pause, resume, stop
- Tapping notification focuses app
- Works with lock screen

**Acceptance Criteria:**
- [ ] Notification appears when playing
- [ ] Controls work from notification
- [ ] Lock screen integration works

---

### FR-3.4: Clipboard Integration

#### FR-3.4.1: Clipboard Share/Paste (Could Have)

**Description:** Quick copy/paste for prompts and results.

**Requirements:**
- Copy message to clipboard
- Copy formatted (with headers)
- Paste from clipboard into chat (if text)
- Visual feedback for copy action
- Toast confirming copy
- Support both system clipboard and app clipboard

**Shortcuts:**
- Long-press message → Copy
- Long-press chat input → Paste
- Keyboard shortcut Ctrl+C (desktop)

**Acceptance Criteria:**
- [ ] Copy/paste works correctly
- [ ] User feedback clear
- [ ] Both formats supported

---

### FR-3.5: Non-Functional Requirements for Phase 3

| Requirement | Target | Measurement |
|-------------|--------|------------|
| Intent handling latency | < 500ms | Timing test |
| TTS startup | < 1s first time | Profiling |
| TTS latency | < 100ms after init | Benchmark |
| Share sheet open time | < 1s | UI test |
| Memory with TTS | < 50MB | Profiling |
| Battery usage (TTS 1hr) | < 5% | Battery test |

---

## ⏱️ Phase 4: Thinking Models & Long-Running Tasks

### FR-4.1: Thinking Model Support

#### FR-4.1.1: Detect Thinking Capability (Must Have)

**Description:** Identify models that support extended reasoning.

**Requirements:**
- Query Ollama for model capabilities
- Identify thinking/reasoning models
- Cache capability info
- Show capability in model list
- Update when new models available

**Model Metadata:**
```
{
  name: string
  capabilities: [
    "chat",
    "vision",
    "thinking",
    "function_calling"
  ]
}
```

**Acceptance Criteria:**
- [ ] Capabilities detected correctly
- [ ] Cache updated properly
- [ ] UI reflects capabilities

---

#### FR-4.1.2: Thinking Mode Toggle (Should Have)

**Description:** Allow user to enable thinking for compatible models.

**Requirements:**
- Toggle appears only for thinking models
- Can enable/disable per message
- Setting persists for conversation
- Clear explanation of what thinking does
- Show thinking budget/time estimate

**UI:**
```
Chat Input with Settings:
├─ Model: [llama2-think v ▼]
├─ [ ] Enable thinking
├─ Thinking budget: [5 seconds dropdown]
└─ Input: [text field]
```

**Acceptance Criteria:**
- [ ] Toggle visible for thinking models only
- [ ] Setting saved correctly
- [ ] Budget respected

---

#### FR-4.1.3: Thinking Display (Must Have)

**Description:** Show reasoning/thinking process to user.

**Requirements:**
- Expandable "Show thinking" section
- Thinking steps or blocks clearly formatted
- Can be collapsed to show final answer only
- Token count shown separately
- Thinking clearly distinguished from answer
- Markdown in thinking rendered properly

**Display Format:**
```
🤔 Thinking Process (expanded)
├─ First, let me understand the question...
├─ The problem requires analyzing...
└─ Therefore, the approach is...

💬 Response
The answer to your question is...
```

**Acceptance Criteria:**
- [ ] Thinking visible when expanded
- [ ] Can collapse thinking
- [ ] Token counting correct
- [ ] Markdown rendered properly

---

#### FR-4.1.4: Thinking Token Counting (Should Have)

**Description:** Accurately count and display thinking tokens.

**Requirements:**
- Input tokens counted
- Thinking tokens counted separately
- Output tokens counted
- Total tokens shown
- Cost estimation includes thinking
- Breakdown shown in metrics

**Token Display:**
```
Tokens Used:
├─ Input: 150
├─ Thinking: 2,450 (thinking takes more tokens!)
├─ Output: 320
└─ Total: 2,920
```

**Acceptance Criteria:**
- [ ] All token types counted
- [ ] Totals accurate
- [ ] Cost estimates include thinking

---

### FR-4.2: Long-Running Task Framework

#### FR-4.2.1: Task Definition & Execution (Must Have)

**Description:** Framework for multi-step tasks with multiple model calls.

**Task Structure:**
```
Task {
  id: string (UUID)
  name: string
  description: string
  status: enum (PENDING, RUNNING, PAUSED, COMPLETED, FAILED)
  steps: [
    {
      id: string
      name: string
      description: string
      type: enum (MODEL_CALL, TOOL_CALL, BRANCH, AGGREGATE)
      input: object
      output?: object
      status: enum (PENDING, RUNNING, COMPLETED, FAILED)
      retry_count: int
      created_at: datetime
      completed_at?: datetime
    }
  ]
  created_at: datetime
  completed_at?: datetime
  total_tokens_used?: int
  metadata: object
}
```

**Task Types:**
- MODEL_CALL: Call model with input
- TOOL_CALL: Invoke tool (web search, etc.)
- BRANCH: Conditional branching
- AGGREGATE: Combine results from multiple steps

**Requirements:**
- Tasks can have 2-20 steps
- Steps execute sequentially by default
- Parallel step execution with dependencies
- Each step has timeout (default: 60s)
- Step output available to next step
- Failure handling and retry

**Acceptance Criteria:**
- [ ] All task types execute correctly
- [ ] Dependencies respected
- [ ] Timeouts enforced
- [ ] Output passed between steps

---

#### FR-4.2.2: Task State Persistence (Must Have)

**Description:** Task state survives app restarts.

**Requirements:**
- Task state saved after each step
- Resume from last step on restart
- Task history retained
- Local database or file storage
- Maximum 100 task histories retained
- Cleanup of old tasks (older than 30 days)

**Storage:**
- SQLite database for task state
- Binary blob for large outputs
- Indexed by creation date
- Full-text search of task names/descriptions

**Acceptance Criteria:**
- [ ] Tasks persist correctly
- [ ] Resume works after restart
- [ ] History retrievable
- [ ] Storage efficient

---

#### FR-4.2.3: Task Progress UI (Must Have)

**Description:** Clear UI showing task progress and steps.

**Requirements:**
- Progress bar showing overall completion
- Step-by-step timeline
- Current step highlighted
- Completed steps show results summary
- Failed steps show error details
- Estimated time remaining
- Can pause/resume task
- Can cancel with confirmation

**Task Progress Screen:**
```
Task: Research AI Breakthroughs
Progress: [████████░░░░░░░░] 50% (3/6 steps)
Time: 2m 15s elapsed | ~2m 30s remaining

Steps:
✅ Step 1: Search for latest papers (45s)
   Results: Found 23 papers
⏳ Step 2: Summarize key findings (running)
   Status: Summarizing paper 3/23...
⏸ Step 3: Extract technical details (pending)
⏸ Step 4: Compile insights (pending)

[⏸ Pause] [⏹ Cancel]
```

**Acceptance Criteria:**
- [ ] Progress accurate and updates live
- [ ] UI responsive during long tasks
- [ ] Controls work correctly
- [ ] Step results viewable

---

#### FR-4.2.4: Background Task Execution (Should Have)

**Description:** Tasks continue running when app backgrounded.

**Requirements:**
- Use Android background services
- Foreground service with notification
- Notification shows progress
- Tapping notification returns to task
- Device doesn't sleep during task
- Wake lock timeout configurable
- Task survives process death

**Notification Updates:**
```
Research AI Breakthroughs
Progress: 50% | 2m 15s elapsed
Current: Summarizing key findings...
```

**Technical Implementation:**
- Android foreground service
- WorkManager for job scheduling
- Wake lock with timeout
- Notification with progress channel

**Acceptance Criteria:**
- [ ] Task continues in background
- [ ] Notification accurate
- [ ] Recovery from kill works
- [ ] Battery usage reasonable

---

#### FR-4.2.5: Task Cancellation & Cleanup (Should Have)

**Description:** Cancel running tasks with proper cleanup.

**Requirements:**
- Cancel button visible when task running
- Confirmation required for cancellation
- Current step cancelled immediately
- Queued steps not executed
- Resources cleaned up
- Final state saved
- User shown summary of completed steps

**Cancellation Flow:**
1. User clicks Cancel
2. Confirmation dialog "Cancel this task? [Cancel] [OK]"
3. Current step interrupted
4. Resources released
5. Task marked as CANCELLED
6. Completion screen shown

**Acceptance Criteria:**
- [ ] Cancellation stops execution
- [ ] Resources cleaned up
- [ ] State saved correctly
- [ ] UX clear and smooth

---

### FR-4.3: Non-Functional Requirements for Phase 4

| Requirement | Target | Measurement |
|-------------|--------|------------|
| Step execution overhead | < 100ms | Benchmark |
| State save latency | < 500ms | Timing test |
| Task resume time | < 1s | Profiling |
| Memory for 10-step task | < 100MB | Profiling |
| Foreground service latency | < 100ms | Test |

---

## 🔌 Phase 5: Remote MCP Integration

### FR-5.1: MCP Server Management

#### FR-5.1.1: MCP Server Configuration (Must Have)

**Description:** Configure remote MCP servers.

**Configuration Parameters:**
```
MCPServer {
  id: string (UUID)
  name: string
  description: string
  host: string
  port: int
  protocol: enum ("http", "websocket", "stdio")
  enabled: boolean
  auth?: {
    type: enum ("none", "api_key", "oauth")
    credentials: object
  }
  connection_timeout_seconds: int (default: 30)
  metadata: {
    version: string
    capabilities: [string]
    tools_count: int
  }
}
```

**Requirements:**
- Manual server configuration form
- Test connection before saving
- Save multiple server profiles
- Edit/delete server configs
- Connection status indicator
- Validation of host/port
- Secure credential storage

**Configuration UI:**
```
Add MCP Server
├─ Server Name: [text]
├─ Host/IP: [text]
├─ Port: [number]
├─ Protocol: [Dropdown: HTTP/WebSocket/Stdio]
├─ Authentication: [None / API Key / OAuth]
├─ [Test Connection] [Save]
```

**Acceptance Criteria:**
- [ ] Configuration form works
- [ ] Connection testing works
- [ ] Credentials stored securely
- [ ] Multiple servers managed

---

#### FR-5.1.2: MCP Server Discovery (Could Have)

**Description:** Auto-discover MCP servers on network.

**Requirements:**
- Scan for MCP servers on local network
- Detect mDNS/Bonjour services
- Timeout after 10 seconds
- Show discovered servers
- Option to add discovered server
- Falls back to manual entry

**Implementation:**
- mDNS service browsing
- Common MCP ports (3000-3010)
- User-triggered discovery
- Optional feature

**Acceptance Criteria:**
- [ ] Discovery finds servers on network
- [ ] User can select discovered server
- [ ] Discovery doesn't block app

---

#### FR-5.1.3: Server Health Checks (Should Have)

**Description:** Monitor MCP server status.

**Requirements:**
- Periodic health check (every 60s)
- Detect connection issues
- Show server status in UI
- Attempt reconnect on failure
- Log connection history
- Notify user of disconnections

**Status Indicators:**
- 🟢 Connected - Server responding
- 🟡 Connecting - In progress
- 🔴 Disconnected - Not reachable
- ⚠️ Error - Error on last request

**Acceptance Criteria:**
- [ ] Health checks frequent but not excessive
- [ ] Status accurate
- [ ] Reconnection automatic
- [ ] User informed of issues

---

### FR-5.2: MCP Tool Integration

#### FR-5.2.1: Tool Discovery from MCP (Must Have)

**Description:** Discover available tools from MCP servers.

**Requirements:**
- Request tool list from MCP server
- Parse tool schemas
- Cache tool metadata
- Display tools in settings
- Show tool parameters and return type
- Update tool list periodically

**Tool Schema Format:**
```
{
  tools: [
    {
      name: string
      description: string
      inputSchema: {
        type: "object"
        properties: {
          [param_name]: {
            type: string
            description: string
            required: boolean
          }
        }
      }
    }
  ]
}
```

**UI Display:**
```
MCP Server: Custom Tools
├─ Search Code
│  Description: Search across codebase
│  Parameters: query (string), limit (int)
├─ Execute Script
│  Description: Run custom scripts
│  Parameters: script_name (string)
└─ Get Status
   Description: Get system status
   Parameters: none
```

**Acceptance Criteria:**
- [ ] Tool schemas parsed correctly
- [ ] All tool types supported
- [ ] Tool list updated periodically
- [ ] Display clear and organized

---

#### FR-5.2.2: MCP Tool Invocation (Must Have)

**Description:** Call MCP tools through chat.

**Requirements:**
- Models can invoke MCP tools
- Tool parameters validated
- Tool execution through MCP
- Results returned and formatted
- Timeouts enforced (default: 60s)
- Errors handled gracefully
- Tool invocation logged

**Tool Call Flow:**
1. Model requests MCP tool
2. App validates parameters
3. App sends request to MCP server
4. MCP server executes tool
5. Result returned to app
6. App provides result to model
7. Model generates final response

**Requirements:**
- Support sequential tool calls
- Support parallel execution (if MCP allows)
- Proper error handling
- Result caching

**Acceptance Criteria:**
- [ ] Tool invocation works end-to-end
- [ ] Results properly formatted
- [ ] Timeouts respected
- [ ] Errors handled

---

#### FR-5.2.3: MCP Tool Permissions (Should Have)

**Description:** Control which tools models can use.

**Requirements:**
- Enable/disable tools per server
- Sensitive tools require confirmation
- Tool permission levels:
  - Auto-allow (no confirmation)
  - Require confirmation
  - Deny (never use)
- Audit log of tool invocations
- Reset permissions option

**Permission Levels:**
```
Tool: Execute Script
Permission: [Dropdown]
├─ Auto-Allow (quick execution)
├─ Confirm (ask before use)
└─ Deny (never use)

Sensitive Tool Warning ⚠️
This tool can execute arbitrary scripts!
```

**Acceptance Criteria:**
- [ ] Permissions enforced correctly
- [ ] Confirmation works for sensitive tools
- [ ] Audit log accurate
- [ ] User can manage permissions

---

### FR-5.3: Non-Functional Requirements for Phase 5

| Requirement | Target | Measurement |
|-------------|--------|------------|
| Server discovery | < 10s | Timing test |
| Tool list fetch | < 2s | Benchmark |
| Tool invocation latency | < 1s overhead | Measurement |
| MCP connection stability | > 99% | Uptime test |
| Memory for 20 tools | < 50MB | Profiling |

---

## 🏗️ Cross-Phase Requirements

### Performance Targets (All Phases)

- **Message Response Time**: < 5 seconds p95 (typical queries)
- **Tool Execution**: < 3 seconds p95
- **Model Comparison**: < 60 seconds p95 (4 models)
- **App Startup**: < 2 seconds
- **UI Responsiveness**: < 500ms user interaction response
- **Memory Usage**: < 300MB typical, < 500MB peak
- **Battery**: TTS + background tasks < 10% per hour

### Reliability Targets

- **Crash-Free Sessions**: > 99% (< 1 crash per 100 users)
- **Tool Success Rate**: > 95%
- **MCP Connection Stability**: > 99%
- **Task Completion**: > 90% of long-running tasks
- **Data Integrity**: 100% message history preservation

### Testing Requirements

- Unit test coverage: > 80%
- Integration test coverage: > 70%
- Widget test coverage: > 60%
- Manual QA on devices: Android 5.0+
- Performance testing: Benchmark suite
- Stress testing: Large conversations, many models

### Security Requirements

- API keys encrypted in storage
- No credentials in logs
- Network requests use HTTPS
- File access limited to app directory
- Intent handling validates source apps
- Permission requests when needed
- User data never sent to third parties
- MCP credentials securely stored

---

## 📞 Success Metrics

### Phase 1 (Tool Calling)
- [ ] 100% of web search requests succeed
- [ ] Tool invocation response < 3s
- [ ] 60%+ users try web search in first week
- [ ] User feedback positive on tool transparency

### Phase 2 (Model Comparison)
- [ ] 40%+ users try model comparison
- [ ] Performance metrics > 95% accurate
- [ ] Comparison feature session 2x longer than standard chat
- [ ] User rating increase of 0.3 stars

### Phase 3 (Native Integration)
- [ ] 30%+ users use share intent
- [ ] 25%+ enable TTS
- [ ] Share action used in 20%+ of conversations
- [ ] TTS quality rating 4.0+/5.0

### Phase 4 (Thinking Models)
- [ ] 30%+ of power users enable thinking
- [ ] Task success rate > 90%
- [ ] Background execution stability > 99%
- [ ] User requests for more task templates

### Phase 5 (MCP)
- [ ] 20%+ users configure MCP servers
- [ ] MCP tool invocation success > 95%
- [ ] Positive feedback on MCP capabilities
- [ ] No security incidents

