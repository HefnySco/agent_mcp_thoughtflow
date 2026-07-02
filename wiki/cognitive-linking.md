# Cognitive Linking

This document explains the Cognitive Bridge Layer and cognitive linking in the Thoughtflow MCP system.

## Overview

The Cognitive Bridge Layer is the "killer feature" of Thoughtflow — it enables seamless, bidirectional conversion between reasoning (Tree of Thoughts) and execution (Tasks/Workflows) while maintaining full provenance tracking.

### The Problem It Solves

Many agents follow this broken pattern:
1. Use reasoning tools to explore approaches
2. Jump directly to implementation
3. Lose the connection between reasoning and execution
4. Cannot trace back why a decision was made
5. Cannot resume or delegate work with context

The Cognitive Bridge Layer makes the correct workflow the easiest path:
**Think → Promote to Tasks → Execute with Tracking → (If blocked) Spawn new reasoning → Trace provenance**

## Core Concepts

### Cognitive Provenance

**Definition**: The complete chain of reasoning → execution → reasoning cycles that led to a current state.

**Components**:
- **Source thoughts**: Which ideas inspired the tasks
- **Promotion events**: When thoughts were converted to tasks
- **Spawn events**: When tasks spawned new reasoning
- **Link events**: Soft "inspired by" relationships
- **Verification events**: When thoughts were validated

**Why it matters**: Enables auditability, debugging, and intelligent delegation.

### Cognitive Links

**Definition**: Soft bidirectional connections between thoughts and tasks.

**Types**:
- **Promotion links**: Full conversion from thought to task (with descendants)
- **Spawn links**: Task → new reasoning tree (for deeper analysis)
- **Inspiration links**: Soft "inspired by" or "related to" relationships

**Storage**:
- Thought metadata: `metadata.cognitive.linkedTaskIds`
- Task metadata: `metadata.cognitive.linkedThoughtIds`
- Sync status: `synced` | `outdated` | `conflict`
- Provenance chain: Array of provenance entries

## Bridge Layer Tools

### 1. promote_thought_to_tasks

**Purpose**: Convert a thought (or entire subtree) into executable tasks with full provenance.

**When to use**:
- Reasoning is complete and validated
- A clear execution path is identified
- The thought represents concrete work items

**Parameters**:
- **treeId**: Source tree
- **thoughtId**: Thought to promote
- **workflowId**: Target workflow (required)
- **includeDescendants**: Promote entire subtree (default: false)
- **flattenHierarchy**: Flatten subtree into flat task list (default: false)
- **taskNamePrefix**: Prefix for generated task names

**Behavior**:
1. Validates thought exists in tree
2. Validates workflow exists
3. Creates tasks from thought hierarchy
4. Sets cognitive metadata on tasks:
   - `metadata.cognitive.sourceThoughtId`: Original thought ID
   - `metadata.cognitive.sourceTreeId`: Original tree ID
   - `metadata.cognitive.promotedAt`: Timestamp
   - `metadata.cognitive.promotedBy`: Agent/system
5. Creates bidirectional links
6. Returns created tasks

**Example**:
```json
{
  "treeId": "tree-123",
  "thoughtId": "idea-5",
  "workflowId": "workflow-456",
  "includeDescendants": true,
  "flattenHierarchy": false,
  "taskNamePrefix": "Cache: "
}
```

**Result**: Creates tasks like "Cache: Implement LRU", "Cache: Add Redis", etc., each with cognitive metadata linking back to source thoughts.

**Status Behavior**:
- **Thought state**: The source thought's state is NOT changed by promotion. It remains in its current state (pending, evaluated, selected, etc.).
- **Task status**: Created tasks have status `pending` by default, ready for execution.
- **Thought metadata**: Updated with `promotedToTaskIds`, `promotedAt`, `workflowId`, and provenance entry.
- **Task metadata**: Includes `sourceThoughtId`, `sourceTreeId`, `promotedAt`, and `syncStatus: 'synced'`.

### 2. spawn_tot_from_task

**Purpose**: When a task is blocked, spawn a fresh Tree of Thoughts from it for deeper analysis.

**When to use**:
- Task execution fails
- Task requires additional exploration
- Need to reason about a specific problem

**Parameters**:
- **taskId**: Source task
- **goal**: Goal for the new reasoning tree
- **rootContent**: Root thought content
- **maxDepth**: Maximum depth (optional)
- **treeId**: Existing tree to attach to (optional)

**Behavior**:
1. Validates task exists
2. Creates new tree (or attaches to existing)
3. Sets cognitive metadata on tree:
   - `metadata.cognitive.sourceTaskId`: Original task ID
   - `metadata.cognitive.sourceWorkflowId`: Original workflow
   - `metadata.cognitive.spawnedAt`: Timestamp
   - `metadata.cognitive.spawnedBy`: Agent/system
4. Creates bidirectional link
5. Returns created tree

**Example**:
```json
{
  "taskId": "task-789",
  "goal": "Investigate cache invalidation failure",
  "rootContent": "Cache is not being invalidated on write operations"
}
```

**Result**: Creates new ToT tree with provenance linking back to the blocked task, enabling focused reasoning on the specific problem.

### 3. link_thought_to_task

**Purpose**: Create soft bidirectional links between thoughts and tasks for "inspired by" or "related to" relationships.

**When to use**:
- A thought inspires a task but isn't directly promoted
- Want to track related work without full conversion
- Maintain loose coupling between reasoning and execution

**Parameters**:
- **treeId**: Source tree
- **thoughtId**: Thought to link
- **taskId**: Task to link
- **reason**: Explanation of the relationship (optional)

**Behavior**:
1. Validates thought and task exist
2. Adds task ID to thought's `metadata.cognitive.linkedTaskIds`
3. Adds thought ID to task's `metadata.cognitive.linkedThoughtIds`
4. Sets sync status to `synced`
5. Adds provenance entry
6. Returns success

**Example**:
```json
{
  "treeId": "tree-123",
  "thoughtId": "idea-3",
  "taskId": "task-456",
  "reason": "Inspired by the Redis caching approach"
}
```

**Result**: Creates soft link without full conversion, useful for tracking inspiration without committing to execution.

### 4. get_cognitive_provenance

**Purpose**: Trace the complete reasoning → execution chain for a task or thought.

**When to use**:
- Need to understand why a task was created
- Debugging execution failures
- Auditing decision-making process
- Delegating work with full context

**Parameters**:
- **id**: Task or thought ID
- **type**: "task" or "thought"
- **maxDepth**: Maximum depth to traverse (optional)

**Behavior**:
1. Validates entity exists
2. Traverses cognitive links
3. Builds provenance chain
4. Returns structured provenance data

**Example**:
```json
{
  "id": "task-789",
  "type": "task",
  "maxDepth": 5
}
```

**Result**: Returns complete chain showing:
- Which thought inspired this task
- Which tree that thought came from
- Any spawn events from this task
- All linked thoughts and tasks

## Provenance Chain Structure

### Provenance Entry

Each provenance entry contains:
- **type**: "promotion" | "spawn" | "link" | "verification"
- **timestamp**: When the event occurred
- **sourceId**: Source entity ID
- **targetId**: Target entity ID
- **sourceType**: "thought" | "task" | "tree" | "workflow"
- **targetType**: "thought" | "task" | "tree" | "workflow"
- **reason**: Explanation of the relationship
- **agent**: Agent/system that performed the action

### Example Chain

```
Task: "Implement cache invalidation"
├── Promotion from:
│   └── Thought: "Add cache invalidation on write"
│       └── Tree: "Caching strategy exploration"
│           └── Strategy: "API performance optimization"
├── Spawned:
│   └── Tree: "Debug cache invalidation failure"
│       └── Root: "Cache not invalidating on writes"
└── Linked to:
    └── Thought: "Consider event-based invalidation"
        └── Tree: "Alternative invalidation strategies"
```

## Sync Status

### Status Values

- **`synced`**: Thought and task are in sync
- **`outdated`**: One has been updated since linking
- **`conflict`**: Both have been updated with conflicting changes

### When Status Changes

- **synced → outdated**: When either thought or task is updated
- **outdated → synced**: When changes are reconciled
- **outdated → conflict**: When both are updated without reconciliation

### Managing Sync Status

The system does not automatically sync changes. Agents must:
1. Check sync status before making decisions
2. Manually reconcile conflicts when they occur
3. Update sync status after reconciliation

## Best Practices

### 1. Always Use Bridge Layer

**Rule**: Never manually create tasks from thoughts without using `promote_thought_to_tasks`.

**Why**: Maintains provenance and enables traceability.

### 2. Link Early, Link Often

**Rule**: Use `link_thought_to_task` whenever a thought inspires a task, even if not directly promoted.

**Why**: Captures inspiration and maintains context.

### 3. Spawn When Blocked

**Rule**: Use `spawn_tot_from_task` when execution fails or requires deeper reasoning.

**Why**: Enables focused problem-solving while maintaining provenance.

### 4. Trace Provenance Before Changes

**Rule**: Use `get_cognitive_provenance` before modifying tasks or thoughts.

**Why**: Understands context and avoids breaking provenance chains.

### 5. Document Relationships

**Rule**: Always provide `reason` parameter when linking or promoting.

**Why**: Makes provenance chains self-documenting.

### 6. Manage Sync Status

**Rule**: Check and update sync status when working with linked entities.

**Why**: Avoids conflicts and ensures consistency.

## Common Patterns

### Standard Exploration → Execution Pattern

```
1. create_tree (explore problem space)
2. add_ideas (generate approaches)
3. evaluate_thought (score approaches)
4. select_thought (choose best approach)
5. promote_thought_to_tasks (convert to execution)
6. start_workflow_execution (execute tasks)
```

### Debugging Pattern

```
1. get_cognitive_provenance (understand context)
2. spawn_tot_from_task (reason about failure)
3. add_ideas (explore failure modes)
4. evaluate_thought (identify root cause)
5. select_thought (choose fix)
6. promote_thought_to_tasks (implement fix)
7. advance_workflow_run (retry execution)
```

### Iterative Refinement Pattern

```
1. promote_thought_to_tasks (initial execution plan)
2. execute tasks (partial execution)
3. spawn_tot_from_task (reason about blockers)
4. link_thought_to_task (track inspiration)
5. promote_thought_to_tasks (add new tasks)
6. continue execution
```

### Cross-Strategy Inspiration Pattern

```
1. create_tree (explore in Strategy A)
2. link_thought_to_task (inspire task in Strategy B)
3. get_cognitive_provenance (trace cross-strategy link)
4. Use insight to improve Strategy B
```

## Error Handling

### Common Errors

- **ThoughtNotFoundError**: Thought doesn't exist in tree
- **TaskNotFoundError**: Task doesn't exist
- **WorkflowNotFoundError**: Workflow doesn't exist
- **ValidationError**: Invalid parameters or state

### Resolution

- Use `get_tree` to verify thought exists before promoting
- Use `get_task` to verify task exists before linking/spawning
- Use `get_workflow` to verify workflow exists before promoting
- Check cognitive metadata before operations

## Performance Considerations

### Provenance Traversal

- **Complexity**: O(d) where d = depth of provenance chain
- **Optimization**: Use `maxDepth` to limit traversal
- **Caching**: Provenance chains are not cached (traversed on demand)

### Link Management

- **Complexity**: O(1) for creating links
- **Storage**: Links stored in metadata (no separate table)
- **Scalability**: Suitable for thousands of links per entity

## Integration with Other Systems

### External Task Trackers

**Pattern**: Use cognitive linking to bridge Thoughtflow with external systems.

**Example**:
```json
{
  "treeId": "tree-123",
  "thoughtId": "idea-5",
  "taskId": "JIRA-1234",  // External task ID
  "reason": "Mapped to external ticket"
}
```

### Documentation Systems

**Pattern**: Use provenance chains to generate documentation.

**Example**:
- Trace provenance for a task
- Generate "Why this task exists" documentation
- Include in project README or design docs

### Code Review Systems

**Pattern**: Use cognitive links to connect reasoning to code changes.

**Example**:
- Promote thought to tasks
- Execute tasks (code changes)
- Link tasks to PRs
- Use provenance for PR descriptions

## Future Enhancements

### Planned Features

- **Automatic sync detection**: Detect when linked entities diverge
- **Conflict resolution UI**: Visual tool for resolving conflicts
- **Provenance visualization**: Graph view of cognitive chains
- **External system integration**: Native support for JIRA, GitHub, etc.
- **Provenance export**: Export provenance as documentation

### Community Contributions

Contributions welcome for:
- Additional bridge operations
- Provenance analysis tools
- Integration with external systems
- Visualization improvements
