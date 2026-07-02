# MCP Persistence Test Prompt

## Objective
Test the MCP thoughtflow server persistence functionality to ensure that tasks, workflows, strategies, and trees are correctly saved and loaded.

## Test Steps

### 1. Clean State
- Delete any existing `thoughtflow-state.json` file in the project directory
- Restart the MCP server to ensure clean state

### 2. Create Test Data
Create the following entities using MCP tools:

**Strategy:**
- Name: "testing-mcp"
- Description: "A strategy for testing MCP thoughtflow functionality"

**Tasks (4 tasks with different statuses):**
- Task 1: "Task 1 - Pending" (status: pending)
- Task 2: "Task 2 - In Progress" (status: in_progress)  
- Task 3: "Task 3 - Completed" (status: completed)
- Task 4: "Task 4 - Failed" (status: failed)

**Workflow:**
- Name: "Testing Workflow"
- Description: "Workflow with tasks in different statuses"
- Link all 4 tasks to this workflow

**Thought Tree:**
- Goal: "Test thoughtflow tree functionality"
- Root content: "Root thought for testing MCP thoughtflow"
- Add 2 child thoughts:
  - "First child thought exploring approach A"
  - "Second child thought exploring approach B"

**Link Entities:**
- Add the workflow to the strategy
- Add the tree to the strategy

### 3. Verify Persistence
- Wait 1-2 seconds for debounced save to complete
- Check the `thoughtflow-state.json` file in the project directory
- Verify all entities are present:
  - 4 tasks with correct statuses
  - 1 workflow with all task IDs
  - 1 strategy with workflow and tree IDs
  - 1 tree with root and 2 child thoughts

### 4. Test Soft Linking (Optional)
- Create a new task
- Create a new workflow
- Use `link_thought_to_task` to softly link the task to tree items
- Verify the soft links are persisted in the cognitive metadata

### 5. Test Strategy Deduplication
- Try to create a strategy with the same name "testing-mcp"
- Verify it returns the existing strategy instead of creating a duplicate
- If duplicates exist, use `deduplicate_strategies_and_trees` to clean up

## Expected Results

- All created entities should persist to `thoughtflow-state.json`
- File should be located in the project directory, not in user home or dist directory
- State should be shared across all services (taskService, totService, bridgeService)
- Soft links should create bidirectional cognitive metadata
- Strategy creation should be idempotent (same name = same strategy)

## Common Issues to Check

1. **Wrong file location**: State file saved to `/home/mhefny/` instead of project directory
2. **Empty state**: Tasks/workflows/strategies not persisting (independent state loading bug)
3. **Missing entities**: Some entity types not saving correctly
4. **Tool handler errors**: "not a function" errors for strategy/workflow operations
5. **Hanging tests**: Integration tests causing test suite to hang

## Files Modified During Fix

- `src/index.ts`: Fixed storage path to absolute path, added state sharing logic
- `src/services/BaseService.ts`: Added `setState()` method
- `src/registry/taskToolHandlers.ts`: Added missing workflow/strategy tool handlers
- `src/registry/totToolHandlers.ts`: Removed duplicate tool handlers
- `src/services/CognitiveBridgeService.ts`: Fixed `linkThoughtToTask` return type

## Test Commands

```bash
# Clean state


# Rebuild after code changes
npm run build

# Run tests
npm run test
```
