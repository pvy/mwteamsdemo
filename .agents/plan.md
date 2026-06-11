Níže máš **kompletní „master prompt / design specification“**, který můžeš použít:

* jako **zadání pro implementační tým**
* jako **system prompt pro Copilot Studio agenta**
* nebo jako kombinovaný **design + implementation blueprint**

Je psaný tak, aby pokryl:

* architekturu
* MCP návrh (UI + business)
* SignalR bridge
* orchestrace pravidla
* RAG
* nástroje
* edge cases

***

# 🧠 MASTER PROMPT: MCP-driven Collaborative Map System in Teams

***

# 1. SYSTEM OVERVIEW

You are building a **collaborative AI-driven map system inside Microsoft Teams**, where:

* Users control a shared map using natural language
* A **Copilot Studio Agent acts as the orchestration layer**
* The system uses **two MCP servers**:
  * **UI MCP (client-bridge via SignalR)**
  * **Business MCP (server-side logic)**
* The UI is synchronized across users via **real-time SignalR**
* AI is **not authoritative system of record**, but an **active participant in collaborative UI**

***

# 2. ARCHITECTURAL PRINCIPLES

***

## 2.1 Responsibility Split

The system is divided into two execution domains:

### UI Domain (Client-driven)

* Visual rendering
* Map interaction
* Layer management
* Executes in browser
* Eventual consistency acceptable

### Business Domain (Server-driven)

* Data retrieval
* Data transformation
* Persistence
* Deterministic execution
* Source of truth

***

## 2.2 MCP Roles

### MCP Server #1: UI MCP (Bridge)

* Exposed to Copilot
* Internally routes calls:
  * to **initiating client**
  * via SignalR
* Client executes tools using embedded MCP runtime

### MCP Server #2: Business MCP

* Fully server-side
* Provides:
  * data
  * computation
  * deterministic responses

***

## 2.3 Copilot Role

Copilot Studio Agent:

* selects tools
* decides order of execution
* combines UI + business tools
* acts as:
  → **planner + orchestrator**

***

# 3. DATA FLOW

***

## 3.1 Standard Interaction Flow

```
User (Teams):
@MapAgent show logistics centers

→ Copilot Agent:
   1. biz_get_logistics_centers
   2. ui_create_layer("logistics")
   3. ui_add_items_to_layer(data)

→ UI MCP:
   call forwarded to initiating client

→ Client:
   executes action locally

→ SignalR:
   broadcasts new state

→ Other clients:
   update map
```

***

## 3.2 Constraints

* UI execution always tied to:
  * initiating client
* sync = SignalR only
* no backend orchestration logic

***

## 3.3 Execution Context and Routing

All MCP calls MUST carry execution context identifying:

- chatId (Teams conversation identifier)
- userId (initiating user)
- requestId (correlation ID)

Example:

{
  "chatId": "teams-chat-id",
  "userId": "user-a-id",
  "requestId": "uuid",
  "tool": "ui_create_layer",
  "payload": {...}
}

### Routing Rules

1. Every UI MCP call MUST be routed to the initiating user's client instance.
2. The initiating client is the ONLY authoritative executor for that specific MCP call.
3. Other clients MUST NOT execute MCP calls directly.
4. All other clients receive updates ONLY via SignalR synchronization.

### Rationale

This guarantees:
- consistent tool execution context
- correct orchestration behavior in Copilot
- avoidance of multi-client race conditions
``

***

# 4. MCP TOOL DESIGN

***

# 4.1 Naming Convention (CRITICAL)

All tools MUST follow prefixes:

```
ui_*
biz_*
data_*
```

***

# 4.2 UI MCP TOOLS

These tools:

* affect only UI
* do NOT return business data
* may be async

***

## Example Tools

### ui\_create\_layer

```json
{
  "name": "ui_create_layer",
  "description": "Creates a reusable logical visualization layer on the shared map. Recommended for grouping structured data such as logistics centers.",
  "input": {
    "name": "string",
    "type": "string"
  },
  "output": {
    "layerId": "string"
  }
}
```

***

### ui\_add\_items\_to\_layer

```json
{
  "name": "ui_add_items_to_layer",
  "description": "Adds items to an existing visualization layer. Should be used after creating or selecting a layer.",
  "input": {
    "layerId": "string",
    "items": "array"
  }
}
```

***

### ui\_set\_view

```json
{
  "name": "ui_set_view",
  "description": "Sets map viewport (zoom, center). Purely visual operation.",
  "input": {
    "center": "coordinates",
    "zoom": "number"
  }
}
```

***

# 4.3 BUSINESS MCP TOOLS

These tools:

* return structured data
* are deterministic
* used for reasoning

***

### biz\_get\_logistics\_centers

```json
{
  "name": "biz_get_logistics_centers",
  "description": "Retrieves logistics centers from enterprise data sources. Returns structured data suitable for further processing or visualization.",
  "input": {
    "filter": "optional string"
  },
  "output": {
    "centers": "array"
  }
}
```

***

### biz\_optimize\_routes

```json
{
  "name": "biz_optimize_routes",
  "description": "Calculates optimized routes between logistics centers. Requires structured input.",
  "input": {
    "centers": "array"
  },
  "output": {
    "routes": "array"
  }
}
```

***

# 5. AGENT SYSTEM INSTRUCTIONS

***

## CORE RULES FOR AGENT

```text
You are a collaborative map assistant.

Follow these rules strictly:

1. Always retrieve data using business tools before visualization.
2. Never call UI tools unless relevant data is already available.
3. Prefer structured visualization:
   - create layers before adding items
4. Use UI tools only for rendering and visualization.
5. Business tools provide data; UI tools display it.
6. Do not rely on UI state as a source of truth for business logic.
7. When adding multiple items, always group them in a layer.
8. Avoid redundant map actions.
9. Treat UI actions as collaborative operations shared across users.
10. Ensure actions are logically ordered and consistent.
```
***

## 6. SignalR Synchronization Model

### Core Principle

UI changes are always applied locally FIRST on the initiating client, then propagated to others.

### Canonical Flow

1. Copilot triggers UI MCP tool
2. MCP Bridge routes call to initiating client (userId)
3. Client executes action locally (modifies its own UI state)
4. Client emits a synchronization event to SignalR
5. SignalR broadcasts event to all other clients in the same chatId
6. Other clients update their UI to match the new state

### Important Constraint

Only ONE client performs the original execution.
All other clients are passive receivers of state updates.

---

### DO NOT DO

❌ Do NOT broadcast MCP calls
❌ Do NOT let multiple clients execute the same MCP tool
❌ Do NOT treat backend as UI state authority

---

### Example Flow

User A:

→ triggers "ui_create_layer"

Execution:

→ only User A client executes layer creation
→ then sends:

SignalR event:
{
  "type": "layer_created",
  "layerId": "...",
  "chatId": "..."
}

Other clients:

→ receive event
→ replicate UI change locally

---

### Consistency Model

- eventual consistency
- last-write-wins
- no strong locking required

This is equivalent to manual collaborative UI interaction (e.g., shared whiteboard).


***

# 6. RAG KNOWLEDGE BASE

***

## 6.1 Purpose

RAG is used as:

✅ contextual guidance
❌ not deterministic workflow

***

## 6.2 Example RAG Documents

***

### SCENARIO 1: Show Logistics Centers

```text
Scenario: Display logistics centers on map

Best practice:
1. Retrieve logistics centers using business MCP tools
2. Create a dedicated visualization layer
3. Add all retrieved items into this layer
4. Ensure layer visibility

Notes:
- Avoid rendering points individually without grouping
- Use layers for performance and clarity
```
***

## 7. UI MCP Execution Model

UI MCP tools are NOT executed globally.

Instead:

- execution happens ONLY on the initiating user's client
- synchronization happens AFTER execution

### Execution Steps

1. MCP call arrives at backend
2. Backend resolves (chatId, userId)
3. Backend routes call via SignalR ONLY to that client
4. Client executes tool locally
5. Client emits synchronization event

---

### Important Distinction

MCP call != broadcast action

Broadcast happens ONLY after execution as state propagation.

---

### Why This Is Critical

If MCP calls were broadcast:
- multiple clients would execute independently
- divergence and race conditions would occur
- Copilot orchestration would break

Therefore:
→ execution must be SINGLE-OWNER
→ synchronization must be MULTI-RECEIVER

***

## 8. Client Responsibility Model

Each client instance has two roles:

### 1. Execution Engine (Active Role)

- executes MCP calls routed to it
- modifies local UI state
- emits synchronization events

This role is active ONLY when the client is the initiator.

---

### 2. Replication Engine (Passive Role)

- listens for SignalR events
- updates UI to match shared state

This role is active ALWAYS for all clients except the initiator.

---

### Important

A client MUST NOT:

- execute MCP calls not addressed to it
- act as MCP server authority
- modify state outside of SignalR propagation model

***

## 9. MCP vs SignalR Responsibilities

The system separates concerns strictly:

### MCP

- used for:
  - intent execution
  - tool invocation
  - interaction with Copilot
- always single-target

---

### SignalR

- used for:
  - state propagation
  - UI synchronization
- always multi-target

---

### Summary

| Aspect          | MCP            | SignalR          |
|----------------|---------------|------------------|
| Purpose         | Execute action | Sync state       |
| Scope           | Single client  | All clients      |
| Timing          | Before change  | After change     |
| Authority       | Initiating user| Shared UI state  |

---

### Key Principle

MCP decides WHAT happens
SignalR ensures EVERYONE SEES IT

***

The system follows a "local-first execution with distributed synchronization" model:

- All UI changes are executed locally by the initiating user's client
- The resulting state is then propagated to other clients
- This mirrors direct user interaction patterns in collaborative applications

Copilot acts as another participant, not a central controller.


***

***

### SCENARIO 2: Analyze Distribution Network

```text
Scenario: Analyze logistics network

Best practice:
1. Retrieve logistics nodes
2. Compute routes using optimization tool
3. Display routes and nodes separately
4. Keep layers logically separated

Notes:
- Never compute routes without having node data
```

***

***

### SCENARIO 3: Incremental Updates

```text
Scenario: Add new locations to existing map

Best practice:
1. Check if layer exists
2. If not, create layer
3. Add only new items
4. Avoid duplicating existing visualization

Notes:
- Maintain clean UI structure
```

***

***

## 6.3 RAG Usage Rule

```text
RAG provides recommendations.
Do not treat it as strict instruction.
Adapt based on context.
```

***

# 7. SIGNALR BRIDGE DESIGN

***

## 7.1 Message Structure

```json
{
  "requestId": "...",
  "chatId": "...",
  "userId": "...",
  "tool": "ui_create_layer",
  "payload": {...}
}
```

***

## 7.2 Flow

```
Backend:
   receives MCP call
   routes to initiating client

Client:
   executes
   returns result

Backend:
   returns to Copilot
```

***

## 7.3 Broadcast

After execution:

```
Client
   → SignalR broadcast
   → all clients update state
```

***

# 8. FAILURE HANDLING

***

## 8.1 Client Not Available

```text
If initiating client is not connected:
- return graceful fallback
- do NOT block Copilot
```

***

## 8.2 Timeout

```text
If client does not respond within timeout:
- return error
- allow retry
```

***

## 8.3 Conflict Handling

```text
Conflicts between users are acceptable.
System follows collaborative model:
last update wins.
```

***

# 9. IMPORTANT DESIGN CONSTRAINTS

***

## ✅ DO

* keep business logic server-side
* keep UI execution client-side
* design tools carefully
* use descriptive naming

***

## ❌ DO NOT

* use UI as source of truth for data
* create hidden coupling between tools
* rely on perfect synchronization
* treat RAG as deterministic workflow

***

# 10. FINAL INTENT

***

The system should behave as:

> **AI-powered collaborative UI system where Copilot acts as an intelligent participant, not a controller.**

***

# 💬 ONE-SENTENCE SUMMARY

> Build the system so that Copilot decides *what to do*, business MCP provides *what is true*, and UI MCP performs *what is visible*, with SignalR ensuring everyone sees the same result.

***

***

✅ Pokud chceš další krok, můžu ti z toho udělat:

* konkrétní **Copilot Studio konfiguraci (manifest + instructions + tools)**
* nebo **reference implementaci (Node + SignalR + MCP server skeleton)**
