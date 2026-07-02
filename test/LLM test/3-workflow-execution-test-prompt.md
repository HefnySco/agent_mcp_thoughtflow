# MCP Workflow Execution Test Prompt

## Objective
Test the MCP thoughtflow workflow execution functionality to ensure tasks execute in correct order based on dependencies, workflow runs track progress, and execution state persists correctly.

## Test Steps

### 1. Clean State
- Delete any existing `thoughtflow-state.json` file in the project directory
- Restart the MCP server to ensure clean state

### 2. Create Sequential Workflow
Create a workflow with sequential task dependencies:

**Task A (Prerequisite):**
- Name: "Task A - Setup"
- Description: "Initial setup task"
- Status: pending

**Task B (Depends on A):**
- Name: "Task B - Process"
- Description: "Processing task that needs A to complete"
- Status: pending
- Dependencies: ["task-a-id"]

**Task C (Depends on B):**
- Name: "Task C - Finalize"
- Description: "Finalization task that needs B to complete"
- Status: pending
- Dependencies: ["task-b-id"]

**Workflow:**
- Name: "Sequential Workflow"
- Description: "Workflow with sequential task dependencies"
- Task IDs: [task-a-id, task-b-id, task-c-id]

### 3. Start Workflow Execution
- Use `start_workflow_execution` on the sequential workflow
- Verify a workflow run is created
- Check that tasks execute in order: A → B → C

### 4. Create Parallel Workflow
Create a workflow with parallel task execution:

**Task X:**
- Name: "Task X - Independent 1"
- Description: "Independent task 1"
- Status: pending

**Task Y:**
- Name: "Task Y - Independent 2"
- Description: "Independent task 2"
- Status: pending

**Task Z (Depends on X and Y):**
- Name: "Task Z - Merge"
- Description: "Merge task that needs both X and Y"
- Status: pending
- Dependencies: ["task-x-id", "task-y-id"]

**Workflow:**
- Name: "Parallel Workflow"
- Description: "Workflow with parallel task execution"
- Task IDs: [task-x-id, task-y-id, task-z-id]

### 5. Start Parallel Workflow Execution
- Use `start_workflow_execution` on the parallel workflow
- Verify a workflow run is created
- Check that X and Y can execute in parallel, then Z executes after both complete

### 6. Test Workflow Run Tracking
- Use `list_workflow_runs` to see all workflow runs
- Use `get_workflow_run` to inspect specific run details
- Verify run status updates as tasks complete
- Check that task statuses are updated in the run

### 7. Test Workflow Run Advancement
- Manually complete tasks using `update_task` with status "completed"
- Use `advance_workflow_run` to progress the workflow
- Verify that dependent tasks become available after prerequisites complete

### 8. Test Failed Task Handling
- Create a workflow with a task that will fail
- Mark a task as "failed" during execution
- Verify the workflow run handles the failure correctly
- Check that dependent tasks don't execute after failure

### 9. Verify Persistence
- Wait 1-2 seconds for debounced save to complete
- Check the `thoughtflow-state.json` file
- Verify workflow runs persisted with correct state
- Verify task statuses persisted
- Verify workflow run history is maintained

## Expected Results

- Sequential workflows execute tasks in dependency order
- Parallel workflows execute independent tasks concurrently
- Workflow runs track execution progress accurately
- Task statuses update correctly during execution
- Failed tasks prevent dependent tasks from executing
- All workflow execution state persists correctly
- Workflow run history is maintained across restarts

## Common Issues to Check

1. **Wrong execution order**: Tasks not respecting dependencies
2. **Parallel execution blocked**: Independent tasks executing sequentially instead of concurrently
3. **Workflow run not created**: `start_workflow_execution` fails silently
4. **Task status not updating**: Task statuses don't change during execution
5. **Failed task not handled**: Dependent tasks execute after failure
6. **Workflow run not persisting**: Run state lost after restart
7. **Advance not working**: `advance_workflow_run` doesn't progress execution

## Test Commands

```bash
# Clean state


# Rebuild after code changes
npm run build

# Run tests
npm run test
```
