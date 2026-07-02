# MCP Cognitive Bridge Test Prompt

## Objective
Test the MCP thoughtflow cognitive bridge functionality to ensure task dependencies, parent-child relationships, thought-to-task promotion, and task-to-thought spawning work correctly.

## Test Steps

### 1. Clean State
- Delete any existing `thoughtflow-state.json` file in the project directory
- Restart the MCP server to ensure clean state

### 2. Test Task Dependencies
Create tasks with execution ordering dependencies using batch creation:

**Use create_tasks (batch):**
- Task 1: "Prerequisite Task" - Description: "Task that must complete first" - Status: pending
- Task 2: "Dependent Task" - Description: "Task that depends on prerequisite" - Status: pending - Dependencies: ["task-1"]

**Verify:**
- Dependent task has dependencies array with prerequisite task ID
- Used for workflow execution DAG scheduling

### 3. Test Parent-Child Task Relationships
Create hierarchical task organization using batch creation with positional references:

**Use create_tasks (batch):**
- Task 1: "Parent Task" - Description: "A parent task that will have subtasks" - Status: pending
- Task 2: "Subtask 1" - Description: "First subtask under parent" - Status: pending - parentTaskId: "task-1"
- Task 3: "Subtask 2" - Description: "Second subtask under parent" - Status: pending - parentTaskId: "task-1"

**Verify:**
- Subtasks have `parentTaskId` pointing to parent task
- Use `get_subtasks` to verify both subtasks under parent
- Used for task decomposition and organization

### 4. Test Promoting Thoughts to Tasks
Convert reasoning thoughts into executable tasks:

**Create Thought Tree:**
- Goal: "Test thought promotion"
- Root content: "Root thought for promotion test"
- Add child thought: "Approach to implement feature"

**Promote Thought:**
- Use `promote_thought_to_tasks` on the child thought
- Set `includeDescendants: true`
- Set `flattenHierarchy: false`
- Set `taskNamePrefix: "Feature"`

**Verify:**
- Task created with cognitive metadata:
  - `sourceThoughtId`: tracks origin thought
  - `sourceTreeId`: tracks origin tree
  - `promotedAt`: timestamp
  - `syncStatus`: "synced"
- Thought updated with `promotedToTaskIds` in metadata
- Cognitive link created of type "thought_to_task"

### 5. Test Spawning Thoughts from Tasks
Create reasoning trees from blocked tasks:

**Create Blocked Task:**
- Name: "Blocked Task for Reasoning"
- Description: "A task that needs deeper reasoning to solve"
- Status: pending

**Spawn Tree:**
- Use `spawn_tot_from_task` on the blocked task
- Goal: "Explore approaches to solve the blocked task"
- Root content: "How should I approach solving this blocked task?"

**Add Child Thoughts:**
- "Approach 1: Break down the problem into smaller steps"
- "Approach 2: Research similar problems and solutions"

**Verify:**
- New tree created with goal and root thought
- Task updated with cognitive metadata:
  - `explorationTreeIds`: array with spawned tree ID
  - `spawnedAt`: timestamp
- Tree metadata includes `sourceTaskId` and `spawnedAt`
- Cognitive link created of type "task_to_thought"

### 6. Test Sync Status Management
Test sync status transitions as per cognitive-linking.md:

**Initial State:**
- Link thought to task using `link_thought_to_task`
- Verify sync status is "synced"

**Update One Side:**
- Update task description using `update_task`
- Verify sync status changes to "outdated"

**Update Both Sides:**
- Update thought content using `add_ideas` or evaluation while task is "outdated"
- Verify sync status changes to "conflict"

**Reconcile:**
- Manually reconcile changes by updating sync status
- Update sync status back to "synced"

**Verify:**
- Sync status transitions work correctly (synced → outdated → conflict → synced)
- System tracks when entities diverge
- Conflict state is detected when both sides change
- Agents must manually manage sync status

### 7. Verify Persistence
- Wait 1-2 seconds for debounced save to complete
- Check the `thoughtflow-state.json` file in the project directory
- Verify all cognitive bridge operations persisted:
  - Task dependencies in `dependencies` arrays
  - Parent-child relationships in `parentTaskId` fields
  - Promotion metadata in task and thought cognitive metadata
  - Spawning metadata in task and tree cognitive metadata
  - Cognitive links in `cognitiveLinks` section

## Expected Results

- Task dependencies enable execution ordering (DAG-based scheduling)
- Parent-child relationships enable hierarchical task organization
- Thought-to-task promotion creates executable tasks with provenance tracking
- Task-to-thought spawning creates reasoning trees with source tracking
- All cognitive metadata persists correctly to `thoughtflow-state.json`
- Bidirectional cognitive links maintained between tasks and thoughts

## Common Issues to Check

1. **Dependencies not working**: Tasks not respecting execution order in workflows
2. **Parent-child not persisting**: `parentTaskId` not saved or lost after reload
3. **Promotion metadata missing**: Tasks don't have `sourceThoughtId` or thoughts don't have `promotedToTaskIds`
4. **Spawning metadata missing**: Tasks don't have `explorationTreeIds` or trees don't have `sourceTaskId`
5. **Cognitive links not created**: Missing entries in `cognitiveLinks` section
6. **Bidirectional sync broken**: One side has metadata but the other doesn't
7. **Sync status not updating**: Sync status doesn't change when entities are updated
8. **Conflict not detected**: System doesn't detect when both sides change without reconciliation

## Key Differences

**dependencies vs parentTaskId:**
- `dependencies`: Task execution ordering (DAG). Tasks that must complete before this task can start. Used for workflow execution.
- `parentTaskId`: Hierarchical organization (tree). Subtasks that are part of a larger task's decomposition. Used for task organization.

**Use cases:**
- `dependencies`: "Task B needs Task A's output"
- `parentTaskId`: "Task B is a sub-component of Task A"

A task can have both:
```json
{
  "dependencies": ["some-other-task"],
  "parentTaskId": "parent-task"
}
```
This means: "I'm a subtask of parent-task, but I also need some-other-task to complete first."

## Test Commands

```bash
# Clean state
rm -f thoughtflow-state.json

# Rebuild after code changes
npm run build

# Run tests
npm run test
```
