# MCP Tool Registry Test Prompt

## Objective
Test the Tool Registry System functionality in src/index.ts to ensure tools are registered correctly, executed properly, and the registry manages tool schemas and handlers as expected.

## Test Steps

### 1. Clean State Baseline
- Delete any existing `thoughtflow-state.json` file in the project directory
- Use `clear_state` tool to ensure clean memory state

### 2. Test Tool Registration
Verify that tools are registered correctly during server initialization:

**Verify Registration:**
- Start the MCP server
- Use `list_tools` (or equivalent MCP list tools request)
- Verify all expected tools are registered:
  - Task Orchestrator tools (create_task, update_task, list_tasks, etc.)
  - Tree of Thoughts tools (create_tree, add_idea, evaluate_thought, etc.)
  - Cognitive Bridge tools (link_thought_to_task, promote_thought_to_tasks, etc.)
  - Server-level tools (reload_state, clear_state)
- Verify tool schemas are correct (name, description, inputSchema)
- Verify tool count matches expected number

**Expected:**
- All tool definitions from taskToolDefinitions, totToolDefinitions, bridgeToolDefinitions are registered
- Server-level utility tools are registered
- No duplicate tool names
- Tool schemas are valid JSON Schema

### 3. Test Tool Execution
Verify that registered tools execute correctly:

**Execute Task Tool:**
- Call `create_task` with valid parameters
- Verify task is created successfully
- Verify response contains task ID and details

**Execute ToT Tool:**
- Call `create_tree` with valid parameters
- Verify tree is created successfully
- Verify response contains tree ID and details

**Execute Bridge Tool:**
- Call `create_strategy` with valid parameters
- Verify strategy is created successfully
- Verify response contains strategy ID and details

**Execute Server Tool:**
- Call `reload_state`
- Verify success response
- Call `clear_state`
- Verify success response

**Expected:**
- All tool types execute successfully
- Tool handlers receive correct parameters
- Responses are properly formatted
- No errors during execution

### 4. Test Tool Registry Size
Verify the tool registry reports correct size:

**Check Registry Size:**
- After registration, check tool registry size
- Verify size matches total number of registered tools
- Verify size increases when tools are added
- Verify size decreases when tools are removed (if supported)

**Expected:**
- Registry size is accurate
- Size updates correctly on registration changes

### 5. Test Tool Schema Retrieval
Verify tool schemas can be retrieved:

**Retrieve All Schemas:**
- Use ListToolsRequestSchema
- Verify all tool schemas are returned
- Verify schemas are complete (name, description, inputSchema)

**Retrieve Specific Schema:**
- Verify individual tool schemas can be accessed
- Verify schema structure is valid

**Expected:**
- All schemas are retrievable
- Schemas are complete and valid
- Schema format matches MCP specification

### 6. Test Tool Handler Routing
Verify tool handlers are routed to correct services:

**Route to Task Service:**
- Execute a task tool (e.g., create_task)
- Verify it routes to TaskOrchestratorService
- Verify taskService receives the call

**Route to ToT Service:**
- Execute a ToT tool (e.g., create_tree)
- Verify it routes to ToTService
- Verify totService receives the call

**Route to Bridge Service:**
- Execute a bridge tool (e.g., create_strategy)
- Verify it routes to CognitiveBridgeService
- Verify bridgeService receives the call

**Route to Server Level:**
- Execute reload_state or clear_state
- Verify it routes to server-level handler
- Verify no service is passed (null)

**Expected:**
- Tools route to correct services based on name
- Service-specific tools receive correct service instance
- Server-level tools execute without service parameter

### 7. Test Batch Registration
Verify batch registration works correctly:

**Register Batch:**
- Verify taskToolDefinitions are registered as a batch
- Verify totToolDefinitions are registered as a batch
- Verify bridgeToolDefinitions are registered as a batch
- Verify all tools in batch are registered

**Expected:**
- Batch registration registers all tools in array
- No tools are missed in batch
- Batch registration is efficient

### 8. Test Tool Handler Parameters
Verify tool handlers receive correct parameters:

**Test Parameter Passing:**
- Call create_task with name, description, status
- Verify handler receives all parameters
- Call create_tree with goal, rootContent, maxDepth
- Verify handler receives all parameters
- Call evaluate_thought with score, reasoning, criteriaScores
- Verify handler receives all parameters

**Expected:**
- All parameters are passed to handlers
- Parameter types are correct
- Optional parameters are handled correctly

### 9. Test Unknown Tool Handling
Verify unknown tools are handled gracefully:

**Call Unknown Tool:**
- Attempt to call a tool that doesn't exist
- Verify error is returned
- Verify error message is clear
- Verify server doesn't crash

**Expected:**
- Unknown tools return error
- Error message indicates unknown tool
- Server remains stable

### 10. Test Registry State Persistence
Verify tool registry state persists if needed:

**Check if Registry Persists:**
- Create tools, restart server
- Verify tools are still registered after restart
- If registry doesn't persist, verify it's re-initialized correctly

**Expected:**
- Either registry persists across restarts
- Or registry is re-initialized correctly on startup

## Expected Results

- All tools are registered correctly during initialization
- Tool schemas are valid and complete
- Tools execute successfully with correct routing
- Tool handlers receive correct parameters
- Unknown tools are handled gracefully
- Registry size is accurate
- Batch registration works correctly
- Tool retrieval works correctly

## Common Issues to Check

1. **Missing tools**: Some tools not registered after initialization
2. **Duplicate tools**: Same tool name registered multiple times
3. **Wrong routing**: Tools routing to wrong services
4. **Invalid schemas**: Tool schemas don't match MCP specification
5. **Handler errors**: Tool handlers throwing errors
6. **Parameter loss**: Parameters not passed to handlers correctly
7. **Registry size wrong**: Registry size doesn't match actual tool count
8. **Batch failure**: Batch registration missing some tools
9. **Unknown tool crash**: Unknown tools causing server crash
10. **Schema retrieval failure**: Unable to retrieve tool schemas

## Test Commands

```bash
# Clean state


# Rebuild after code changes
npm run build
```
