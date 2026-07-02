# MCP Shutdown Sequence Test Prompt

## Objective
Test the shutdown sequence in src/index.ts to ensure all services are shut down in the correct order, storage is closed properly, and the server exits cleanly without data loss or corruption.

## Test Steps

### 1. Clean State Baseline
- Delete any existing `thoughtflow-state.json` file in the project directory
- Use `clear_state` tool to ensure clean memory state

### 2. Test Normal Shutdown Sequence
Verify shutdown happens in correct order:

**Shutdown Order Check:**
1. taskService.shutdown()
2. totService.shutdown()
3. bridgeService.shutdown()
4. visualizationService.shutdown()
5. storageAdapter.close()

**Execute Shutdown:**
- Create a ThoughtflowServer instance
- Call server.shutdown()
- Verify each service's shutdown is called in order
- Verify no service is skipped

**Expected:**
- Services shut down in exact order
- Each shutdown completes before next starts
- No errors during shutdown

### 3. Test Shutdown with Active State
Verify shutdown saves state before closing:

**Create Active State:**
- Create multiple tasks
- Create a workflow
- Create a tree with thoughts
- Create a strategy
- Verify state exists in memory

**Execute Shutdown:**
- Call server.shutdown()
- Wait for shutdown to complete
- Check thoughtflow-state.json file
- Verify all state is persisted

**Expected:**
- All state is saved before shutdown
- State file contains all created entities
- No data loss during shutdown

### 4. Test Shutdown with Debounced Save Pending
Verify shutdown handles pending debounced saves:

**Rapid State Changes:**
- Create 10 tasks in quick succession (< 100ms each)
- Don't wait for debounce
- Immediately call server.shutdown()

**Verify Shutdown:**
- Verify shutdown() calls forceSave() on services
- Verify all 10 tasks are in state file
- Verify no data loss despite pending debounce

**Expected:**
- Shutdown forces save of pending changes
- All rapid changes are persisted
- Debounce doesn't prevent final save

### 5. Test Task Service Shutdown
Verify taskService shuts down correctly:

**Task Service Shutdown:**
- Create tasks with different statuses
- Create workflows with task dependencies
- Call taskService.shutdown()
- Verify task service saves state
- Verify task service cleans up resources

**Expected:**
- Task service saves final state
- Task service releases resources
- No task data is lost

### 6. Test ToT Service Shutdown
Verify totService shuts down correctly:

**ToT Service Shutdown:**
- Create trees with thoughts
- Evaluate some thoughts
- Call totService.shutdown()
- Verify tot service saves state
- Verify tot service cleans up resources

**Expected:**
- ToT service saves final state
- ToT service releases resources
- No tree or thought data is lost

### 7. Test Bridge Service Shutdown
Verify bridgeService shuts down correctly:

**Bridge Service Shutdown:**
- Create strategies
- Link tasks and thoughts
- Create cognitive links
- Call bridgeService.shutdown()
- Verify bridge service saves state
- Verify bridge service cleans up resources

**Expected:**
- Bridge service saves final state
- Bridge service releases resources
- No strategy or link data is lost

### 8. Test Visualization Service Shutdown
Verify visualizationService shuts down correctly:

**Visualization Service Shutdown:**
- Create complex state for visualization
- Call visualizationService.shutdown()
- Verify visualization service cleans up resources
- Verify no visualization-specific data loss

**Expected:**
- Visualization service releases resources
- No visualization state corruption

### 9. Test Storage Adapter Close
Verify storage adapter closes correctly:

**Storage Adapter Close:**
- Create state
- Call storageAdapter.close()
- Verify storage file is properly closed
- Verify file handle is released
- Verify no file lock remains

**Expected:**
- Storage adapter closes file handle
- No file locks remain
- File can be accessed after close

### 10. Test Shutdown Error Handling
Verify shutdown handles errors gracefully:

**Simulate Service Shutdown Error:**
- Mock a service to throw error during shutdown
- Call server.shutdown()
- Verify error is caught
- Verify shutdown continues for other services
- Verify error is logged

**Expected:**
- Errors in one service don't stop others
- All services attempt shutdown
- Errors are logged appropriately

### 11. Test Multiple Shutdown Calls
Verify multiple shutdown calls are safe:

**Multiple Shutdowns:**
- Call server.shutdown() once
- Call server.shutdown() again
- Verify second call is safe
- Verify no errors on second call
- Verify no double-cleanup issues

**Expected:**
- Multiple shutdown calls are safe
- No errors on subsequent calls
- No resource double-free

### 12. Test Shutdown After Partial Initialization
Verify shutdown works if initialization was partial:

**Partial Initialization:**
- Simulate initialization failure after some services created
- Call shutdown on partially initialized server
- Verify created services are shut down
- Verify not-yet-created services don't cause errors

**Expected:**
- Shutdown handles partial initialization
- Only created services are shut down
- No errors from missing services

### 13. Test Shutdown with Concurrent Operations
Verify shutdown handles concurrent operations:

**Concurrent Operations:**
- Start creating tasks in background
- Simultaneously call server.shutdown()
- Verify shutdown waits for or cancels operations
- Verify state is consistent
- Verify no race conditions

**Expected:**
- Shutdown handles concurrent operations
- State remains consistent
- No race conditions or corruption

### 14. Test Storage File Integrity After Shutdown
Verify storage file is valid after shutdown:

**File Integrity Check:**
- Create complex state
- Shutdown server
- Read thoughtflow-state.json
- Verify JSON is valid
- Verify all entities are present
- Verify no corruption

**Expected:**
- State file is valid JSON
- All data is present
- No corruption after shutdown

### 15. Test Shutdown Resource Cleanup
Verify all resources are cleaned up:

**Resource Cleanup Check:**
- Create server with active connections
- Shutdown server
- Verify no open file handles
- Verify no memory leaks
- Verify no timers remaining
- Verify no event listeners remaining

**Expected:**
- All resources are cleaned up
- No resource leaks
- Clean exit

## Expected Results

- Shutdown happens in correct order
- State is saved before shutdown
- Pending debounced saves are forced
- Each service shuts down correctly
- Storage adapter closes properly
- Errors are handled gracefully
- Multiple shutdowns are safe
- Partial initialization is handled
- Concurrent operations are handled
- Storage file remains valid
- All resources are cleaned up

## Common Issues to Check

1. **Wrong shutdown order**: Services shut down in wrong order
2. **State not saved**: State lost during shutdown
3. **Debounce not forced**: Pending saves lost during shutdown
4. **Service error stops others**: One service error stops entire shutdown
5. **Double shutdown issues**: Second shutdown causes errors
6. **Partial init crash**: Shutdown fails on partial initialization
7. **Race conditions**: Concurrent operations cause corruption
8. **File lock remains**: Storage file locked after shutdown
9. **Resource leaks**: Resources not cleaned up
10. **Corrupted file**: State file corrupted after shutdown

## Test Commands

```bash
# Clean state


# Rebuild after code changes
npm run build
```
