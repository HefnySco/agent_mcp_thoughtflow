# Workflows and Tasks Rules

This document outlines the rules and best practices for working with Workflows and Tasks in the Thoughtflow MCP system.

## Core Concepts

### What are Workflows?

Workflows are execution containers that group related tasks for convergent execution. They represent:
- A cohesive unit of executable work
- Tasks with dependencies and hierarchy
- A strategy for completing a specific goal
- The bridge between reasoning (ToT) and execution

### What are Tasks?

Tasks are the fundamental executable units in the system. They represent:
- Concrete work items that can be executed
- Dependencies on other tasks
- Hierarchical subtask relationships
- Status tracking through execution lifecycle

### Key Properties

#### Workflow Properties
- **id**: Unique slug-based identifier
- **name**: Workflow name
- **description**: Optional description
- **strategyId**: Mandatory owner strategy
- **taskIds**: Array of task IDs in this workflow
- **metadata**: Arbitrary key-value pairs
- **createdAt** / **updatedAt**: Timestamps

#### Task Properties
- **id**: Unique slug-based identifier
- **name**: Task name
- **description**: Optional description
- **workflowId**: Mandatory owner workflow
- **strategyId**: Denormalized from workflow
- **dependencies**: Array of task IDs this task depends on
- **parentTaskId**: Optional parent for subtasks
- **order**: Order among siblings
- **status**: Current state (`pending`, `in_progress`, `completed`, `failed`)
- **completedAt** / **failedAt**: Timestamps for terminal states
- **metadata**: Arbitrary key-value pairs
- **createdAt** / **updatedAt**: Timestamps

## Hierarchy Rules

### Strict Ownership Model

**Rule**: Every task must belong to exactly one workflow. Every workflow must belong to exactly one strategy.

**Enforcement**: The system validates this at creation time and prevents cross-boundary operations.

**Relationship Model**:
```
Strategy (1)
  └── Workflow (1..N)
      └── Task (1..N)
```

### Subtask Rules

**Rule**: Subtasks must have their parent in the same workflow.

**Validation**: When setting `parentTaskId`, the system verifies:
- Parent task exists
- Parent task is in the same workflow
- No circular dependencies

**Why**: Prevents workflow boundary violations and maintains clear ownership.

### Dependency Rules

**Rule**: Task dependencies must reference tasks in the same workflow.

**Validation**: When setting `dependencies`, the system verifies:
- All dependency tasks exist
- All dependency tasks are in the same workflow
- No circular dependencies

**Why**: Ensures workflow execution can be self-contained and predictable.

## Creation Rules

### Use Batch Creation Only

**Rule**: Always use `create_tasks` (batch) for creating tasks. Single-item `create_task` is not available.

**Why**: Batch creation is more efficient, supports positional references, and provides consistent return values.

**Example**:
```json
{
  "tasks": [
    {
      "name": "Design cache schema",
      "description": "Define data structures for caching",
      "workflowId": "workflow-123"
    },
    {
      "name": "Implement cache layer",
      "dependencies": ["task-1"],
      "workflowId": "workflow-123"
    },
    {
      "name": "Add cache invalidation",
      "dependencies": ["task-2"],
      "workflowId": "workflow-123"
    }
  ],
  "workflowId": "workflow-123",
  "deduplication": "skip"
}
```

### Positional References

**Rule**: Use positional references (`task-1`, `task-2`, etc.) for `dependencies` and `parentTaskId` within the same batch.

**Why**: Enables expressing task relationships without knowing real IDs in advance.

**Example**:
```json
{
  "tasks": [
    { "name": "Setup database" },  // Becomes task-1
    { "name": "Create tables", "dependencies": ["task-1"] },  // Depends on task-1
    { "name": "Seed data", "dependencies": ["task-2"] },  // Depends on task-2
    { "name": "Add indexes", "parentTaskId": "task-2" }  // Subtask of task-2
  ],
  "workflowId": "workflow-123"
}
```

### Deduplication Strategies

**Rule**: Choose appropriate deduplication strategy based on use case.

**Options**:
- **`skip`** (default): Reuse existing task with same normalized name
- **`error`**: Fail if duplicate exists
- **`overwrite`**: Update existing task in-place (resets status to pending)

**When to use each**:
- `skip`: When you want to avoid duplicates and reuse existing tasks
- `error`: When duplicates indicate a problem and should be caught
- `overwrite`: When you want to reset/update existing tasks

**Overwrite Behavior**:
- Keeps the same task ID
- Resets status to `pending` (or provided status)
- Clears `completedAt` and `failedAt`
- Updates name, description, order, metadata
- Dependencies and parentTaskId are resolved in second pass

### Name-Based Resolution

**Rule**: Can use existing task IDs or names for `dependencies` and `parentTaskId` (not just positional refs).

**Why**: Enables attaching new tasks to existing workflow structure.

**Feature**: Uses normalized name matching for robustness.

## Execution Rules

### Workflow Execution Lifecycle

**Rule**: Use `start_workflow_execution` to begin execution, then `advance_workflow_run` to progress.

**Lifecycle**:
1. **Start**: `start_workflow_execution` creates a workflow run
2. **Execute**: Agent executes ready tasks (no pending dependencies)
3. **Advance**: `advance_workflow_run` marks completed tasks, unlocks new ready tasks
4. **Complete**: When all tasks are completed or failed

**Workflow Run Properties**:
- **id**: Unique run identifier
- **workflowId**: Reference to workflow
- **status**: `running`, `completed`, `failed`
- **readyTasks**: Tasks currently ready for execution
- **completedTasks**: Tasks that have completed
- **failedTasks**: Tasks that have failed
- **createdAt** / **updatedAt**: Timestamps

### Ready Tasks

**Rule**: A task is "ready" when:
- Status is `pending`
- All dependencies are completed
- No circular dependencies

**Tool**: `getReadyTasks` returns currently ready tasks for a workflow.

**Usage Pattern**:
```json
// 1. Start execution
start_workflow_execution({ "workflowId": "workflow-123" })
// Returns: { runId, readyTasks: ["task-1", "task-3"] }

// 2. Execute ready tasks (agent does work)

// 3. Mark tasks as completed
update_task({ "id": "task-1", "status": "completed" })
update_task({ "id": "task-3", "status": "completed" })

// 4. Advance to unlock next tasks
advance_workflow_run({ "runId": "run-456" })
// Returns: { newlyReadyTasks: ["task-2"], newlyCompletedTasks: ["task-1", "task-3"] }
```

### Task Status Transitions

**Valid Transitions**:
- `pending` → `in_progress` (when starting execution)
- `in_progress` → `completed` (when finished successfully)
- `in_progress` → `failed` (when execution fails)
- `failed` → `pending` (when retrying)
- `completed` → `pending` (when re-running)

**Timestamps**:
- `completedAt`: Set when status → `completed`
- `failedAt`: Set when status → `failed`

### Auto-Completion of Parent Tasks

**Rule**: When a subtask is marked as `completed`, the system automatically checks if all sibling subtasks are also completed. If so, the parent task is automatically marked as `completed`.

**Behavior**:
- Triggered when any task's status is updated to `completed`
- Checks if all subtasks of the parent are completed
- If all subtasks are completed, parent status → `completed`
- Sets `completedAt` and `updatedAt` timestamps on parent
- Recursively propagates up the hierarchy (grandparent, great-grandparent, etc.)

**Example**:
```json
// Parent task with 3 subtasks
Task: "Implement API" (pending)
├── Subtask 1: "Design endpoints" (completed)
├── Subtask 2: "Implement auth" (completed)
└── Subtask 3: "Add rate limiting" (in_progress)

// When Subtask 3 is marked as completed:
update_task({ "id": "task-3", "status": "completed" })
// → Parent "Implement API" automatically becomes completed
// → If parent has a parent, that grandparent is also checked
```

**Why**: Enables hierarchical task completion without manual parent status updates.

## Hierarchy Management

### Subtask Creation

**Rule**: Use `parentTaskId` to create subtasks. Subtasks must be in the same workflow as parent.

**Example**:
```json
{
  "tasks": [
    { "name": "Implement API" },  // Parent
    { "name": "Design endpoints", "parentTaskId": "task-1" },  // Subtask
    { "name": "Implement auth", "parentTaskId": "task-1" },  // Subtask
    { "name": "Add rate limiting", "parentTaskId": "task-1" }  // Subtask
  ],
  "workflowId": "workflow-123"
}
```

### Task Ordering

**Rule**: Use `order` to specify order among sibling tasks (same parent).

**Default**: Tasks are ordered by creation time if `order` is not specified.

**Example**:
```json
{
  "tasks": [
    { "name": "Step 1", "order": 1 },
    { "name": "Step 2", "order": 2 },
    { "name": "Step 3", "order": 3 }
  ],
  "workflowId": "workflow-123"
}
```

### Moving Tasks

**Rule**: Use `move_task` to change a task's parent or order.

**Parameters**:
- **taskId**: Task to move
- **newParentTaskId**: New parent (null to remove parent)
- **order**: New order among siblings

**Validation**: Ensures new parent is in same workflow.

## Best Practices

### 1. Structure Workflows by Goal

- Each workflow should represent one cohesive goal
- Break large goals into multiple workflows
- Use strategies to group related workflows

### 2. Use Batch Creation

- Always create multiple related tasks in one `create_tasks` call
- Use positional references for dependencies and subtasks
- Leverage deduplication to avoid redundant tasks

### 3. Design Dependencies Carefully

- Keep dependency graphs shallow when possible
- Avoid circular dependencies (system will reject them)
- Use subtasks for related work, dependencies for sequential work

### 4. Track Execution Progress

- Use `getReadyTasks` to know what to execute next
- Use `advance_workflow_run` to progress through workflow
- Use `get_workflow_run_status` for full picture

### 5. Handle Failures Gracefully

- Mark failed tasks with appropriate status
- Use `spawn_tot_from_task` to reason about failures
- Retry failed tasks by resetting status to `pending`

### 6. Maintain Workflow Boundaries

- Never reference tasks from other workflows
- Use strategies to coordinate across workflows
- Keep workflows focused and self-contained

## Common Patterns

### Sequential Execution Pattern

```
1. create_tasks (sequential tasks with dependencies)
2. start_workflow_execution
3. getReadyTasks (get first task)
4. execute task
5. update_task (mark completed)
6. advance_workflow_run (unlock next task)
7. repeat until complete
```

### Parallel Execution Pattern

```
1. create_tasks (independent tasks, no dependencies)
2. start_workflow_execution
3. getReadyTasks (get all tasks - they're all ready)
4. execute tasks in parallel
5. update_task (mark each as completed)
6. advance_workflow_run
```

### Hierarchical Execution Pattern

```
1. create_tasks (parent + subtasks)
2. start_workflow_execution
3. getReadyTasks (get parent task)
4. execute parent (may delegate to subtasks)
5. update_task (mark parent completed)
6. advance_workflow_run
```

### Retry Pattern

```
1. get_workflow_run_status (check failed tasks)
2. spawn_tot_from_task (reason about failure)
3. promote_thought_to_tasks (create fix tasks)
4. update_task (reset failed task to pending)
5. advance_workflow_run (retry)
```

## Error Handling

### Common Errors

- **WorkflowNotFoundError**: Workflow doesn't exist
- **TaskNotFoundError**: Task doesn't exist
- **DUPLICATE_TASK**: Duplicate task name with `deduplication: "error"`
- **WORKFLOW_BOUNDARY_VIOLATION**: Task references parent/dependency in different workflow
- **DEPENDENCY_NOT_FOUND**: Dependency task doesn't exist
- **PARENT_NOT_FOUND**: Parent task doesn't exist

### Resolution

- Use `get_workflow` to verify workflow exists before creating tasks
- Use `get_task` to verify task exists before referencing it
- Use appropriate deduplication strategy
- Ensure all referenced tasks are in the same workflow
- Use normalized name matching for robust references

## Performance Considerations

### Large Workflows

- Batch creation is O(n) where n = number of tasks
- Dependency resolution is O(d) where d = number of dependencies
- Workflow execution is O(t) where t = number of tasks
- Ready task calculation is O(d) per task

### Optimization Tips

- Use batch creation for all multi-task operations
- Keep dependency graphs shallow when possible
- Use `skip` deduplication to avoid redundant processing
- Leverage positional references to avoid ID lookups
- Parallelize independent task execution

## Integration with Tree of Thoughts

### Promotion from Ideas

**Rule**: Use `promote_thought_to_tasks` to convert reasoning into executable tasks.

**When**: When ToT exploration is complete and a clear execution path is identified.

**Result**: Creates tasks with cognitive provenance linking back to source thoughts.

### Spawning from Tasks

**Rule**: Use `spawn_tot_from_task` when a task is blocked and needs deeper reasoning.

**When**: When execution fails or requires additional exploration.

**Result**: Creates a new ToT tree with provenance linking back to the task.

### Cognitive Linking

**Rule**: Use `link_thought_to_task` for soft "inspired by" or "related to" relationships.

**When**: When a thought inspires a task but isn't directly promoted.

**Result**: Creates bidirectional links for traceability without full promotion.
