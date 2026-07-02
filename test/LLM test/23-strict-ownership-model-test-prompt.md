# MCP Strict Ownership Model Test Prompt

## Objective
Test the strict ownership model for workflows and tasks as per workflow-tasks-rules.md. Ensure that tasks belong to exactly one workflow, workflows belong to exactly one strategy, and cross-strategy isolation is enforced. Test boundary validation and ownership transfer operations.

## Test Steps

### 1. Clean State
- Delete any existing `thoughtflow-state.json` file in the project directory
- Use `clear_state` tool to ensure clean memory state

### 2. Test Workflow Ownership
Test that workflows belong to exactly one strategy:

**Create Strategy:**
- Create strategy: "Development Strategy"

**Create Workflow:**
- Create workflow: "API Development" - strategyId: "Development Strategy"

**Verify:**
- Workflow has strategyId pointing to "Development Strategy"
- Workflow is listed under the strategy
- Cannot create workflow without strategyId

**Try to Create Workflow without Strategy:**
- Attempt to create workflow without strategyId

**Verify:**
- Operation fails with validation error
- Error message indicates strategyId is required

### 3. Test Task Ownership
Test that tasks belong to exactly one workflow:

**Create Workflow:**
- Create workflow: "Database Migration" - strategyId: "Development Strategy"

**Create Tasks:**
- Use `create_tasks`:
  - Task 1: "Backup database"
  - Task 2: "Run migration script"
  - Task 3: "Verify data integrity"

**Add Tasks to Workflow:**
- Use `create_workflow` with taskIds: [task-1, task-2, task-3]

**Verify:**
- All tasks have workflowId pointing to "Database Migration"
- Tasks are listed in the workflow
- Tasks cannot be in multiple workflows simultaneously

### 4. Test Cross-Strategy Isolation
Test that tasks and workflows cannot be shared across strategies:

**Create Strategy A:**
- Create strategy: "Strategy A"

**Create Strategy B:**
- Create strategy: "Strategy B"

**Create Workflow in Strategy A:**
- Create workflow: "Workflow A" - strategyId: "Strategy A"

**Try to Add Workflow to Strategy B:**
- Attempt to add "Workflow A" to "Strategy B"

**Verify:**
- Operation fails with validation error
- Error message indicates workflow already belongs to another strategy
- Workflow remains only in Strategy A

**Create Task in Workflow A:**
- Create task: "Task A" - workflowId: "Workflow A"

**Try to Add Task to Workflow in Strategy B:**
- Create workflow: "Workflow B" - strategyId: "Strategy B"
- Attempt to add "Task A" to "Workflow B"

**Verify:**
- Operation fails with validation error
- Error message indicates task already belongs to another workflow
- Task remains only in Workflow A

### 5. Test Task Removal from Workflow
Test that tasks can be removed from their workflow:

**Create Workflow:**
- Create workflow: "Feature Implementation" - strategyId: "Development Strategy"

**Add Tasks:**
- Create tasks and add to workflow

**Remove Task:**
- Use `remove_task_from_workflow` to remove a task

**Verify:**
- Task is removed from workflow
- Task's workflowId is cleared (or set to null)
- Task still exists in system
- Task can be added to a different workflow

### 6. Test Workflow Removal from Strategy
Test that workflows can be removed from their strategy:

**Create Strategy:**
- Create strategy: "Test Strategy"

**Add Workflow:**
- Create workflow: "Test Workflow" - strategyId: "Test Strategy"

**Remove Workflow:**
- Use `remove_workflow_from_strategy` to remove workflow

**Verify:**
- Workflow is removed from strategy
- Workflow's strategyId is cleared (or set to null)
- Workflow still exists in system
- Workflow can be added to a different strategy

### 7. Test Ownership Transfer
Test that ownership can be transferred between strategies:

**Create Strategy A:**
- Create strategy: "Original Strategy"

**Create Strategy B:**
- Create strategy: "New Strategy"

**Create Workflow in Strategy A:**
- Create workflow: "Transferable Workflow" - strategyId: "Original Strategy"

**Transfer Workflow:**
- Remove workflow from Strategy A
- Add workflow to Strategy B

**Verify:**
- Workflow removed from Strategy A
- Workflow added to Strategy B
- Workflow's strategyId updated to "New Strategy"
- All tasks in workflow remain with the workflow
- No data loss during transfer

### 8. Test Cascade Deletion Protection
Test that deleting a strategy doesn't delete its workflows (soft delete):

**Create Strategy:**
- Create strategy: "Deletable Strategy"

**Add Workflow:**
- Create workflow: "Protected Workflow" - strategyId: "Deletable Strategy"

**Add Tasks:**
- Add tasks to workflow

**Delete Strategy:**
- Use `delete_strategy` on "Deletable Strategy"

**Verify:**
- Strategy is soft-deleted (marked as deleted)
- Workflow is NOT deleted
- Tasks are NOT deleted
- Workflow and tasks still accessible
- Strategy can be restored

**Restore Strategy:**
- Use `restore_deleted` to restore strategy

**Verify:**
- Strategy restored to active state
- Workflow still associated with strategy
- Ownership maintained

### 9. Test Subtask Ownership Inheritance
Test that subtasks inherit workflow ownership from parent:

**Create Workflow:**
- Create workflow: "Parent Task Workflow" - strategyId: "Development Strategy"

**Create Parent Task:**
- Create task: "Parent Task" - workflowId: "Parent Task Workflow"

**Create Subtasks:**
- Use `create_tasks`:
  - Task 1: "Subtask 1" - parentTaskId: "Parent Task"
  - Task 2: "Subtask 2" - parentTaskId: "Parent Task"

**Add Subtasks to Workflow:**
- Add subtasks to same workflow

**Verify:**
- Subtasks have same workflowId as parent
- Subtasks cannot be in different workflow than parent
- Ownership hierarchy is consistent

**Try to Move Subtask to Different Workflow:**
- Create workflow: "Different Workflow" - strategyId: "Development Strategy"
- Attempt to move subtask to different workflow

**Verify:**
- Operation fails with validation error
- Error message indicates subtask must be in same workflow as parent
- Subtask remains in parent's workflow

### 10. Test Tree Ownership
Test that trees belong to exactly one strategy:

**Create Strategy:**
- Create strategy: "Research Strategy"

**Create Tree:**
- Create tree: "Research Tree" - strategyId: "Research Strategy"

**Verify:**
- Tree has strategyId pointing to "Research Strategy"
- Tree is listed under the strategy
- Cannot create tree without strategyId

**Try to Add Tree to Another Strategy:**
- Create strategy: "Another Strategy"
- Attempt to add "Research Tree" to "Another Strategy"

**Verify:**
- Operation fails with validation error
- Error message indicates tree already belongs to another strategy
- Tree remains only in "Research Strategy"

### 11. Test Cross-Strategy Cognitive Links
Test that cognitive links work across strategies but maintain ownership:

**Create Strategy A:**
- Create strategy: "Strategy A"

**Create Strategy B:**
- Create strategy: "Strategy B"

**Create Workflow in Strategy A:**
- Create workflow: "Workflow A" - strategyId: "Strategy A"
- Create task: "Task A" - workflowId: "Workflow A"

**Create Tree in Strategy B:**
- Create tree: "Tree B" - strategyId: "Strategy B"
- Create thought: "Thought B" - parentId: "root"

**Link Thought to Task:**
- Use `link_thought_to_task` to link Thought B to Task A

**Verify:**
- Link is created successfully
- Thought B remains in Strategy B
- Task A remains in Strategy A
- Cognitive link crosses strategy boundaries
- Ownership of each entity is maintained

### 12. Test Ownership Validation on Update
Test that ownership cannot be changed via update:

**Create Workflow:**
- Create workflow: "Valid Workflow" - strategyId: "Strategy A"

**Try to Update strategyId:**
- Use `update_workflow` to change strategyId to "Strategy B"

**Verify:**
- Operation fails with validation error
- Error message indicates strategyId cannot be changed directly
- Must use remove/add workflow operations for transfer

### 13. Verify Persistence
- Wait 1-2 seconds for debounced save
- Check `thoughtflow-state.json`
- Verify:
  - Ownership relationships persisted
  - strategyId fields correct for workflows and trees
  - workflowId fields correct for tasks
  - Cross-strategy isolation maintained
  - Soft-deleted strategies marked correctly

## Expected Results

- Workflows belong to exactly one strategy
- Tasks belong to exactly one workflow
- Trees belong to exactly one strategy
- Cross-strategy isolation enforced
- Ownership transfer works via remove/add operations
- Cascade deletion protected (soft delete)
- Subtasks inherit workflow ownership
- Cognitive links can cross strategies
- Direct ownership updates are blocked
- All ownership rules persist correctly

## Common Issues to Check

1. **Ownership not enforced**: Entity can be in multiple workflows/strategies
2. **Transfer fails**: Cannot move entity between strategies
3. **Cascade deletion**: Deleting strategy deletes workflows/tasks
4. **Subtask ownership**: Subtask can be in different workflow than parent
5. **Cross-strategy links blocked**: Cannot link across strategies
6. **Direct update allowed**: Can change strategyId via update
7. **Orphaned entities**: Remove operation leaves orphans
8. **Soft delete not working**: Delete permanently removes entities
9. **Restore fails**: Cannot restore deleted strategy
10. **Persistence failure**: Ownership not persisted correctly

## Test Commands

```bash
# Clean state


# Rebuild after code changes
npm run build

# Run tests
npm run test
```
