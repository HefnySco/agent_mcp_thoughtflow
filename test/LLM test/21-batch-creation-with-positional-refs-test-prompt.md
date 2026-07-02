# MCP Batch Creation with Positional References Test Prompt

## Objective
Test the batch creation functionality with positional references for both tasks and thoughts, as per ideas-rules.md and workflow-tasks-rules.md. Ensure that positional references (task-1, task-2, idea-1, idea-2) work correctly for dependencies, parentTaskId, and parentId within the same batch.

## Test Steps

### 1. Clean State
- Delete any existing `thoughtflow-state.json` file in the project directory
- Use `clear_state` tool to ensure clean memory state

### 2. Test Task Batch Creation with Positional References
Create tasks with dependencies using positional references:

**Use create_tasks (batch):**
- Task 1: "Setup database" - Description: "Initialize database connection"
- Task 2: "Create tables" - Description: "Define schema" - Dependencies: ["task-1"]
- Task 3: "Seed data" - Description: "Populate initial data" - Dependencies: ["task-2"]
- Task 4: "Add indexes" - Description: "Create performance indexes" - Dependencies: ["task-2"]

**Verify:**
- All 4 tasks are created successfully
- Task 2 depends on Task 1 (resolved from "task-1")
- Task 3 depends on Task 2 (resolved from "task-2")
- Task 4 depends on Task 2 (resolved from "task-2")
- No circular dependencies
- idMap returned with positional ref to real ID mapping

### 3. Test Task Batch Creation with Parent-Child Using Positional References
Create hierarchical tasks using positional references:

**Use create_tasks (batch):**
- Task 1: "Implement API" - Description: "Main API implementation"
- Task 2: "Design endpoints" - Description: "Define API endpoints" - parentTaskId: "task-1"
- Task 3: "Implement auth" - Description: "Add authentication" - parentTaskId: "task-1"
- Task 4: "Add rate limiting" - Description: "Rate limiting middleware" - parentTaskId: "task-1"

**Verify:**
- All 4 tasks are created successfully
- Tasks 2, 3, 4 have parentTaskId pointing to Task 1
- get_subtasks on Task 1 returns all 3 subtasks
- Subtasks maintain correct order (or creation order if not specified)

### 4. Test Task Batch Creation with Complex Positional References
Create tasks with both dependencies and parent-child using positional references:

**Use create_tasks (batch):**
- Task 1: "Build authentication system" - Description: "Main auth feature"
- Task 2: "Design auth schema" - Description: "Database schema" - parentTaskId: "task-1"
- Task 3: "Implement login" - Description: "Login endpoint" - parentTaskId: "task-1" - Dependencies: ["task-2"]
- Task 4: "Implement logout" - Description: "Logout endpoint" - parentTaskId: "task-1" - Dependencies: ["task-2"]
- Task 5: "Add session management" - Description: "Session handling" - parentTaskId: "task-1" - Dependencies: ["task-3", "task-4"]

**Verify:**
- All 5 tasks created successfully
- Parent-child relationships correct (2,3,4,5 children of 1)
- Dependencies resolved correctly (3 depends on 2, 4 depends on 2, 5 depends on 3 and 4)
- No circular dependencies
- Complex relationships work in single batch

### 5. Test Thought Batch Creation with Positional References
Create thoughts with parent-child using positional references:

**Create Tree:**
- Goal: "Explore caching strategies"
- Root content: "What caching approach should we use?"

**Use add_ideas (batch):**
- Idea 1: "In-memory cache" - parentId: "root"
- Idea 2: "Redis backend" - parentId: "root"
- Idea 3: "LRU eviction" - parentId: "idea-1"
- Idea 4: "TTL expiration" - parentId: "idea-1"
- Idea 5: "Cluster mode" - parentId: "idea-2"

**Verify:**
- All 5 ideas created successfully
- Ideas 1 and 2 are children of root
- Ideas 3 and 4 are children of Idea 1
- Idea 5 is child of Idea 2
- Tree structure is correct
- idMap returned with positional ref to real ID mapping

### 6. Test Thought Batch Creation with Deep Hierarchy
Create deeply nested thoughts using positional references:

**Use add_ideas (batch):**
- Idea 1: "Level 1" - parentId: "root"
- Idea 2: "Level 2a" - parentId: "idea-1"
- Idea 3: "Level 2b" - parentId: "idea-1"
- Idea 4: "Level 3a" - parentId: "idea-2"
- Idea 5: "Level 3b" - parentId: "idea-2"
- Idea 6: "Level 4" - parentId: "idea-4"

**Verify:**
- All 6 ideas created successfully
- Hierarchy depth is correct (root → 1 → 2 → 4 → 6)
- All parent-child relationships resolved
- No depth limit violations (within maxDepth)

### 7. Test Deduplication with Positional References
Test that deduplication works with positional references:

**Use create_tasks with deduplication: "skip":**
- Task 1: "Unique task 1"
- Task 2: "Unique task 2"
- Task 3: "Unique task 1" - (duplicate of Task 1)

**Verify:**
- Only 2 tasks created (Task 1 and Task 2)
- Task 3 skipped due to deduplication
- idMap shows idea-3 maps to same ID as idea-1

**Use create_tasks with deduplication: "error":**
- Task 1: "Unique task 1"
- Task 2: "Unique task 2"
- Task 3: "Unique task 1" - (duplicate of Task 1)

**Verify:**
- Operation fails with duplicate error
- No tasks created (or partial rollback)
- Error message indicates duplicate detected

**Use create_tasks with deduplication: "overwrite":**
- Task 1: "Unique task 1" - Description: "Original"
- Task 2: "Unique task 2"
- Task 3: "Unique task 1" - Description: "Updated" - (overwrites Task 1)

**Verify:**
- Task 1 is overwritten with new description
- Task 1 status reset to pending
- Task 1 ID remains the same
- idMap shows idea-3 maps to same ID as idea-1

### 8. Test Name-Based Resolution with Positional References
Test that existing entity names can be used in positional references:

**Create Initial Tasks:**
- Create task named "Database Setup"

**Use create_tasks (batch) with name reference:**
- Task 1: "Database Setup" - (reference to existing task)
- Task 2: "Create tables" - Dependencies: ["Database Setup"]

**Verify:**
- Task 1 resolves to existing "Database Setup" task
- Task 2 depends on the existing task
- Fuzzy matching works for name resolution

### 9. Test Error Handling for Invalid Positional References
Test that invalid positional references are handled gracefully:

**Use create_tasks with invalid reference:**
- Task 1: "Valid task"
- Task 2: "Invalid dependency" - Dependencies: ["task-99"] - (non-existent)

**Verify:**
- Operation fails with clear error
- Error message indicates invalid reference
- No partial state created

### 10. Verify Persistence
- Wait 1-2 seconds for debounced save
- Check `thoughtflow-state.json`
- Verify:
  - All batch-created entities persisted
  - Positional reference relationships persisted as real IDs
  - Hierarchy structures maintained
  - Dependencies persisted correctly

## Expected Results

- Batch creation works for both tasks and thoughts
- Positional references (task-1, idea-1) resolve correctly within batch
- Dependencies and parent-child relationships work with positional refs
- Deduplication strategies (skip/error/overwrite) work with batch creation
- Name-based resolution works for existing entities
- Invalid references are caught with clear errors
- All batch operations persist correctly
- idMap provides mapping from positional refs to real IDs

## Common Issues to Check

1. **Positional ref not resolved**: "task-1" not replaced with real ID
2. **Circular dependency**: Positional refs create circular dependencies
3. **Parent not found**: parentTaskId/parentId reference invalid
4. **Deduplication fails**: Duplicate not detected or handled incorrectly
5. **Name resolution fails**: Existing entity name not found via fuzzy match
6. **Partial creation**: Batch fails partway through, leaving partial state
7. **idMap incorrect**: Mapping from positional refs to real IDs is wrong
8. **Depth limit exceeded**: Positional refs create hierarchy beyond maxDepth
9. **Order not preserved**: Sibling order not maintained with positional refs
10. **Persistence failure**: Batch-created relationships not persisted

## Test Commands

```bash
# Clean state
rm -f thoughtflow-state.json

# Rebuild after code changes
npm run build

# Run tests
npm run test
```
