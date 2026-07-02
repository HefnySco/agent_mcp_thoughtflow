# MCP State Management Test Prompt

## Objective
Test the MCP thoughtflow state management functionality to ensure consistency between storage and memory, proper state clearing/reloading, and cross-service synchronization. This test aims to discover issues similar to the caching bug where deleting the state file didn't clear in-memory state.

## Test Steps

### 1. Clean State Baseline
- Delete any existing `thoughtflow-state.json` file
- Use `clear_state` tool to ensure clean state
- Verify no strategies, workflows, tasks, or trees exist
- Verify state file is deleted

### 2. State Persistence Test
Create entities and verify they persist:

**Create Test Data:**
- Create 1 strategy
- Create 2 workflows with tasks
- Create 1 tree with thoughts
- Verify all entities exist in memory

**Persistence Verification:**
- Wait for debounced save (2 seconds)
- Read `thoughtflow-state.json` directly
- Verify all entities are in the file
- Compare memory state with file state
- Expected: Exact match between memory and file

### 3. Memory-Storage Consistency Test
Test that changes in memory are reflected in storage:

**Modify Entities:**
- Update a task status
- Add a new thought to a tree
- Create a new workflow
- Wait for debounced save

**Verify Consistency:**
- Read state file
- Verify all changes are persisted
- Count entities in memory vs file
- Expected: Equal counts and matching data

### 4. State Clearing Test
Test the `clear_state` tool:

**Before Clear:**
- Create multiple entities (strategies, workflows, tasks, trees)
- Verify they exist in memory
- Verify state file exists and contains data

**Execute Clear:**
- Call `clear_state` tool
- Verify success response

**After Clear:**
- List strategies - should be empty
- List workflows - should be empty
- List tasks - should be empty
- List trees - should be empty
- Verify state file is deleted
- Expected: Complete cleanup of both memory and storage

### 5. State Reloading Test
Test the `reload_state` tool:

**Setup:**
- Create entities and save
- Manually modify `thoughtflow-state.json` (add a test entity)
- Verify memory doesn't show the manual change

**Execute Reload:**
- Call `reload_state` tool
- Verify memory now shows the manual change
- Expected: Memory syncs with file content

### 6. Cross-Service State Synchronization Test
Test that all services share the same state:

**Create via Different Services:**
- Create task via TaskOrchestratorService
- Create tree via ToTService
- Create strategy via CognitiveBridgeService

**Verify Cross-Service Access:**
- Check if ToTService can see the task
- Check if TaskOrchestratorService can see the tree
- Check if CognitiveBridgeService can see both
- Expected: All services see all entities

### 7. Concurrent State Modification Test
Test behavior when multiple services modify state simultaneously:

**Simulate Concurrent Operations:**
- Rapidly create tasks via TaskOrchestratorService
- Rapidly create thoughts via ToTService
- Rapidly create strategies via CognitiveBridgeService
- Don't wait between operations

**Verify Data Integrity:**
- Check for duplicate IDs
- Check for orphaned entities
- Verify all entities are accounted for
- Expected: No data corruption or loss

### 8. State File Corruption Recovery Test
Test behavior when state file is corrupted:

**Corrupt State File:**
- Create entities and save
- Manually corrupt `thoughtflow-state.json` (invalid JSON)
- Attempt to reload state

**Expected Behavior:**
- System should handle gracefully
- Either: return empty state with warning
- Or: fail with clear error message
- Should not crash or hang

### 9. Debounced Save Timing Test
Test that debounced save works correctly:

**Rapid Changes:**
- Create 10 tasks in quick succession (< 100ms each)
- Don't wait between creations
- Check state file immediately after last creation

**Verify Debouncing:**
- State file should not have all 10 tasks yet
- Wait for debounce period (200ms)
- Check state file again
- Expected: All 10 tasks now present

### 10. State Rollback Test
Test that failed operations don't corrupt state:

**Attempt Invalid Operation:**
- Create a workflow with non-existent task IDs
- Create a tree with invalid parent references
- Verify operation fails

**Verify State Integrity:**
- Check that no partial data was created
- Verify state is consistent
- Expected: State unchanged from before failed operation

### 11. Memory Leak Test
Test for memory leaks with repeated state operations:

**Stress Test:**
- Loop 100 times:
  - Create 5 tasks
  - Clear state
  - Create 5 workflows
  - Clear state
  - Create 5 trees
  - Clear state

**Verify Clean State:**
- After loop, verify state is empty
- Check for orphaned references
- Expected: No residual data in memory

### 12. Large State Performance Test
Test performance with large state:

**Create Large State:**
- Create 100 strategies
- Each with 10 workflows
- Each with 20 tasks
- Create 50 trees with 100 thoughts each

**Performance Verification:**
- Measure time to create all entities
- Measure time to save state
- Measure time to load state
- Measure time to clear state
- Expected: Operations complete in reasonable time (< 5s each)

### 13. State File Lock Test
Test behavior when state file is locked:

**Lock State File:**
- Create entities and save
- Lock the state file (simulated by opening in write mode)
- Attempt to save new state

**Expected Behavior:**
- Operation should fail gracefully
- Clear error message about file lock
- System should not crash

### 14. Partial State Recovery Test
Test recovery from partial state file:

**Create Partial State:**
- Manually create a state file with only some entities
- Missing strategies, has tasks
- Missing workflows, has trees
- Reload state

**Expected Behavior:**
- System loads what exists
- Missing entities are empty
- No errors or crashes
- State is consistent

### 15. State Version Compatibility Test
Test backward compatibility with state file format changes:

**Create Old Format State:**
- Manually create a state file with old field names
- Use deprecated structure if applicable
- Reload state

**Expected Behavior:**
- System handles old format gracefully
- Either migrates to new format
- Or rejects with clear error
- Should not crash

## Expected Results

- State persists correctly to file
- Memory and storage stay synchronized
- `clear_state` completely clears both memory and storage
- `reload_state` syncs memory with file
- All services share the same state
- Concurrent operations don't corrupt data
- Corrupted state files are handled gracefully
- Debounced save works as expected
- Failed operations don't corrupt state
- No memory leaks with repeated operations
- Large state operations perform well
- File locks are handled gracefully
- Partial state files load correctly
- Old state formats are handled

## Common Issues to Check

1. **Memory-storage mismatch**: Memory has data not in file or vice versa
2. **Clear doesn't clear**: `clear_state` leaves residual data
3. **Reload doesn't sync**: `reload_state` doesn't update memory
4. **Cross-service isolation**: Services don't share state
5. **Concurrent corruption**: Rapid operations create duplicates or orphans
6. **Corruption crash**: Corrupted state file crashes the server
7. **Debounce failure**: Debounced save doesn't work or saves too early
8. **Partial rollback**: Failed operations leave partial data
9. **Memory leaks**: Repeated clear operations leave residual data
10. **Performance degradation**: Large state operations are too slow
11. **File lock hang**: Locked file causes server to hang
12. **Partial load failure**: Partial state file causes errors
13. **Version incompatibility**: Old state format causes crashes

## Test Commands

```bash
# Clean state before test


# Rebuild after code changes
npm run build

# Run tests
npm run test
```

## Success Criteria

- All 15 test steps pass without errors
- No state inconsistencies detected
- Performance metrics within acceptable ranges
- No crashes or hangs during stress tests
- Error messages are clear and actionable
