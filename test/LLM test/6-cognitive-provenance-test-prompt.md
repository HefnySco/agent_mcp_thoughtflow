# MCP Cognitive Provenance Test Prompt

## Objective
Test the MCP thoughtflow cognitive provenance functionality to ensure cognitive links, provenance chains, and bidirectional metadata tracking work correctly across all cognitive bridge operations.

## Test Steps

### 1. Clean State
- Delete any existing `thoughtflow-state.json` file in the project directory
- Restart the MCP server to ensure clean state

### 2. Test Basic Cognitive Linking
Create a simple cognitive link between thought and task:

**Create Task:**
- Name: "Implementation Task"
- Description: "Task to implement a feature"

**Create Thought:**
- Name: "Design Thought"
- Content: "Design approach for the feature"

**Link Thought to Task:**
- Use `link_thought_to_task`
- Reason: "This thought inspired the implementation task"

**Verify:**
- Task has `linkedThoughtIds` in cognitive metadata
- Thought has `linkedTaskIds` in cognitive metadata
- Cognitive link created in `cognitiveLinks` section
- Link has type "link" with fromId, toId, reason, timestamp

### 3. Test Provenance Chain Tracking
Create a chain of cognitive links:

**Create Task 1:**
- Name: "Research Task"
- Description: "Initial research"

**Create Thought 1:**
- Name: "Research Finding"
- Content: "Key finding from research"

**Link Thought 1 to Task 1:**
- Reason: "Research finding led to this task"

**Create Task 2:**
- Name: "Design Task"
- Description: "Design based on research"

**Link Task 1 to Task 2:**
- Use dependencies or create a cognitive link
- Reason: "Research task informed design task"

**Create Thought 2:**
- Name: "Design Decision"
- Content: "Design decision based on research"

**Link Thought 2 to Task 2:**
- Reason: "Design decision guides implementation"

**Verify:**
- Provenance chain is built across multiple entities
- Each link has correct type and reason
- Chain can be traced from origin to final task
- `get_cognitive_provenance` returns the full chain

### 4. Test Promotion Provenance
Test provenance tracking when promoting thoughts to tasks:

**Create Tree:**
- Goal: "Explore implementation approaches"
- Root and child thoughts

**Promote Thought to Task:**
- Use `promote_thought_to_tasks`
- Verify cognitive metadata:
  - Task has `sourceThoughtId` and `sourceTreeId`
  - Thought has `promotedToTaskIds`
  - Promotion timestamp recorded
  - Cognitive link of type "thought_to_task" created

**Verify:**
- Provenance from thought to task is tracked
- Bidirectional metadata maintained
- Link type distinguishes promotion from regular linking

### 5. Test Spawning Provenance
Test provenance tracking when spawning thoughts from tasks:

**Create Task:**
- Name: "Blocked Task"
- Description: "Task needing deeper reasoning"

**Spawn Tree from Task:**
- Use `spawn_tot_from_task`
- Verify cognitive metadata:
  - Task has `explorationTreeIds`
  - Tree has `sourceTaskId` in metadata
  - Spawning timestamp recorded
  - Cognitive link of type "task_to_thought" created

**Verify:**
- Provenance from task to tree is tracked
- Tree root has source task in metadata
- Link type distinguishes spawning from regular linking

### 6. Test Bidirectional Sync
Test that cognitive metadata stays in sync:

**Link Thought to Task:**
- Create initial link

**Update Task:**
- Modify task description or status
- Verify cognitive metadata is preserved

**Update Thought:**
- Modify thought content or evaluation
- Verify cognitive metadata is preserved

**Verify:**
- Updates to either entity don't break cognitive links
- Bidirectional references remain valid
- Sync status remains "synced"

### 7. Test Provenance Chain Retrieval
Test retrieving provenance chains:

**Use `get_cognitive_provenance`:**
- Get provenance for a task
- Get provenance for a thought
- Verify chain includes all linked entities
- Check chain includes correct types and reasons

**Verify:**
- Chain is complete and accurate
- All intermediate entities are included
- Temporal order is preserved
- Reasons and timestamps are correct

### 8. Test Complex Provenance Networks
Create a complex network of cognitive links:

**Create multiple tasks and thoughts**
**Link them in various patterns:**
- One-to-many: one thought linked to multiple tasks
- Many-to-one: multiple thoughts linked to one task
- Chain: A → B → C → D
- Branch: A → B, A → C, B → D, C → D

**Verify:**
- All link patterns are supported
- Network structure is preserved
- Provenance chains work through branches
- No circular dependencies cause issues

### 9. Test Provenance Persistence
Verify all provenance data persists:

- Wait 1-2 seconds for debounced save
- Check `thoughtflow-state.json`
- Verify:
  - All cognitive links in `cognitiveLinks` section
  - All cognitive metadata in entity metadata
  - Provenance chains preserved
  - Timestamps and reasons intact
  - Link types correct

### 10. Test Provenance After Entity Operations
Test that provenance survives entity operations:

**Move task with parent:**
- Move a task that has cognitive links
- Verify links are preserved

**Promote linked thought:**
- Promote a thought that has links
- Verify links are updated or preserved

**Delete entity (if supported):**
- Delete an entity with links
- Verify links are cleaned up or marked as broken

**Verify:**
- Provenance survives legitimate operations
- Broken links are handled gracefully
- Metadata remains consistent

## Expected Results

- Cognitive links are created with correct metadata
- Provenance chains track entity relationships
- Promotion and spawning have distinct link types
- Bidirectional metadata stays in sync
- Provenance retrieval returns complete chains
- Complex link networks are supported
- All provenance data persists correctly
- Provenance survives entity operations

## Common Issues to Check

1. **Links not created**: Cognitive links section empty after linking
2. **Metadata missing**: Entity cognitive metadata not updated
3. **Chain incomplete**: Provenance chain missing intermediate entities
4. **Bidirectional broken**: One side has metadata, other doesn't
5. **Type confusion**: Promotion/spawning links not distinguished
6. **Sync status wrong**: Sync status not updated after operations
7. **Circular dependency**: Circular links cause infinite loops
8. **Persistence failure**: Provenance lost after restart
9. **Orphaned links**: Links remain after entity deletion
10. **Network corruption**: Complex networks become inconsistent

## Test Commands

```bash
# Clean state


# Rebuild after code changes
npm run build

# Run tests
npm run test
```
