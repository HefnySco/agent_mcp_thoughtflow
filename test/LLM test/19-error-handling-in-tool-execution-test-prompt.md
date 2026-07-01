# MCP Error Handling in Tool Execution Test Prompt

## Objective
Test the error handling logic in src/index.ts tool execution to ensure errors are caught properly, logged correctly, and returned to the client without crashing the server.

## Test Steps

### 1. Clean State Baseline
- Delete any existing `thoughtflow-state.json` file in the project directory
- Use `clear_state` tool to ensure clean memory state

### 2. Test Unknown Tool Error
Verify unknown tools return proper error:

**Call Unknown Tool:**
- Attempt to call a tool with name that doesn't exist
- Verify error is caught in try-catch block
- Verify error message: "Unknown tool: {name}"
- Verify response has isError: true
- Verify response contains error text
- Verify server doesn't crash

**Expected:**
- Unknown tools throw error
- Error is caught and returned
- Error message is clear
- Server remains stable

### 3. Test Service Execution Error
Verify errors from service execution are handled:

**Mock Service Error:**
- Mock a service to throw error during tool execution
- Call a tool that uses the mocked service
- Verify error is caught in try-catch block
- Verify error is logged with logger.error()
- Verify error message is returned to client
- Verify response has isError: true
- Verify server doesn't crash

**Expected:**
- Service errors are caught
- Errors are logged
- Errors are returned to client
- Server remains stable

### 4. Test Invalid Parameters Error
Verify invalid parameters are handled:

**Invalid Parameters:**
- Call create_task with invalid parameters (e.g., missing required fields)
- Call create_tree with invalid parameters (e.g., non-existent parent)
- Verify errors are caught
- Verify error messages are descriptive
- Verify responses have isError: true
- Verify server doesn't crash

**Expected:**
- Invalid parameters cause errors
- Errors are caught and returned
- Error messages are descriptive
- Server remains stable

### 5. Test Error Logging
Verify errors are logged correctly:

**Error Logging Test:**
- Trigger an error (unknown tool or service error)
- Check logger.error() was called
- Verify error object is passed to logger
- Verify tool name is logged
- Verify error stack trace is available

**Expected:**
- Errors are logged with logger.error()
- Tool name is included in log
- Error object is logged
- Stack trace is available

### 6. Test Error Response Format
Verify error responses have correct format:

**Error Response Format:**
- Trigger an error
- Verify response has content array
- Verify content has type: 'text'
- Verify content has text field with JSON error
- Verify error JSON has error field
- Verify response has isError: true

**Expected:**
- Error responses follow MCP format
- Error is JSON stringified
- isError flag is set
- Content structure is correct

### 7. Test Error Message Content
Verify error messages are informative:

**Error Message Content:**
- Trigger different types of errors
- Verify unknown tool error shows tool name
- Verify service error shows error message
- Verify parameter error shows parameter issue
- Verify messages are actionable

**Expected:**
- Error messages are informative
- Messages include relevant details
- Messages help identify issue
- Messages are actionable

### 8. Test Server Stability After Error
Verify server remains stable after errors:

**Stability Test:**
- Trigger multiple errors in sequence
- Verify server continues to respond
- Verify subsequent tool calls work
- Verify no memory leaks
- Verify no resource corruption

**Expected:**
- Server remains stable after errors
- Subsequent calls work normally
- No resource leaks
- No corruption

### 9. Test Concurrent Error Handling
Verify concurrent errors are handled:

**Concurrent Errors:**
- Trigger multiple errors simultaneously
- Verify all errors are caught
- Verify all errors are logged
- Verify all errors are returned
- Verify no race conditions

**Expected:**
- Concurrent errors are all handled
- No errors are missed
- No race conditions
- Server remains stable

### 10. Test Error State Consistency
Verify state remains consistent after errors:

**State Consistency Test:**
- Create some state (tasks, trees, strategies)
- Trigger an error
- Verify existing state is not corrupted
- Verify no partial state changes
- Verify state is consistent

**Expected:**
- Errors don't corrupt existing state
- No partial state changes
- State remains consistent
- Failed operations don't affect state

### 11. Test Error in Different Service Contexts
Verify errors are handled in all service contexts:

**Task Service Error:**
- Trigger error in task service tool
- Verify error is caught
- Verify error is logged
- Verify error is returned

**ToT Service Error:**
- Trigger error in ToT service tool
- Verify error is caught
- Verify error is logged
- Verify error is returned

**Bridge Service Error:**
- Trigger error in bridge service tool
- Verify error is caught
- Verify error is logged
- Verify error is returned

**Expected:**
- Errors handled in all service contexts
- Consistent error handling across services
- All errors logged and returned

### 12. Test Error Type Handling
Verify different error types are handled:

**Error Types:**
- Trigger Error object
- Trigger string error
- Trigger non-Error object
- Verify all are handled
- Verify error message extraction works

**Expected:**
- Different error types handled
- Error messages extracted correctly
- No crashes on unexpected error types

### 13. Test Error with Async Operations
Verify errors in async operations are handled:

**Async Error Test:**
- Call tool that performs async operation
- Mock async operation to fail
- Verify error is caught
- Verify error is returned
- Verify promise rejection is handled

**Expected:**
- Async errors are caught
- Promise rejections handled
- No unhandled rejections
- Server remains stable

### 14. Test Error Recovery
Verify server can recover from errors:

**Recovery Test:**
- Trigger error
- Verify error is returned
- Immediately call valid tool
- Verify valid tool works
- Verify no error state persists

**Expected:**
- Server recovers from errors
- Subsequent valid calls work
- No error state persists
- Full functionality restored

### 15. Test Error During Shutdown
Verify errors during shutdown are handled:

**Shutdown Error Test:**
- Mock service to throw error during shutdown
- Call server.shutdown()
- Verify error is caught
- Verify shutdown continues for other services
- Verify error is logged

**Expected:**
- Shutdown errors are caught
- Other services still shut down
- Errors are logged
- Clean shutdown despite errors

## Expected Results

- Unknown tools return proper errors
- Service execution errors are caught
- Invalid parameters cause errors
- Errors are logged correctly
- Error responses have correct format
- Error messages are informative
- Server remains stable after errors
- Concurrent errors are handled
- State remains consistent after errors
- Errors handled in all service contexts
- Different error types handled
- Async errors are caught
- Server recovers from errors
- Shutdown errors are handled

## Common Issues to Check

1. **Uncaught errors**: Errors not caught by try-catch
2. **Server crash**: Errors causing server to crash
3. **No error logging**: Errors not logged
4. **Wrong error format**: Error response doesn't match MCP format
5. **Vague error messages**: Error messages not informative
6. **State corruption**: Errors corrupting existing state
7. **Memory leaks**: Errors causing memory leaks
8. **Unhandled rejections**: Async errors not caught
9. **No recovery**: Server not recovering from errors
10. **Shutdown failure**: Errors preventing shutdown

## Test Commands

```bash
# Clean state
rm -f thoughtflow-state.json

# Rebuild after code changes
npm run build
```
