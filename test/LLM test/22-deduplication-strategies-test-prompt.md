# MCP Deduplication Strategies Test Prompt

## Objective
Test the deduplication functionality for strategies, trees, tasks, and thoughts with the three deduplication modes: skip, error, and overwrite. Ensure deduplication works correctly for both batch creation and deduplication tools.

## Test Steps

### 1. Clean State
- Delete any existing `thoughtflow-state.json` file in the project directory
- Use `clear_state` tool to ensure clean memory state

### 2. Test Task Deduplication with "skip" Mode
Test that duplicate tasks are skipped when deduplication is set to "skip":

**First Batch:**
- Use `create_tasks` with deduplication: "skip":
  - Task 1: "Implement login"
  - Task 2: "Implement logout"
  - Task 3: "Implement signup"

**Verify:**
- 3 tasks created successfully
- Each task has unique ID

**Second Batch with Duplicates:**
- Use `create_tasks` with deduplication: "skip":
  - Task 1: "Implement login" - (duplicate)
  - Task 2: "Implement logout" - (duplicate)
  - Task 3: "New feature" - (unique)

**Verify:**
- Only 1 new task created ("New feature")
- Duplicates skipped
- Existing tasks unchanged
- idMap shows task-1 and task-2 map to existing IDs
- task-3 maps to new ID

### 3. Test Task Deduplication with "error" Mode
Test that duplicate tasks cause an error when deduplication is set to "error":

**First Batch:**
- Use `create_tasks` with deduplication: "error":
  - Task 1: "Database setup"
  - Task 2: "Create tables"

**Verify:**
- 2 tasks created successfully

**Second Batch with Duplicates:**
- Use `create_tasks` with deduplication: "error":
  - Task 1: "Database setup" - (duplicate)
  - Task 2: "Create tables" - (duplicate)

**Verify:**
- Operation fails with duplicate error
- Error message indicates which tasks are duplicates
- No new tasks created
- Existing tasks unchanged
- State is consistent (no partial creation)

### 4. Test Task Deduplication with "overwrite" Mode
Test that duplicate tasks are overwritten when deduplication is set to "overwrite":

**First Batch:**
- Use `create_tasks` with deduplication: "overwrite":
  - Task 1: "API design" - Description: "Original description" - Status: "completed"
  - Task 2: "API implementation"

**Verify:**
- 2 tasks created
- Task 1 has original description and completed status

**Second Batch with Overwrites:**
- Use `create_tasks` with deduplication: "overwrite":
  - Task 1: "API design" - Description: "Updated description" - Status: "pending"
  - Task 2: "API implementation" - Description: "New description"

**Verify:**
- Task 1 is overwritten:
  - Description updated to "Updated description"
  - Status reset to "pending"
  - ID remains the same
- Task 2 is overwritten:
  - Description updated to "New description"
  - ID remains the same
- updatedAt timestamp updated for both tasks

### 5. Test Thought Deduplication with "skip" Mode
Test that duplicate thoughts are skipped when deduplication is set to "skip":

**Create Tree:**
- Goal: "Test thought deduplication"
- Root content: "Root for deduplication test"

**First Batch:**
- Use `add_ideas` with deduplication: "skip":
  - Idea 1: "Approach A" - parentId: "root"
  - Idea 2: "Approach B" - parentId: "root"

**Verify:**
- 2 ideas created successfully

**Second Batch with Duplicates:**
- Use `add_ideas` with deduplication: "skip":
  - Idea 1: "Approach A" - parentId: "root" - (duplicate)
  - Idea 2: "Approach C" - parentId: "root" - (unique)

**Verify:**
- Only 1 new idea created ("Approach C")
- Duplicate "Approach A" skipped
- Existing ideas unchanged
- idMap shows idea-1 maps to existing ID

### 6. Test Thought Deduplication with "error" Mode
Test that duplicate thoughts cause an error when deduplication is set to "error":

**First Batch:**
- Use `add_ideas` with deduplication: "error":
  - Idea 1: "Strategy X" - parentId: "root"

**Verify:**
- 1 idea created successfully

**Second Batch with Duplicate:**
- Use `add_ideas` with deduplication: "error":
  - Idea 1: "Strategy X" - parentId: "root" - (duplicate)

**Verify:**
- Operation fails with duplicate error
- Error message indicates duplicate thought
- No new ideas created
- Existing ideas unchanged

### 7. Test Thought Deduplication with "overwrite" Mode
Test that duplicate thoughts are overwritten when deduplication is set to "overwrite":

**First Batch:**
- Use `add_ideas` with deduplication: "overwrite":
  - Idea 1: "Solution 1" - parentId: "root" - metadata: {"version": 1}

**Verify:**
- 1 idea created with version 1

**Second Batch with Overwrite:**
- Use `add_ideas` with deduplication: "overwrite":
  - Idea 1: "Solution 1" - parentId: "root" - metadata: {"version": 2}

**Verify:**
- Idea 1 is overwritten:
  - Metadata updated to version 2
  - ID remains the same
  - State reset to pending
  - updatedAt timestamp updated

### 8. Test Strategy Deduplication
Test the `deduplicate_strategies` tool:

**Create Duplicate Strategies:**
- Create strategy: "Development Strategy"
- Create strategy: "Development Strategy" - (duplicate by normalized name)

**Run Deduplication:**
- Call `deduplicate_strategies`

**Verify:**
- Only one "Development Strategy" remains
- First occurrence kept, duplicate removed
- Associated workflows and trees remain intact
- No orphaned entities

### 9. Test Tree Deduplication
Test the `deduplicate_trees` tool:

**Create Duplicate Trees:**
- Create tree with goal: "Explore caching"
- Create tree with goal: "Explore caching" - (duplicate by normalized goal)

**Run Deduplication:**
- Call `deduplicate_trees`

**Verify:**
- Only one tree with goal "Explore caching" remains
- First occurrence kept, duplicate removed
- Associated thoughts remain intact
- No orphaned thoughts

### 10. Test Combined Deduplication
Test the `deduplicate_strategies_and_trees` tool:

**Create Duplicate Entities:**
- Create duplicate strategies
- Create duplicate trees
- Create duplicate tasks
- Create duplicate thoughts

**Run Combined Deduplication:**
- Call `deduplicate_strategies_and_trees`

**Verify:**
- Duplicate strategies removed
- Duplicate trees removed
- Strategies and trees are deduplicated in one operation
- No orphaned entities
- State is clean

### 11. Test Deduplication with Positional References
Test that deduplication works correctly with positional references:

**Create Tasks:**
- Use `create_tasks` with deduplication: "skip":
  - Task 1: "Task A"
  - Task 2: "Task B" - Dependencies: ["task-1"]
  - Task 3: "Task A" - (duplicate)
  - Task 4: "Task C" - Dependencies: ["task-3"] - (reference to duplicate)

**Verify:**
- Task 3 skipped (duplicate)
- Task 4 dependency resolved to original Task 1
- idMap shows task-3 maps to task-1 ID
- Task 4 has correct dependency

### 12. Test Case Sensitivity in Deduplication
Test that deduplication is case-insensitive (normalized names):

**Create Tasks:**
- Task 1: "Implement Login"
- Task 2: "implement login" - (different case, should be duplicate)
- Task 3: "IMPLEMENT LOGIN" - (all caps, should be duplicate)

**Run with deduplication: "skip":**

**Verify:**
- Only Task 1 created
- Task 2 and Task 3 skipped as duplicates
- Normalization works correctly

### 13. Verify Persistence
- Wait 1-2 seconds for debounced save
- Check `thoughtflow-state.json`
- Verify:
  - Deduplicated state persisted
  - No duplicate entities in state file
  - Relationships maintained after deduplication
  - Overwritten entities have updated values

## Expected Results

- Deduplication "skip" mode reuses existing entities
- Deduplication "error" mode fails on duplicates with clear error
- Deduplication "overwrite" mode updates existing entities
- Deduplication works for tasks, thoughts, strategies, and trees
- Positional references work correctly with deduplication
- Normalization makes deduplication case-insensitive
- Deduplication tools clean up existing duplicates
- No orphaned entities after deduplication
- All deduplication operations persist correctly

## Common Issues to Check

1. **Deduplication not working**: Duplicates not detected or created
2. **Wrong mode behavior**: "skip" creates new, "error" doesn't fail, "overwrite" doesn't update
3. **Partial state**: Deduplication leaves partial state on error
4. **Orphaned entities**: Deduplication removes parents but not children
5. **Normalization failure**: Case sensitivity not handled
6. **Positional ref broken**: Deduplication breaks positional reference resolution
7. **Timestamp not updated**: Overwrite doesn't update updatedAt
8. **Status not reset**: Overwrite doesn't reset status to pending
9. **idMap incorrect**: Mapping doesn't reflect deduplication
10. **Persistence failure**: Deduplicated state not persisted

## Test Commands

```bash
# Clean state
rm -f thoughtflow-state.json

# Rebuild after code changes
npm run build

# Run tests
npm run test
```
