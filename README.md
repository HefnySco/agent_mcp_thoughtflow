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
- `link_thought_to_task` — Lightweight explicit linking for provenance without full promotion
- `get_cognitive_provenance` — Trace the complete reasoning → execution chain

All bridge operations automatically maintain `metadata.cognitive` and create auditable `cognitiveLinks`.

### Task Orchestrator

- Rich task model with hard/soft dependencies
- Hierarchical tasks (`parentTaskId` + `order`)
- Workflow creation and execution engine with automatic dependency resolution
- `startWorkflowExecution` + `advanceWorkflowRun` for controlled execution
- `getReadyTasks` for just-in-time task dispatching

### Tree of Thoughts

- Full hierarchical thought trees with depth control
- Multi-criteria evaluation (`score`, `creativity`, `risk`, custom criteria)
- Pruning, backtracking, verification, and selection
- Strategy grouping for organizing related reasoning sessions

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

---

## Tool Reference

### Bridge Layer Tools

| Tool | Purpose |
|------|---------|
| `promote_thought_to_tasks` | Convert reasoning into tracked executable work |
| `spawn_tot_from_task` | Spawn fresh reasoning from a blocked task |
| `link_thought_to_task` | Create lightweight provenance links |
| `get_cognitive_provenance` | Trace full reasoning → execution history |

### Task Orchestrator Tools

| Category | Tools |
|----------|-------|
| Tasks | `create_task`, `get_task`, `list_tasks`, `update_task`, `delete_task` |
| Workflows | `create_workflow`, `get_workflow`, `list_workflows`, `addTasksToWorkflow` |
| Execution | `start_workflow_execution`, `advance_workflow_run`, `getReadyTasks` |
| Hierarchy | `get_subtasks`, `move_task` |
| Strategies | `create_strategy`, `get_strategy`, `list_strategies` |

### Tree of Thoughts Tools

| Category | Tools |
|----------|-------|
| Trees | `create_tree`, `get_tree`, `list_trees`, `delete_tree` |
| Thoughts | `add_child`, `get_thought`, `evaluate_thought`, `verify_thought`, `select_thought`, `backtrack`, `prune_tree` |
| Strategies | `create_strategy`, `get_strategy`, `list_strategies` |

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

1. **Explore** — Use `create_tree` + `add_child` + `evaluate_thought` to explore solution space
2. **Commit** — Use `promote_thought_to_tasks` on the most promising branch
3. **Execute** — Use `start_workflow_execution` + `advance_workflow_run` (or `getReadyTasks`)
4. **Reflect** — If blocked, use `spawn_tot_from_task` on the stuck task
5. **Audit** — Use `get_cognitive_provenance` when traceability is required

This pattern turns ad-hoc reasoning into auditable, resumable, delegable work.

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
- [ ] Web UI for inspecting cognitive provenance

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