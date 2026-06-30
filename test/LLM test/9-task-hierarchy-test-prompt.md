# MCP Task Hierarchy Test Prompt

## Objective
Test the Task Orchestrator's parent/child task hierarchy features. Ensure that subtasks can be correctly created, retrieved, re-ordered, and re-parented using the `parentTaskId`, `get_subtasks`, and `move_task` tools.

## Test Steps

### 1. Clean State Baseline
- Clear all existing states using `clear_state`.

### 2. Create Parent and Subtasks
- Create a parent task: "Epic: Build Authentication"
- Create Subtask A using `create_task` with `parentTaskId` set to the Epic's ID. Name: "Implement Login UI". `order: 1`.
- Create Subtask B using `create_task` with `parentTaskId` set to the Epic's ID. Name: "Implement API Route". `order: 2`.
- **Verify:**
  - Both subtasks are created successfully.

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

### 6. Verify Persistence
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

## Common Issues to Check
1. **Orphaned Subtasks**: Moving a task deletes it entirely instead of moving it.
2. **Circular Dependencies**: Assigning a parent task to be a child of its own subtask causes an infinite loop (if handled, verify it throws an error).
3. **Ordering Bugs**: Changing the order fails to accurately re-sort siblings on retrieval.

## Test Commands
```bash
# Clean state
rm -f thoughtflow-state.json

# Run tests
npm run test
```
