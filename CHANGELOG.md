# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [Unreleased]
