# MCP Strategy Organization Test Prompt

## Objective
Test the MCP thoughtflow strategy organization functionality to ensure strategies can organize multiple workflows and trees, maintain isolation between strategies, and support complex organizational structures.

## Test Steps

### 1. Clean State
- Delete any existing `thoughtflow-state.json` file in the project directory
- Restart the MCP server to ensure clean state

### 2. Create Strategy A with Multiple Workflows
Create a strategy with multiple workflows:

**Strategy A:**
- Name: "Strategy A - Development"
- Description: "Strategy for software development workflow"

**Workflow A1:**
- Name: "Development Workflow - Backend"
- Description: "Backend development tasks"
- Create 3 tasks for backend development
- Link to Strategy A

**Workflow A2:**
- Name: "Development Workflow - Frontend"
- Description: "Frontend development tasks"
- Create 3 tasks for frontend development
- Link to Strategy A

**Tree A1:**
- Name: "Architecture Decisions Tree"
- Goal: "Explore backend architecture options"
- Create with root and child thoughts
- Link to Strategy A

**Verify:**
- Strategy A has 2 workflows and 1 tree
- All entities are linked correctly
- Strategy metadata shows correct IDs

### 3. Create Strategy B with Different Workflows
Create a separate strategy:

**Strategy B:**
- Name: "Strategy B - Testing"
- Description: "Strategy for testing and QA workflow"

**Workflow B1:**
- Name: "Testing Workflow - Unit Tests"
- Description: "Unit testing tasks"
- Create 3 tasks for unit testing
- Link to Strategy B

**Workflow B2:**
- Name: "Testing Workflow - Integration Tests"
- Description: "Integration testing tasks"
- Create 3 tasks for integration testing
- Link to Strategy B

**Tree B1:**
- Name: "Test Strategy Tree"
- Goal: "Explore testing approaches"
- Create with root and child thoughts
- Link to Strategy B

**Verify:**
- Strategy B has 2 workflows and 1 tree
- All entities are linked correctly
- Strategy B is independent from Strategy A

### 4. Test Cross-Strategy Isolation
Verify that workflows in different strategies are isolated:

**Create Workflow A1 with Tasks:**
- Task A1-1: "Backend API Task"
- Task A1-2: "Database Task"
- Task A1-3: "Authentication Task"
- Link all tasks to Workflow A1
- Link Workflow A1 to Strategy A

**Create Workflow B1 with Tasks:**
- Task B1-1: "Unit Test Task"
- Task B1-2: "Integration Test Task"
- Task B1-3: "E2E Test Task"
- Link all tasks to Workflow B1
- Link Workflow B1 to Strategy B

**Attempt Cross-Strategy Task Sharing:**
- Try to create a new workflow with tasks from both Strategy A and Strategy B
- Try to add Task A1-1 to Workflow B1
- Try to add Task B1-1 to Workflow A1
- Expected: These operations should fail or be prevented
- Workflows should only contain tasks from their own strategy context

**Verify Isolation:**
- Tasks cannot be shared between workflows in different strategies
- Each workflow maintains its own task list
- Strategy isolation is enforced at the workflow level
- Task IDs in Workflow A1 only reference tasks created for Strategy A
- Task IDs in Workflow B1 only reference tasks created for Strategy B
- No cross-contamination between strategy workspaces

### 5. Test Strategy Deduplication
Test that strategies with similar names are handled correctly:

**Create Strategy C:**
- Name: "Strategy A - Development" (same as Strategy A)
- Description: "Duplicate strategy name test"

**Verify:**
- Either returns existing Strategy A (idempotent)
- Or creates a new strategy with different ID
- Use `deduplicate_strategies_and_trees` if duplicates exist

### 6. Test Removing Entities from Strategy
Test removing workflows and trees from strategies:

**Remove Workflow A2 from Strategy A:**
- Use `remove_workflow_from_strategy`
- Verify Workflow A2 is no longer in Strategy A's workflowIds

**Remove Tree A1 from Strategy A:**
- Use `remove_tree_from_strategy`
- Verify Tree A1 is no longer in Strategy A's treeIds

**Verify:**
- Removed entities are still in the system (not deleted)
- They are just unlinked from the strategy
- Strategy metadata updates correctly

### 7. Test Complex Strategy Structure
Create a strategy with mixed entity types:

**Strategy C:**
- Name: "Strategy C - Complex"
- Description: "Strategy with complex organization"

**Add multiple entities:**
- 3 workflows with different task counts
- 2 trees with different structures
- Mix of pending, in-progress, and completed tasks

**Verify:**
- Strategy can handle many entities
- All entity types are tracked correctly
- Strategy metadata is accurate

### 8. Test Strategy Status and Metadata
Update strategy metadata:

**Update Strategy A:**
- Add custom metadata fields
- Update description
- Verify metadata persists

**Verify:**
- Strategy metadata is preserved
- Custom fields are stored correctly
- Updates persist across restarts

### 9. Verify Persistence
- Wait 1-2 seconds for debounced save to complete
- Check the `thoughtflow-state.json` file
- Verify all strategy data persisted:
  - Multiple strategies with correct IDs
  - Each strategy has correct workflow and tree lists
  - Cross-strategy isolation maintained
  - Removed entities unlinked but not deleted
  - Strategy metadata preserved

## Expected Results

- Strategies can organize multiple workflows and trees
- Strategies maintain isolation from each other
- Tasks cannot be shared between workflows in different strategies
- Strategy deduplication works correctly
- Removing entities from strategies unlinks but doesn't delete
- Complex strategy structures are handled correctly
- Strategy metadata persists correctly
- All strategy organization state persists

## Common Issues to Check

1. **Cross-strategy leakage**: Tasks from one strategy appearing in another
2. **Workflow isolation broken**: Workflows sharing tasks across strategies
3. **Deduplication failing**: Duplicate strategies created with same name
4. **Remove deletes entity**: Removing from strategy deletes the entity instead of unlinking
5. **Metadata not persisting**: Strategy metadata lost after reload
6. **Entity list corruption**: Workflow/tree IDs inconsistent in strategy
7. **Complex structure failure**: Strategy fails with many entities
8. **Isolation not enforced**: Cross-strategy operations allowed when they shouldn't be

## Test Commands

```bash
# Clean state


# Rebuild after code changes
npm run build

# Run tests
npm run test
```
