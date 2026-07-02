# MCP Task Hierarchy Test Prompt

## Objective
Test the Task Orchestrator's parent/child task hierarchy features. Ensure that subtasks can be correctly created, retrieved, re-ordered, and re-parented using the `parentTaskId`, `get_subtasks`, and `move_task` tools.

## Test Steps

### 1. Clean State Baseline
- Clear all existing states using `clear_state`.

### 2. Create Parent and Subtasks
Use batch creation with positional references:
- Create tasks using `create_tasks`:
  - Task 1: "Epic: Build Authentication" (parent)
  - Task 2: "Implement Login UI" - parentTaskId: "task-1", order: 1
  - Task 3: "Implement API Route" - parentTaskId: "task-1", order: 2
- **Verify:**
  - Both subtasks are created successfully.
  - Subtasks have correct parentTaskId and order.

### 3. Retrieve Subtasks
- Call `get_subtasks` on the Epic's ID.
- **Verify:**
  - The response contains both Subtask A and Subtask B.
  - They are returned in the correct `order`.

### 4. Move and Re-order Tasks
- Call `move_task` on Subtask B.
- Change its `order` to `0` (so it precedes Subtask A) while keeping the same `newParentTaskId`.
- Call `get_subtasks` again.
- **Verify:**
  - Subtask B now appears before Subtask A.

### 5. Re-parenting Tasks
- Create a new parent task: "Epic: Backend Setup".
- Call `move_task` on Subtask B, changing `newParentTaskId` to the "Backend Setup" Epic's ID.
- **Verify:**
  - `get_subtasks` on "Build Authentication" only returns Subtask A.
  - `get_subtasks` on "Backend Setup" returns Subtask B.

### 6. Test Auto-Completion of Parent Tasks
Test automatic parent completion when all subtasks are completed (from workflow-tasks-rules.md):

**Create Parent with Subtasks:**
- Create tasks using `create_tasks`:
  - Task 1: "Implement API" (parent)
  - Task 2: "Design endpoints" - parentTaskId: "task-1"
  - Task 3: "Implement auth" - parentTaskId: "task-1"
  - Task 4: "Add rate limiting" - parentTaskId: "task-1"

**Complete Subtasks Individually:**
- Mark Task 2 as completed
- Mark Task 3 as completed
- Verify parent (Task 1) is still pending (not all subtasks completed yet)

**Complete Last Subtask:**
- Mark Task 4 as completed
- Verify parent (Task 1) automatically becomes completed
- Verify parent's completedAt timestamp is set
- Verify parent's updatedAt timestamp is updated

**Test Recursive Propagation:**
- If parent has a grandparent, verify grandparent is also checked
- Verify completion propagates up the hierarchy

**Verify:**
- Parent auto-completes when all subtasks are completed
- completedAt timestamp is set correctly
- Propagation works recursively up the tree
- Timestamps are updated correctly

### 7. Verify Persistence
- Wait for the debounced save to complete.
- Check `thoughtflow-state.json`.
- **Verify:**
  - The `parentTaskId` field on the subtasks is accurate.
  - The hierarchy is maintained correctly on disk.

## Expected Results
- Tasks can be deeply nested via `parentTaskId`.
- Retrieving subtasks correctly maps the children of a specific parent.
- Re-parenting cleanly removes the task from the old parent's scope and adds it to the new one.
- Sibling order constraints are respected and updated correctly.
- Parent tasks auto-complete when all subtasks are completed.
- Auto-completion propagates recursively up the hierarchy.

## Common Issues to Check
1. **Orphaned Subtasks**: Moving a task deletes it entirely instead of moving it.
2. **Circular Dependencies**: Assigning a parent task to be a child of its own subtask causes an infinite loop (if handled, verify it throws an error).
3. **Ordering Bugs**: Changing the order fails to accurately re-sort siblings on retrieval.
4. **Auto-completion not working**: Parent doesn't auto-complete when all subtasks are completed.
5. **Timestamp not set**: completedAt timestamp not set when parent auto-completes.
6. **Propagation failure**: Auto-completion doesn't propagate to grandparent.

## Test Commands
```bash
# Clean state


# Run tests
npm run test
```
