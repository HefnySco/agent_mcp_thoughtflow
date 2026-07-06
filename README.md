# agent_mcp_thoughtflow

> Unified Cognitive Scaffold MCP Server — Bridging Deep Reasoning and Reliable Execution for LLM Agents

[![MCP](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Overview

`agent_mcp_thoughtflow` is a production-ready **Model Context Protocol (MCP)** server that unifies structured task execution with systematic reasoning.

Modern LLM agents are excellent at **planning** (using techniques like Tree of Thoughts) but frequently fail at **execution** — they explore ideas, then jump straight into implementation while skipping proper task tracking, dependency management, and auditability.

This server solves that gap by providing a **single, cohesive cognitive scaffold** where:

- **Strategy** — Top-level organizer that groups related reasoning trees and execution workflows
- **Tree of Thoughts** handles divergent exploration and evaluation
- **Task Orchestrator** handles convergent execution with dependencies and workflows
- **Cognitive Bridge Layer** enables seamless, bidirectional conversion between thoughts and executable tasks

The result: agents can **think deeply**, commit reasoning to structured work, execute reliably, and — when blocked — spawn new reasoning trees from existing tasks.

---

## The Core Problem It Solves

Many agents follow this broken pattern:

1. Use ToT / reasoning tools to explore approaches
2. Directly implement changes without creating tracked tasks
3. Lose provenance, auditability, and the ability to resume or delegate work

`agent_mcp_thoughtflow` makes the correct workflow the easiest path:

**Think → Promote to Tasks → Execute with Tracking → (If blocked) Spawn new reasoning from task**

---

## Key Features

### Cognitive Bridge Layer (The Killer Feature)

- `promote_thought_to_tasks` — Convert a thought (or entire subtree) into executable tasks with full provenance metadata
- `spawn_tot_from_task` — When a task is blocked, spawn a fresh Tree of Thoughts from it for deeper analysis
- `link_thought_to_task` — Create soft bidirectional links between thoughts and tasks for "inspired by" or "related to" relationships
- `get_cognitive_provenance` — Trace the complete reasoning → execution chain

All bridge operations automatically maintain `metadata.cognitive` and create auditable `cognitiveLinks`.

### Task Orchestrator

- Rich task model with hard/soft dependencies
- Hierarchical tasks (`parentTaskId` + `order`)
- Workflow creation and execution engine with automatic dependency resolution
- `startWorkflowExecution` + `advanceWorkflowRun` for controlled execution
- `getReadyTasks` for just-in-time task dispatching
- **First-class verification fields** — `verified`, `verifiedAt`, `verificationNotes`, `verificationMethod` for tracking verification status

### Tree of Thoughts

- Full hierarchical thought trees with depth control
- Multi-criteria evaluation (`score`, `creativity`, `risk`, custom criteria)
- Pruning, backtracking, verification, and selection
- Strategy grouping for organizing related reasoning sessions
- **First-class verification fields** — `verified`, `verifiedAt`, `verificationNotes`, `verificationMethod` for tracking verification status

### Strategy Model (Top-Level Organizer)

- **Strategy** groups related Trees of Thoughts and Workflows into cohesive units
- Each Strategy can own multiple `treeIds` and `workflowIds`
- Enables organizing complex projects by linking reasoning and execution
- Tools: `add_tree_to_strategy`, `add_workflow_to_strategy`, `remove_tree_from_strategy`, `remove_workflow_from_strategy`

### Visualization & Introspection

- ASCII tree visualization (`visualize_tree_ascii`)
- Tree visualization with cognitive links (`visualize_tree_with_links`)
- SVG workflow diagrams with dependency layout
- SVG task and strategy visualizations
- `get_cognitive_stats` for high-level metrics

### Architecture & Extensibility

- Clean service-oriented design with `BaseService`
- Dependency injection between services
- Pluggable LLM providers (Grok, Ollama, Mock)
- JSON storage (SQLite planned)
- Centralized `ToolRegistry` for maintainable tool definitions

---

## Installation

```bash
npm install agent_mcp_thoughtflow
```

Or run directly with `npx`:

```bash
npx agent_mcp_thoughtflow
```

---

## Quick Start

### 1. Start the Server

```bash
npx agent_mcp_thoughtflow
```

The server uses JSON file storage by default (`./thoughtflow-state.json`).

### 2. Basic Hybrid Workflow Example

```json
// 1. Create a reasoning tree
create_tree({
  "goal": "Design a robust caching strategy for our API",
  "rootContent": "Start with a simple in-memory cache"
})

// 2. Explore and evaluate thoughts...

// 3. Promote the best approach to tasks
promote_thought_to_tasks({
  "treeId": "...",
  "thoughtId": "...",
  "includeDescendants": true,
  "workflowId": "optional-existing-workflow"
})

// 4. Start executing the workflow
start_workflow_execution({ "workflowId": "..." })

// 5. If a task gets blocked, spawn new reasoning
spawn_tot_from_task({
  "taskId": "...",
  "goal": "Investigate why the cache invalidation is failing",
  "rootContent": "The cache is not being invalidated on write operations"
})
```

### 3. Quick Plan (One-Call Setup)

For new projects, use `quick_plan` to create strategy + workflow + tasks + root thought in a single call:

```json
quick_plan({
  "goal": "Implement user authentication system",
  "tasks": [
    { "name": "Design auth schema", "description": "Define user, session, and token tables" },
    { "name": "Implement password hashing", "dependencies": ["task-1"] },
    { "name": "Create login endpoint", "dependencies": ["task-2"] },
    { "name": "Add JWT token generation", "dependencies": ["task-3"] },
    { "name": "Implement logout logic", "dependencies": ["task-4"] }
  ],
  "strategyName": "auth-system",
  "workflowName": "auth-implementation"
})

// Returns:
// {
//   strategyId: "auth-system",
//   workflowId: "auth-implementation",
//   taskIds: ["task-1", "task-2", "task-3", "task-4", "task-5"],
//   treeId: "...",
//   rootThoughtId: "..."
// }
```

This reduces 4-5 tool calls to 1, making onboarding friction-free.

---

## Web UI Dashboard

The Thoughtflow Dashboard provides a comprehensive web interface for inspecting cognitive provenance, including:

- **Strategy Overview** — View all strategies with their associated trees and workflows
- **Task Management** — Monitor task status, dependencies, and execution progress
- **Tree of Thoughts Visualization** — Explore thought trees with evaluation scores and states
- **Workflow Tracking** — Track workflow execution status and completion
- **Cognitive Links** — Inspect bidirectional links between thoughts and tasks
- **Real-time Updates** — Auto-refresh capability with change indicators

### Starting the Dashboard

```bash
# Build the project first (if not already built)
npm run build

# Start the dashboard server
npm run dashboard
```

The dashboard server will start on port 3000 (or the next available port if 3000 is in use). You'll see output like:

```
Thoughtflow Dashboard server running at http://localhost:3000
Dashboard: http://localhost:3000/dashboard
API: http://localhost:3000/api/state
State Info: http://localhost:3000/api/state/info
```

### Accessing the Dashboard

Open your browser and navigate to:
- **Dashboard**: `http://localhost:3000/dashboard`

### Dashboard Features

- **Strategy Filtering** — Click on a strategy to filter trees, workflows, and tasks by that strategy
- **Show/Hide Deleted Items** — Toggle the checkbox to view soft-deleted items
- **Auto-Refresh** — Enable/disable automatic data refresh (default: ON)
- **Manual Refresh** — Click the Refresh button to manually update data
- **Collapsible Trees** — Expand/collapse thought trees to explore reasoning branches
- **Status Indicators** — Color-coded status indicators for tasks, thoughts, and workflows

### API Endpoints

The dashboard server provides the following API endpoints:

- `GET /api/state` — Returns the complete Thoughtflow state (strategies, tasks, trees, workflows, cognitive links)
- `GET /api/state/info` — Returns state metadata (exists, lastModified, size)

---

## Tool Reference

### Bridge Layer Tools

| Tool | Purpose |
|------|---------|
| `promote_thought_to_tasks` | Convert reasoning into tracked executable work |
| `spawn_tot_from_task` | Spawn fresh reasoning from a blocked task |
| `link_thought_to_task` | Create soft bidirectional links for "inspired by" or "related to" relationships |
| `get_cognitive_provenance` | Trace full reasoning → execution history |
| `complete_task_and_thought` | Atomically mark task completed and evaluate/verify linked thoughts |
| `quick_plan` | Single call to create strategy + workflow + tasks + root thought |
| `sync_workflow_thoughts` | Scan completed tasks and evaluate pending linked thoughts |

**Note**: `promote_thought_to_tasks` supports `skipEvaluationGate: true` for simple workflows that don't need the evaluate+select cycle. The system uses debounce mechanisms to prevent race conditions during heavy LLM usage.

### Task Orchestrator Tools

| Category | Tools |
|----------|-------|
| Tasks | `create_tasks` (batch), `get_task`, `list_tasks`, `update_task`, `delete_task` |
| Workflows | `create_workflow`, `get_workflow`, `list_workflows`, `addTasksToWorkflow` |
| Execution | `start_workflow_execution`, `advance_workflow_run`, `getReadyTasks` |
| Hierarchy | `get_subtasks`, `move_task` |
| Strategies | `create_strategy`, `get_strategy`, `list_strategies`, `add_tree_to_strategy`, `remove_tree_from_strategy` |
| Soft-Delete | `purge_deleted`, `restore_deleted` |

**Note**: Single-item task creation (`create_task`) is not available. Use `create_tasks` (batch) for all task creation. It supports positional references (task-1, task-2) for dependencies and parent-child relationships within the batch, and returns an `idMap` for mapping positional refs to real IDs.

### Tree of Thoughts Tools

| Category | Tools |
|----------|-------|
| Trees | `create_tree`, `get_tree`, `list_trees`, `delete_tree` |
| Thoughts | `add_ideas` (batch), `get_thought`, `evaluate_thought`, `verify_thought`, `select_thought`, `backtrack`, `prune_tree` |
| Strategies | `create_strategy`, `get_strategy`, `list_strategies`, `add_workflow_to_strategy`, `remove_workflow_from_strategy` |

**Note**: Single-item idea creation (`add_idea`) is not available. Use `add_ideas` (batch) for all idea creation. It supports positional references (idea-1, idea-2) for parentId within the batch, uses fuzzy matching for robustness, and returns an `idMap` for mapping positional refs to real IDs.

### Soft-Delete & Recovery

All delete operations use **soft-delete** by default — entities are marked as deleted but preserved for recovery.

- **`includeDeleted` parameter**: All `get_*` and `list_*` tools support an optional `includeDeleted: true` parameter to view soft-deleted items.
- **`restore_deleted`**: Restore a soft-deleted entity back to active state. Requires `entityType` ('task', 'workflow', 'tree', 'strategy', 'link') and `id`.
- **`purge_deleted`**: Permanently remove soft-deleted items (cannot be undone). Supports filtering by `entityType` and `olderThanDays` for safe cleanup.

Example workflow:
```json
// 1. Delete a task
delete_task({ "id": "task-123" })

// 2. List active tasks (deleted task hidden)
list_tasks() // → task-123 not visible

// 3. List with deleted included
list_tasks({ "includeDeleted": true }) // → task-123 visible with isDeleted flag

// 4. Restore if needed
restore_deleted({ "entityType": "task", "id": "task-123" })

// 5. Permanently purge old deleted items (e.g., older than 30 days)
purge_deleted({ "entityType": "task", "olderThanDays": 30 })
```

### State Size & Deduplication

Cognitive links can accumulate over time. The system includes built-in deduplication tools to manage state size:

- **`deduplicate_strategies_and_trees`** — Removes duplicate strategies and trees by normalized name/goal
- **`deduplicate_strategies`** — Removes duplicate strategies only
- **`deduplicate_trees`** — Removes duplicate trees only

For production workloads with heavy cognitive link usage, monitor state file size and run deduplication periodically.

### Visualization Tools

- `visualize_tree_ascii`
- `visualize_tree_with_links`
- `visualize_workflow_svg`
- `visualize_task_svg`
- `visualize_strategy_svg`
- `get_cognitive_stats`

---

## Recommended Agent Workflow

The intended usage pattern for LLM agents:

1. **Explore** — Use `create_tree` + `add_idea` + `evaluate_thought` to explore solution space
2. **Commit** — Use `promote_thought_to_tasks` on the most promising branch
3. **Execute** — Use `start_workflow_execution` + `advance_workflow_run` (or `getReadyTasks`)
4. **Reflect** — If blocked, use `spawn_tot_from_task` on the stuck task
5. **Audit** — Use `get_cognitive_provenance` when traceability is required

This pattern turns ad-hoc reasoning into auditable, resumable, delegable work.

---

## Relationship Model

The system uses a **strict hierarchical relationship model** for organizing cognitive work:

```
Strategy (Top-Level Organizer - Mandatory Owner)
├── workflowIds: string[]      → Workflows (each workflow belongs to exactly ONE strategy)
├── treeIds: string[]          → Trees of Thoughts (reasoning, optional strategy association)
└── metadata: Record<string, any>

Workflow (Execution Container - Mandatory Owner)
├── strategyId: string         → Strategy (mandatory, exactly one)
├── taskIds: string[]          → Tasks (each task belongs to exactly ONE workflow)
└── metadata: Record<string, any>

Task (Executable Unit - Mandatory Owner)
├── workflowId: string         → Workflow (mandatory, exactly one)
├── strategyId: string         → Strategy (denormalized from workflow for convenience)
├── parentTaskId?: string      → Subtask parent (must be in same workflow)
├── dependencies: string[]     → Task dependencies (must be in same workflow)
└── metadata: Record<string, any>

Idea (Thought) ↔ Task (Soft Bidirectional Links)
├── Thought.metadata.cognitive.linkedTaskIds
├── Task.metadata.cognitive.linkedThoughtIds
├── syncStatus: 'synced' | 'outdated' | 'conflict'
└── provenanceChain: ProvenanceEntry[]
```

### Key Relationships & Invariants

- **Strategy → Workflows**: Strict ownership — each workflow belongs to exactly one strategy
- **Workflow → Tasks**: Strict ownership — each task belongs to exactly one workflow
- **Task → Strategy**: Denormalized from workflow for convenience, automatically kept in sync
- **Subtasks**: Must have parent in the same workflow (enforced by `parentTaskId` validation)
- **Dependencies**: Must reference tasks in the same workflow (enforced by validation)
- **Idea ↔ Task**: Soft bidirectional links enable "inspired by" or "related to" relationships without full promotion
- **Promotion**: Full conversion from thought subtree to executable tasks with provenance tracking (requires `workflowId`)
- **Spawning**: Create new reasoning trees from blocked tasks for deeper analysis

### Creation Flow (Strict Hierarchy)

All creation flows must follow the hierarchy:

1. **`create_strategy`** — Create or get strategy (idempotent by normalized name)
2. **`create_workflow(strategyId)`** — Create workflow with mandatory `strategyId`
3. **`create_task(workflowId)`** — Create task with mandatory `workflowId` (automatically inherits `strategyId`)

The system enforces these invariants at every operation to prevent data inconsistency.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Thoughtflow MCP Server                    │
├─────────────────────────────────────────────────────────────┤
│  CognitiveBridgeService  ←→  TaskOrchestratorService        │
│         ↑                          ↑                         │
│         │                          │                         │
│  ToTService                 Workflow Execution Engine       │
│         │                          │                         │
│         └──────────┬───────────────┘                         │
│                    │                                         │
│           VisualizationService                               │
└─────────────────────────────────────────────────────────────┘
```

All services extend `BaseService` for unified state management, auto-save, and shutdown behavior.

---

## Storage

- Default: JSON file (`thoughtflow-state.json`)
- Future: SQLite support (planned in v1.1)

The storage layer is abstracted via `IStorageAdapter`, making it easy to add new backends.

---

## LLM Provider Support

The ToT system supports multiple LLM backends:

- **Grok** (`GrokLLMProvider`) — Recommended for high-quality structured evaluation
- **Ollama** (`OllamaLLMProvider`) — Local/private models
- **Mock** (`MockLLMProvider`) — Testing and development

---

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build
```

---

## Roadmap

- [ ] SQLite storage adapter
- [ ] Richer workflow visualization and Gantt-style views
- [ ] Built-in retry policies and task timeout handling
- [ ] Multi-agent collaboration primitives
- [x] Web UI for inspecting cognitive provenance

---

## Contributing

Contributions are welcome! Please open an issue first to discuss major changes.

Focus areas:
- Improving the Bridge Layer ergonomics
- Additional visualization formats
- Performance on large thought trees / workflows

---

## License

MIT © 2026

---

## Acknowledgments

This project was born from the observation that **reasoning without execution tracking is incomplete**, and **execution without reasoning provenance is fragile**.

`agent_mcp_thoughtflow` exists to make the full cognitive loop first-class in agent systems.

---

**Built with ❤️ for agents that need to think *and* ship.**