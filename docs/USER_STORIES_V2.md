# User Stories: Private Chat Hub v2

**Document Version:** 1.0  
**Created:** January 3, 2026  
**Status:** Planning  
**Scope:** v2 Features (Q2-Q3 2026)

---

## 📋 Story Format

Each user story follows this structure:

```
**[STORY_ID]** - [Title]

As a [user type]
I want to [functionality]
So that [benefit]

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

**Dependencies:** [Other stories this depends on]
**Priority:** [P0/P1/P2]
**Effort:** [XS/S/M/L/XL]
**Phase:** [1-5]
```

---

## Phase 1: Tool Calling & Web Search

### TOOL-001 - Define Tool Calling Architecture

As a **developer**
I want to **define a generic Tool interface and execution framework**
So that **we can support Web Search, MCP, and future tools seamlessly**

**Acceptance Criteria:**
- [ ] Tool interface defines schema (name, description, parameters)
- [ ] Tool execution returns structured results with metadata
- [ ] Tool errors are caught and formatted for display
- [ ] Tools can be composed (chained together)
- [ ] Tool results are cached to avoid duplicate calls
- [ ] System supports both sync and async tool execution

**Technical Requirements:**
- Abstract `Tool` base class with execute() method
- `ToolSchema` for parameter definition and validation
- `ToolResult` data class for standardized results
- `ToolError` for error handling
- Tool registry/manager for discovery

**Dependencies:** None
**Priority:** P0
**Effort:** M
**Phase:** 1

---

### TOOL-002 - Web Search Tool Implementation

As an **AI user**
I want to **ask the model questions about current events and real-time information**
So that **I get accurate, up-to-date answers without needing to manually search**

**Acceptance Criteria:**
- [ ] Model can invoke web search tool when needed
- [ ] Search results include URL, title, and snippet
- [ ] Model can incorporate search results into response
- [ ] Search completes within 3 seconds (p95)
- [ ] Failed searches show user-friendly error messages
- [ ] Search results are cached for 1 hour
- [ ] Search count is tracked and displayed to user

**Technical Requirements:**
- Integrate with web search API (SerpAPI, DuckDuckGo, or Ollama web search)
- Parse and format search results
- Implement caching with TTL
- Handle API rate limiting gracefully
- Fallback for search failures

**User Experience:**
- Show loading indicator when model is searching
- Display search results inline in response
- Show which tool was invoked (transparency)
- Option to refine search or ask follow-up

**Dependencies:** TOOL-001
**Priority:** P0
**Effort:** L
**Phase:** 1

---

### TOOL-003 - Tool Result Rendering

As a **user**
I want to **see tool results (web searches, function calls) formatted nicely in the chat**
So that **I can easily understand what tools were used and what they returned**

**Acceptance Criteria:**
- [ ] Web search results show as cards with title, snippet, link
- [ ] Tool execution steps are shown with timestamps
- [ ] Tool errors display with retry option
- [ ] Tool results can be collapsed/expanded
- [ ] Links in tool results are clickable
- [ ] Tool names and parameters are shown (transparency)
- [ ] Markdown in tool results is rendered correctly

**UI Components:**
- `ToolResultCard` widget for search results
- `ToolExecutionTimeline` for step-by-step execution
- `ToolErrorBanner` for failures
- Tool invocation badge on message

**Dependencies:** TOOL-002
**Priority:** P0
**Effort:** M
**Phase:** 1

---

### TOOL-004 - Configure Web Search Settings

As a **power user**
I want to **configure web search preferences (enable/disable, API key, search engine)**
So that **I control how web search works in my conversations**

**Acceptance Criteria:**
- [ ] Users can enable/disable web search globally
- [ ] Users can enter custom API key for search service
- [ ] Users can select search engine (if multiple supported)
- [ ] Settings persist across app restarts
- [ ] Invalid API keys show error with instructions
- [ ] Search usage statistics shown in settings
- [ ] Users can clear search cache manually

**Settings UI:**
- Toggle for web search enable/disable
- Text field for API key (password masked)
- Dropdown for search engine selection
- Usage stats display
- Clear cache button

**Dependencies:** TOOL-002
**Priority:** P1
**Effort:** S
**Phase:** 1

---

### TOOL-005 - Tool Calling Error Handling & Fallbacks

As a **user**
I want to **see helpful error messages when tools fail**
So that **I understand what went wrong and can take action**

**Acceptance Criteria:**
- [ ] Network errors show clear messages
- [ ] API errors (rate limit, invalid key) are handled gracefully
- [ ] Timeout errors allow retrying
- [ ] Model continues without tool if tool fails
- [ ] Error details visible but not overwhelming
- [ ] Retry button available for failed tools
- [ ] Fallback strategies implemented (e.g., continue without search)

**Error Types to Handle:**
- Network connectivity issues
- Tool execution timeout
- API rate limiting
- Invalid API credentials
- Tool not available on model
- Tool parameter validation failure

**Dependencies:** TOOL-002, TOOL-003
**Priority:** P0
**Effort:** M
**Phase:** 1

---

## Phase 2: Model Comparison & Multi-Model Workflows

### COMP-001 - Model Comparison Chat Interface

As a **power user**
I want to **send a message to multiple models simultaneously and see their responses side-by-side**
So that **I can compare how different models approach the same problem**

**Acceptance Criteria:**
- [ ] Users can select 2-4 models for comparison
- [ ] Single message sent to all selected models in parallel
- [ ] Responses displayed side-by-side or in tabs
- [ ] Model names clearly labeled above responses
- [ ] Response times shown for each model
- [ ] Can continue comparison conversation (all models see history)
- [ ] Can switch models in/out mid-conversation

**UI Design:**
- "Compare Models" button in model selector
- Model selection screen (checkboxes for 2-4 models)
- Split-screen or tabbed layout for responses
- Response time badges
- Model switcher in header

**Technical Requirements:**
- Parallel API calls to Ollama
- Request queuing to not overload server
- UI state management for comparison conversation
- Performance metrics collection

**Dependencies:** None (doesn't require TOOL-001)
**Priority:** P0
**Effort:** L
**Phase:** 2

---

### COMP-002 - Model Performance Metrics

As a **user**
I want to **see performance metrics for each model (response time, token count, quality)**
So that **I can choose the best model for my needs**

**Acceptance Criteria:**
- [ ] Response time tracked for each message
- [ ] Token count shown (input/output)
- [ ] Time-to-first-token displayed
- [ ] Cost estimation (if applicable)
- [ ] Quality ratings can be given by user
- [ ] Metrics aggregated over time in dashboard
- [ ] Can filter metrics by date range, model, type

**Metrics to Track:**
- Total response time (p50, p95, p99)
- Time to first token
- Output tokens per second
- Total tokens (input + output)
- User satisfaction rating
- Tool usage per model

**Dependencies:** COMP-001
**Priority:** P1
**Effort:** M
**Phase:** 2

---

### COMP-003 - Model Switching in Conversation

As a **user**
I want to **switch to a different model without losing conversation history**
So that **I can try different models on the same topic**

**Acceptance Criteria:**
- [ ] Model selector available in chat header
- [ ] Switching model doesn't clear conversation
- [ ] Previous messages from different model tagged clearly
- [ ] New messages use selected model
- [ ] Context window respects all previous messages
- [ ] Smooth transition (no visible lag)

**UI Changes:**
- Model selector dropdown in chat header
- Visual indicator of which model is active
- Message badges showing which model generated response
- "Switch model" confirmation if long conversation

**Technical Handling:**
- Conversation tracks per-message model used
- Context management for multi-model conversations
- Token counting across models

**Dependencies:** COMP-001
**Priority:** P0
**Effort:** M
**Phase:** 2

---

### COMP-004 - Response Comparison & Diff

As an **analyst or researcher**
I want to **see differences highlighted between model responses**
So that **I quickly understand how models diverge on important details**

**Acceptance Criteria:**
- [ ] Can highlight differences between two responses
- [ ] Similar text is grayed out, differences highlighted
- [ ] Color coding shows additions/removals
- [ ] Comparison works with markdown (code blocks, lists)
- [ ] Can compare any 2 responses in conversation
- [ ] Diff can be toggled on/off
- [ ] Can copy comparison as markdown

**UI Implementation:**
- "Compare responses" button on response cards
- Modal or split-view showing diff
- Color scheme: green for differences, red for removals
- Copy button for full diff

**Technical Requirements:**
- Diff algorithm (edit distance or similar)
- Handle markdown parsing for accurate diffs
- Performance optimization for large responses

**Dependencies:** COMP-001
**Priority:** P1
**Effort:** M
**Phase:** 2

---

### COMP-005 - Conversation Branching (Choose Best Response)

As a **user**
I want to **explore different conversation paths by keeping the best response and discarding others**
So that **I can find the best model behavior for my use case**

**Acceptance Criteria:**
- [ ] "Use this response" button keeps only selected response
- [ ] Other model responses in that turn are marked as discarded
- [ ] Can still view discarded responses (collapsed)
- [ ] Conversation continues from selected response
- [ ] Branching history is preserved (can go back)
- [ ] Exported conversation shows chosen path

**Interaction Pattern:**
- In comparison view, each response has "Use this" button
- Only selected response becomes official conversation path
- Others fade to background
- Can "undo" choice to see alternatives again

**Data Model:**
- Conversation tracks multiple branches
- Each turn can have multiple responses
- Main path vs. alternative paths
- Branch navigation UI

**Dependencies:** COMP-001
**Priority:** P1
**Effort:** M
**Phase:** 2

---

## Phase 3: Native Android Integration

### INTENT-001 - Receive Share Intent (Text)

As a **user**
I want to **share text from any app (web browser, email, notes) to chat**
So that **I can quickly ask questions about content from other apps**

**Acceptance Criteria:**
- [ ] App appears in Android share menu of other apps
- [ ] Shared text is populated in chat input
- [ ] User can edit text before sending
- [ ] Works from any app with share functionality
- [ ] App opens to chat screen when shared to
- [ ] Multiple shares don't lose text
- [ ] Works when app is not running

**Technical Implementation:**
- Register intent filter in AndroidManifest.xml
- Handle ACTION_SEND intent
- Parse text/plain content
- Auto-focus chat input with shared text
- Maintain share history

**User Experience:**
- Smooth transition from source app to chat
- Clear indication of shared content
- Ability to add more context before sending

**Dependencies:** None
**Priority:** P0
**Effort:** M
**Phase:** 3

---

### INTENT-002 - Receive Share Intent (Images)

As a **user**
I want to **share images from gallery or camera to chat**
So that **I can discuss images with vision-capable models**

**Acceptance Criteria:**
- [ ] Shared images appear as attachments in chat
- [ ] Multiple images can be shared at once
- [ ] Preview of shared images shown
- [ ] Works from Gallery, Photos, Camera apps
- [ ] File size limits are enforced gracefully
- [ ] Unsupported image formats handled
- [ ] Can replace image before sending

**Technical Implementation:**
- Handle ACTION_SEND and ACTION_SEND_MULTIPLE
- Parse image/* content types
- Image compression if needed
- Storage permission handling
- File validation

**Supported Formats:**
- PNG, JPEG, WebP
- Max size: 20MB per image
- Max 5 images per message

**Dependencies:** None (depends on existing vision support)
**Priority:** P0
**Effort:** M
**Phase:** 3

---

### INTENT-003 - Share Conversation to Other Apps

As a **user**
I want to **share a conversation or message with other apps (email, messaging, notes)**
So that **I can save or distribute conversations easily**

**Acceptance Criteria:**
- [ ] "Share" button on messages and conversations
- [ ] Can share single message or entire conversation
- [ ] Can choose format (plain text, markdown, formatted)
- [ ] Share works with all Android share targets
- [ ] Preserves formatting in shared text
- [ ] Can copy to clipboard directly
- [ ] Works offline (no network required)

**Share Options:**
- Share single message
- Share conversation thread (with/without system messages)
- Format selection (Plain text, Markdown, HTML)
- Copy to clipboard
- Save as file

**Technical Implementation:**
- Generate different formats from conversation data
- Share intent with TYPE and DATA
- File provider for saved conversations

**Dependencies:** None
**Priority:** P0
**Effort:** M
**Phase:** 3

---

### TTS-001 - Text-to-Speech for Model Responses

As a **user**
I want to **listen to AI responses with high-quality text-to-speech**
So that **I can consume content while driving, exercising, or hands-free**

**Acceptance Criteria:**
- [ ] Play button on each AI response
- [ ] Clear audio with good quality
- [ ] Playback controls (pause, resume, skip)
- [ ] Speed adjustment (0.8x - 2.0x)
- [ ] Can stop playback immediately
- [ ] Works with network latency
- [ ] Continues if app goes background
- [ ] Respects system volume

**Technical Implementation:**
- Use `flutter_tts` package or native Android TTS
- Android TextToSpeech API for high quality
- Audio focus management
- Streaming vs. buffering strategy
- Error handling for TTS initialization

**UI Controls:**
- Play button on response messages
- Playback progress slider
- Speed adjustment dropdown
- Pause/resume buttons
- Stop/close button

**Voice Settings:**
- Voice selection (system voices)
- Language selection
- Pitch adjustment (if supported)
- Persist user preferences

**Dependencies:** None
**Priority:** P0
**Effort:** L
**Phase:** 3

---

### TTS-002 - Configure TTS Preferences

As a **user**
I want to **customize TTS settings for my preferences**
So that **speech sounds natural and matches my needs**

**Acceptance Criteria:**
- [ ] Users can select preferred voice
- [ ] Speed can be adjusted (default: 1.0x)
- [ ] Pitch can be adjusted (if supported)
- [ ] Language can be set
- [ ] Auto-play option (start TTS on message)
- [ ] Settings persist across sessions
- [ ] Preview button to test voice settings
- [ ] Show available voices (not all devices have same voices)

**Settings Location:**
- Settings screen → Audio/TTS section
- Quick settings in chat screen

**Technical Considerations:**
- Handle devices with limited TTS engines
- Graceful fallback if selected voice unavailable
- Check TTS engine initialization

**Dependencies:** TTS-001
**Priority:** P1
**Effort:** S
**Phase:** 3

---

### TTS-003 - Streaming TTS (Start Playing While Generating)

As a **user**
I want to **start listening to responses while the model is still generating**
So that **I don't have to wait for full response before hearing it**

**Acceptance Criteria:**
- [ ] TTS plays as response is being streamed
- [ ] No delay between generation and playback
- [ ] Quality not degraded vs. full buffering
- [ ] Can pause/stop mid-response
- [ ] Works reliably without stuttering

**Technical Challenges:**
- Synchronize streaming text with TTS
- Buffer management
- Error recovery if streaming interrupted
- Performance (TTS processing overhead)

**Implementation Strategy:**
- Queue text chunks for TTS
- Balance buffering vs. latency
- Test on various Android versions

**Dependencies:** TTS-001
**Priority:** P2
**Effort:** L
**Phase:** 3

---

## Phase 4: Thinking Models & Long-Running Tasks

### THINK-001 - Support Thinking Models

As an **advanced user**
I want to **use models with extended reasoning/thinking capabilities**
So that **I get better solutions to complex problems**

**Acceptance Criteria:**
- [ ] Model list shows which models support thinking
- [ ] Can enable thinking mode when supported
- [ ] Thinking tokens are shown separately
- [ ] Thinking process visible (can be collapsed)
- [ ] Total token count includes thinking tokens
- [ ] Cost estimate includes thinking token cost
- [ ] Option to set thinking budget/time
- [ ] Clear UI distinction between thinking and response

**Thinking Display:**
- Expandable "Show thinking" section
- Thinking steps or thoughts displayed
- Final response after thinking
- Token count breakdown (thinking vs. response)

**Technical Implementation:**
- Detect thinking model capability from Ollama
- Parse thinking tokens from response
- Proper token counting including thinking
- Storage of thinking content with message

**User Control:**
- Toggle thinking on/off per message
- Set maximum thinking budget
- Option to hide thinking (just show answer)

**Dependencies:** None
**Priority:** P1
**Effort:** M
**Phase:** 4

---

### TASK-001 - Define Long-Running Task Framework

As a **developer**
I want to **create a framework for multi-step tasks that may require multiple model calls**
So that **we can support complex workflows like research, code generation, debugging**

**Acceptance Criteria:**
- [ ] Task interface defines steps, dependencies, state
- [ ] Task state machine (pending → running → completed/failed)
- [ ] Steps can be executed sequentially or in parallel
- [ ] Step results feed into next steps
- [ ] Task progress tracked and displayed
- [ ] Task can be paused/resumed
- [ ] Task can be cancelled with cleanup
- [ ] Task state persisted across app restarts
- [ ] Task history/logs retained

**Task State Model:**
```
PENDING → RUNNING → (PAUSED) → COMPLETED
                  ↓
               FAILED (with retry option)
```

**Step Definition:**
- Step name and description
- Input parameters
- Model/tool to execute
- Output handling
- Error recovery
- Dependencies on other steps

**Technical Requirements:**
- Abstract `Task` and `TaskStep` classes
- State persistence (SQLite or shared preferences)
- Queue management for step execution
- Result caching between steps
- Logging and debugging info

**Dependencies:** None
**Priority:** P0
**Effort:** L
**Phase:** 4

---

### TASK-002 - Task Progress UI & Tracking

As a **user**
I want to **see progress of long-running tasks with clear status updates**
So that **I know the task is working and how much longer it will take**

**Acceptance Criteria:**
- [ ] Progress bar shows task completion percentage
- [ ] Current step clearly displayed
- [ ] List of completed steps with results
- [ ] Estimated time remaining shown
- [ ] Can pause/resume task
- [ ] Can cancel task with confirmation
- [ ] View detailed logs of each step
- [ ] Error details if step fails
- [ ] Toast notifications for step completion

**UI Components:**
- `TaskProgressScreen` with step timeline
- Progress bar with percentage
- Step status cards (pending, running, completed, failed)
- Action buttons (pause, resume, cancel)
- Log viewer for debugging

**User Workflows:**
- Start task from chat
- Navigate away; task continues
- Return to task progress screen
- View completed result
- Retry failed steps

**Performance:**
- Smooth animation of progress
- No UI jank during updates
- Efficient state updates

**Dependencies:** TASK-001
**Priority:** P0
**Effort:** M
**Phase:** 4

---

### TASK-003 - Background Task Execution

As a **user**
I want to **continue using the app or minimize it while tasks run in the background**
So that **I'm not blocked from other activities while waiting**

**Acceptance Criteria:**
- [ ] Tasks continue running when app is backgrounded
- [ ] Notification shows task progress
- [ ] Tapping notification returns to task screen
- [ ] Tasks survive app restart
- [ ] Wake lock prevents device sleep (configurable)
- [ ] Battery usage reasonable for long tasks
- [ ] Cancellation works in background
- [ ] Network issues don't kill background task

**Technical Implementation:**
- Background execution (Dart isolates or similar)
- Foreground service for notifications
- Wake lock management
- State restoration on app restart
- Network resilience

**Notification:**
- Show task name and progress
- Pause/resume buttons in notification
- Cancel button
- Tap to open task details

**Configuration:**
- User can choose wake lock behavior
- Battery saver mode disables certain background tasks
- Max concurrent background tasks

**Dependencies:** TASK-002
**Priority:** P1
**Effort:** L
**Phase:** 4

---

### TASK-004 - Task Templates & Reusable Workflows

As a **power user**
I want to **save successful task workflows as templates for future use**
So that **I can repeat complex workflows without recreating them**

**Acceptance Criteria:**
- [ ] Can save completed task as template
- [ ] Template includes all steps and configuration
- [ ] Can create new task from template
- [ ] Template parameters can be customized
- [ ] Share templates with export/import
- [ ] Built-in templates for common tasks
- [ ] UI to browse and manage templates
- [ ] Can edit templates after creation

**Built-in Templates:**
- Code review workflow
- Research/summarization workflow
- Documentation generation
- Bug triage and analysis
- Content ideation

**Technical Storage:**
- Templates in local database or file system
- JSON format for portability
- Validation of template structure

**Dependencies:** TASK-001, TASK-002
**Priority:** P2
**Effort:** M
**Phase:** 4

---

### TASK-005 - Task Result Caching & Resumption

As a **user**
I want to **resume interrupted tasks or reuse results from previous similar tasks**
So that **I don't waste processing on duplicate work**

**Acceptance Criteria:**
- [ ] Task results cached by step output
- [ ] Similar tasks detect reusable cache
- [ ] Users can manually reuse cached results
- [ ] Cache size manageable (user can clear)
- [ ] Cache hits properly attributed
- [ ] Expired cache auto-removed
- [ ] Option to disable caching for privacy
- [ ] Clear indication when using cached result

**Cache Policy:**
- TTL: 7 days default
- Max cache size: 100MB default
- Keyed by step parameters hash
- Clear cache older than retention period

**Technical Implementation:**
- Key-value store for cached results
- Expiration timestamp tracking
- Compression for large results
- Migration/cleanup background job

**Dependencies:** TASK-001
**Priority:** P2
**Effort:** M
**Phase:** 4

---

## Phase 5: Remote MCP Integration

### MCP-001 - MCP Server Discovery & Configuration

As a **power user**
I want to **discover and connect to MCP servers on my network**
So that **I can use advanced tools and capabilities**

**Acceptance Criteria:**
- [ ] Manual MCP server configuration (host, port)
- [ ] Connection testing before saving
- [ ] Save multiple MCP server profiles
- [ ] Auto-discovery of MCP servers (optional)
- [ ] Connection status indicator
- [ ] List of available tools per server
- [ ] Tool schemas displayed
- [ ] Error messages for connection failures

**MCP Server Config:**
- Server name
- Host/port
- Protocol (stdio, HTTP, etc.)
- Authentication (if needed)
- Optional: API key/token
- Keep-alive settings

**Technical Implementation:**
- MCP client library (or implement protocol)
- Connection pooling
- Tool schema caching
- Periodic health checks

**UI:**
- Settings section for MCP servers
- Add/edit/delete server forms
- Server status dashboard
- Tool browser

**Dependencies:** None
**Priority:** P1
**Effort:** M
**Phase:** 5

---

### MCP-002 - Dynamic Tool Invocation via MCP

As a **developer**
I want to **use MCP tools through the chat interface just like web search**
So that **I can leverage advanced tools seamlessly**

**Acceptance Criteria:**
- [ ] Models can invoke MCP tools automatically
- [ ] Tool parameters validated against schema
- [ ] Tool results formatted and displayed
- [ ] MCP tool errors handled gracefully
- [ ] Tool invocation timeouts respected
- [ ] Tool usage tracked and logged
- [ ] Option to manually invoke tools
- [ ] Tool result caching works with MCP

**Implementation:**
- MCP tools integrate into tool calling framework
- Tool schema parsed from MCP server
- Parameter validation
- Result formatting
- Error handling and timeouts

**User Experience:**
- Tool invocation shown in message
- MCP tool results displayed like web search
- Clear indication of tool source (MCP server)

**Dependencies:** TOOL-001, MCP-001
**Priority:** P1
**Effort:** L
**Phase:** 5

---

### MCP-003 - MCP Tool Management & Permissions

As a **user**
I want to **control which MCP tools the model can use**
So that **I maintain security and control over tool access**

**Acceptance Criteria:**
- [ ] Can enable/disable tools per MCP server
- [ ] Can restrict tools by category/type
- [ ] Tool permissions persist
- [ ] Model respects tool permissions
- [ ] Audit log of tool invocations
- [ ] Confirmation required for sensitive tools
- [ ] Rate limiting per tool

**Tool Management UI:**
- List of available tools per server
- Toggle enable/disable
- Permission level (auto-allow, confirm, deny)
- Sensitive tool warning
- Invocation history

**Sensitive Tools Examples:**
- File system access
- System commands
- Network operations
- Destructive operations

**Dependencies:** MCP-002
**Priority:** P1
**Effort:** M
**Phase:** 5

---

## ✅ Cross-Phase Dependencies

### Critical Path for Implementation:

1. **TOOL-001** → Tool calling foundation (unlocks TOOL-002, TOOL-003, COMP-001)
2. **TOOL-002** → Web search (first real tool)
3. **TOOL-003** → Tool result UI (COMP-001 depends on good tool UX)
4. **COMP-001** → Model comparison (can proceed in parallel with INTENT-001)
5. **INTENT-001** → Share intent (independent, high value)
6. **TTS-001** → Text-to-speech (independent, high value)
7. **TASK-001** → Long-running task framework (foundation for thinking models)
8. **THINK-001** → Thinking model support (builds on TASK-001)
9. **MCP-001** → MCP discovery (foundation for MCP tools)
10. **MCP-002** → Dynamic MCP tools (reuses TOOL-001 framework)

### Parallel Tracks:

**Track A (Tool Calling):** TOOL-001 → TOOL-002 → TOOL-003 → TOOL-005 → TOOL-004 → COMP-001
**Track B (Native Integration):** INTENT-001 → INTENT-002 → INTENT-003 (parallel) → TTS-001 → TTS-002 → TTS-003
**Track C (Advanced Tasks):** TASK-001 → TASK-002 → TASK-003 → THINK-001 → TASK-004 → TASK-005
**Track D (MCP):** MCP-001 → MCP-002 → MCP-003

---

## 📊 Story Estimation Summary

| Phase | Effort | Duration | Stories |
|-------|--------|----------|---------|
| 1 | 45 pts | 8-10 wks | 5 |
| 2 | 35 pts | 6-8 wks | 5 |
| 3 | 48 pts | 6-8 wks | 8 |
| 4 | 52 pts | 8-10 wks | 5 |
| 5 | 32 pts | 6-8 wks | 3 |
| **Total** | **212 pts** | **34-44 weeks** | **26** |

**Velocity:** Assuming 8-12 pts/week → Total 18-27 weeks (4-6 months)

