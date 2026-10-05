# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.0] - 2026-10-05

### Added
- **Tool profiles**: default `THOUGHTFLOW_PROFILE=tasks` exposes only `task`/`workflow`/`workflow_run`/`strategy`/`admin`. Set `THOUGHTFLOW_PROFILE=full` to also expose Tree of Thoughts (`tree`/`thought`) and the cognitive `bridge`.
- Task `priority` (low|normal|high|urgent) and `tags`, with `tag`/`priority`/`workflowId`/`strategyId` filters on `task` list.
- `task` actions: `stale` (in_progress tasks idle > N hours), `bulk_update` (many ids, or all stale, in one call), `archive`/`unarchive` (hide old completed tasks from lists).
- `admin` action `maintain` and `npm run maintain [-- --dry]`: repair links, merge duplicate workflows, re-derive statuses, drop empty implicit strategies. The same pass runs on server start.
- Rolling state backups (`<state>.bak-<timestamp>`, newest 5, at most one per 10 min; `THOUGHTFLOW_BACKUP_KEEP`, `THOUGHTFLOW_BACKUP_INTERVAL_MIN`).
- Dashboard: stale / priority / tag / archived badges.

### Changed
- Workflow and strategy status are now derived from their tasks (previously always `pending`).
- Omitting `strategyId` uses ONE shared project strategy (`THOUGHTFLOW_DEFAULT_STRATEGY`, else the server's working-directory name) instead of minting a `scratch-*` strategy per call.
- A multi-task `task create` batch without `workflowId` is auto-grouped into a workflow (`workflowName` optional); dependencies/parentTaskId now resolve for standalone batches too (they were silently dropped).
- Workflow ids match by id, slug or name, so `wf_x` and `wf-x` are one workflow; tasks now store the real workflow id (previously the raw, un-slugged input, which caused duplicate workflows).
- `startedAt` is set when a task first enters `in_progress`.
- `npm test` builds first and runs the maintained suites.

### Fixed
- `workflow remove_task` now clears the task's `workflowId`.

### Changed
- Mutation replies (`task` update/move, `workflow` add_task/remove_task, `strategy` add/remove tree/workflow) now return only `{id, status}` instead of `{id, name, status}`. The caller already knows the name, so this saves tokens. `create` and `list` replies still include `name`.

## [1.0.0] - 2025-01-XX

### Added
- **Task Orchestrator Service** - Structured task execution with dependency tracking
  - Create, update, delete tasks
  - Workflow management
  - Strategy organization
  - Auto-save with debouncing

- **Tree of Thoughts Service** - Systematic reasoning with branching and evaluation
  - Create and manage thought trees
  - Add child thoughts
  - Evaluate thoughts with multi-criteria scoring
  - Verify and select thoughts
  - Backtrack and prune trees
  - Strategy management for long-term projects

- **Cognitive Bridge Service** - Bidirectional conversion between thoughts and tasks
  - `promote_thought_to_tasks` - Convert reasoning into executable tasks
  - `spawn_tot_from_task` - Create reasoning trees from blocked tasks
  - `link_thought_to_task` - Lightweight explicit linking
  - `get_cognitive_provenance` - Trace full reasoning → execution chain

- **Unified Storage Layer** - Single storage backend for all data
  - JSON file-based storage (default)
  - Cognitive namespace for bridge layer metadata
  - Cognitive links for provenance tracking

- **MCP Tool Handlers** - 30+ tools across three domains
  - Task Orchestrator tools (13)
  - Tree of Thoughts tools (11)
  - Bridge Layer tools (4)

- **Type Definitions** - Unified TypeScript types
  - Task, Workflow, Strategy types
  - Tree, Thought types with multi-criteria evaluation
  - CognitiveMetadata interface for bridge layer
  - Error classes for all domains

- **Utilities** - Shared infrastructure
  - Logger with configurable log levels
  - Validators for common inputs
  - UUID generation for all entities

### Features
- **Idempotency** - Promoting the same thought twice returns existing tasks
- **Hierarchy Preservation** - Subtree structure preserved in task dependencies
- **Provenance Tracking** - Full audit trail from thought → task → thought
- **Cognitive Metadata Namespace** - All bridge data under `metadata.cognitive`
- **Auto-save** - Debounced auto-save for data persistence

### Documentation
- Comprehensive README with hybrid workflow examples
- EXAMPLES.md with 8 detailed usage examples
- Architecture diagram
- Bridge Layer documentation with cognitive metadata structure

### Testing
- Bridge layer test suite with 15+ test cases
- Tests for idempotency, hierarchy preservation, provenance
- Error handling tests
- Cognitive metadata namespace tests

### Configuration
- JSON storage backend with configurable path
- TypeScript with ES2022 target
- Node.js >= 18 required
