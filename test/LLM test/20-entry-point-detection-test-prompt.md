# MCP Entry Point Detection Test Prompt

## Objective
Test the entry point detection logic in src/index.ts to ensure the server correctly identifies when it's run as the main entry point versus being imported as a module, using import.meta.url comparison.

## Test Steps

### 1. Clean State Baseline
- Delete any existing `thoughtflow-state.json` file in the project directory
- Use `clear_state` tool to ensure clean memory state

### 2. Test Entry Point Detection Logic
Verify the entry point detection logic works correctly:

**Detection Logic:**
- Verify process.argv[1] is checked
- Verify fs.realpathSync() is called on process.argv[1]
- Verify import.meta.url is compared with pathToFileURL(realEntryPath).href
- Verify comparison determines if file is run as main

**Expected:**
- Entry point detection uses correct logic
- Real path resolution works
- URL comparison is correct

### 3. Test Running as Main Entry Point
Verify server starts when run as main:

**Run as Main:**
- Execute node dist/index.js (or equivalent built file)
- Verify server instance is created
- Verify server.start() is called
- Verify server starts successfully
- Verify SIGINT handler is registered

**Expected:**
- Server starts when run as main
- Server initialization completes
- Server listens for connections
- Shutdown handler registered

### 4. Test Importing as Module
Verify server doesn't start when imported:

**Import as Module:**
- Import ThoughtflowServer from another file
- Verify server instance is NOT created automatically
- Verify server.start() is NOT called automatically
- Verify SIGINT handler is NOT registered automatically
- Verify only export is available

**Expected:**
- Server doesn't auto-start when imported
- Only class export is available
- Manual instantiation required
- No automatic handlers

### 5. Test Real Path Resolution
Verify real path resolution works correctly:

**Real Path Test:**
- Create symlink to index.ts
- Run via symlink
- Verify fs.realpathSync() resolves to actual path
- Verify comparison works with resolved path
- Verify server starts correctly via symlink

**Expected:**
- Symlinks are resolved correctly
- Real path is used for comparison
- Server starts via symlink

### 6. Test Path Comparison Edge Cases
Verify path comparison handles edge cases:

**Edge Cases:**
- Test with relative path execution (node ./dist/index.js)
- Test with absolute path execution (node /full/path/to/dist/index.js)
- Test with different directory separators if applicable
- Verify comparison works in all cases

**Expected:**
- Relative paths work
- Absolute paths work
- Path separators handled correctly
- Comparison consistent across cases

### 7. Test Error Handling in Detection
Verify detection errors are handled gracefully:

**Error Handling:**
- Mock fs.realpathSync() to throw error
- Verify try-catch catches error
- Verify server doesn't crash
- Verify module import still works

**Expected:**
- Errors in path resolution are caught
- Server doesn't crash on detection errors
- Module import still possible

### 8. Test Multiple Entry Points
Verify behavior with multiple potential entry points:

**Multiple Entry Points:**
- Have multiple files that could be entry points
- Verify only actual entry point starts server
- Verify other files can import without auto-start
- Verify no conflicts

**Expected:**
- Only actual entry point starts server
- Other files import cleanly
- No auto-start conflicts

### 9. Test Built vs Source Execution
Verify detection works for both built and source:

**Source Execution:**
- Run via ts-node or similar
- Verify detection works
- Verify server starts correctly

**Built Execution:**
- Run built dist/index.js
- Verify detection works
- Verify server starts correctly

**Expected:**
- Detection works for source execution
- Detection works for built execution
- Consistent behavior

### 10. Test SIGINT Handler Registration
Verify SIGINT handler is only registered when run as main:

**Handler Registration:**
- Run as main entry point
- Verify SIGINT handler is registered
- Import as module
- Verify SIGINT handler is NOT registered
- Trigger SIGINT in both cases
- Verify handler only called when run as main

**Expected:**
- Handler registered only when run as main
- Handler not registered on import
- Clean shutdown when handler triggered

### 11. Test Server Startup Success
Verify server startup succeeds when detected as entry point:

**Startup Success:**
- Run as main entry point
- Verify server.start() completes
- Verify no startup errors
- Verify server is ready
- Verify transport connected

**Expected:**
- Server starts successfully
- No startup errors
- Server ready for requests

### 12. Test Server Startup Failure Handling
Verify startup failures are handled:

**Startup Failure:**
- Mock server.start() to fail
- Run as main entry point
- Verify error is caught
- Verify error is logged
- Verify process exits with code 1

**Expected:**
- Startup failures are caught
- Errors are logged
- Process exits with error code

### 13. Test Export Availability
Verify export is available regardless of entry point:

**Export Test:**
- Import ThoughtflowServer from another file
- Verify class is exported
- Verify class can be instantiated
- Verify methods are available
- Verify manual instantiation works

**Expected:**
- Export always available
- Class can be imported
- Manual instantiation works
- All methods available

### 14. Test Concurrent Entry Point Checks
Verify detection works with concurrent checks:

**Concurrent Check:**
- Simulate multiple imports
- Simulate potential entry point check
- Verify detection logic is idempotent
- Verify no race conditions

**Expected:**
- Detection is idempotent
- No race conditions
- Consistent behavior

### 15. Test Environment Variables
Verify detection isn't affected by environment variables:

**Environment Test:**
- Set various environment variables
- Run as main entry point
- Verify detection still works
- Verify server starts correctly
- Verify environment variables don't interfere

**Expected:**
- Detection independent of environment
- Server starts regardless of env vars
- No interference from environment

## Expected Results

- Entry point detection logic is correct
- Server starts when run as main
- Server doesn't auto-start when imported
- Real path resolution works
- Path comparison handles edge cases
- Detection errors are handled gracefully
- Multiple entry points work correctly
- Detection works for built and source
- SIGINT handler registered only when run as main
- Server startup succeeds
- Startup failures are handled
- Export is always available
- Detection is idempotent
- Detection independent of environment

## Common Issues to Check

1. **Wrong detection**: Detection logic incorrect
2. **Auto-start on import**: Server starts when imported
3. **No start when main**: Server doesn't start when run as main
4. **Path resolution fail**: Real path resolution fails
5. **Comparison wrong**: Path comparison incorrect
6. **Symlink broken**: Symlinks not handled
7. **Error not caught**: Detection errors not caught
8. **Handler always registered**: SIGINT handler registered on import
9. **Startup error not handled**: Startup failures crash process
10. **Export not available**: Export not available when imported

## Test Commands

```bash


# Test importing as module
# (Create test file that imports and verify no auto-start)
```
