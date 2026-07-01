# MCP Tool Routing Logic Test Prompt

## Objective
Test the tool routing logic in src/index.ts setupHandlers() to ensure tools are correctly routed to their appropriate services (taskService, totService, bridgeService) based on tool name patterns.

## Test Steps

### 1. Clean State Baseline
- Delete any existing `thoughtflow-state.json` file in the project directory
- Use `clear_state` tool to ensure clean memory state

### 2. Test Task Tool Routing
Verify task tools route to TaskOrchestratorService:

**Execute Task Tools:**
- Call `create_task` - verify it routes to taskService
- Call `update_task` - verify it routes to taskService
- Call `list_tasks` - verify it routes to taskService
- Call `get_task` - verify it routes to taskService
- Call `delete_task` - verify it routes to taskService
- Call `create_workflow` - verify it routes to taskService
- Call `start_workflow_execution` - verify it routes to taskService

**Verify Routing:**
- Check that taskToolDefinitions.some() matches tool name
- Verify toolRegistry.execute() receives taskService as parameter
- Verify taskService methods are called

**Expected:**
- All task tools route to taskService
- taskService receives the tool execution
- No other service receives the call

### 3. Test ToT Tool Routing
Verify ToT tools route to ToTService:

**Execute ToT Tools:**
- Call `create_tree` - verify it routes to totService
- Call `add_idea` - verify it routes to totService
- Call `evaluate_thought` - verify it routes to totService
- Call `prune_tree` - verify it routes to totService
- Call `select_thought` - verify it routes to totService
- Call `backtrack` - verify it routes to totService
- Call `generate_children_with_llm` - verify it routes to totService

**Verify Routing:**
- Check that totToolDefinitions.some() matches tool name
- Verify toolRegistry.execute() receives totService as parameter
- Verify totService methods are called

**Expected:**
- All ToT tools route to totService
- totService receives the tool execution
- No other service receives the call

### 4. Test Bridge Tool Routing
Verify bridge tools route to CognitiveBridgeService:

**Execute Bridge Tools:**
- Call `create_strategy` - verify it routes to bridgeService
- Call `link_thought_to_task` - verify it routes to bridgeService
- Call `promote_thought_to_tasks` - verify it routes to bridgeService
- Call `spawn_tot_from_task` - verify it routes to bridgeService
- Call `get_cognitive_provenance` - verify it routes to bridgeService

**Verify Routing:**
- Check that bridgeToolDefinitions.some() matches tool name
- Verify toolRegistry.execute() receives bridgeService as parameter
- Verify bridgeService methods are called

**Expected:**
- All bridge tools route to bridgeService
- bridgeService receives the tool execution
- No other service receives the call

### 5. Test Server-Level Tool Routing
Verify server-level tools route without service parameter:

**Execute Server Tools:**
- Call `reload_state` - verify it routes with null service
- Call `clear_state` - verify it routes with null service

**Verify Routing:**
- Check that tool name matches 'reload_state' or 'clear_state'
- Verify toolRegistry.execute() receives null as service parameter
- Verify server-level handler is called directly

**Expected:**
- Server-level tools execute without service parameter
- Server-level handler is called
- No service receives the call

### 6. Test Routing Priority
Verify routing logic checks in correct order:

**Routing Order Check:**
- Verify server-level tools are checked first (reload_state, clear_state)
- Verify task tools are checked second
- Verify ToT tools are checked third
- Verify bridge tools are checked fourth
- Verify unknown tools throw error at the end

**Expected:**
- Routing logic follows correct priority order
- No ambiguity in routing
- First match wins

### 7. Test Unknown Tool Error
Verify unknown tools throw appropriate error:

**Call Unknown Tool:**
- Attempt to call a tool with name that doesn't exist
- Verify error is thrown: "Unknown tool: {name}"
- Verify error is caught and returned to client
- Verify server doesn't crash

**Expected:**
- Unknown tools throw clear error
- Error message includes tool name
- Server remains stable

### 8. Test Tool Name Pattern Matching
Verify tool name pattern matching works correctly:

**Pattern Matching Test:**
- Create a tool with name similar to existing tool
- Verify it doesn't accidentally match wrong pattern
- Verify exact name matching is used
- Verify no partial matches occur

**Expected:**
- Tool names match exactly
- No partial or fuzzy matching
- Each tool routes to correct service

### 9. Test Concurrent Routing
Verify routing works correctly with concurrent tool calls:

**Concurrent Execution:**
- Call multiple tools from different services simultaneously
- Call create_task (taskService) and create_tree (totService) together
- Call create_strategy (bridgeService) and reload_state (server) together
- Verify all tools route correctly
- Verify no cross-contamination

**Expected:**
- Concurrent calls route correctly
- No race conditions in routing
- Each call reaches correct service

### 10. Test Routing After Service Updates
Verify routing works after service state changes:

**Update Services:**
- Execute tools that modify service state
- Call reload_state to update services
- Verify routing still works after state update
- Verify services are still correctly referenced

**Expected:**
- Routing continues to work after state changes
- Service references remain valid
- No stale service references

## Expected Results

- Task tools route to TaskOrchestratorService
- ToT tools route to ToTService
- Bridge tools route to CognitiveBridgeService
- Server-level tools route without service parameter
- Unknown tools throw clear errors
- Routing follows correct priority order
- Tool name matching is exact
- Concurrent routing works correctly
- Routing works after service updates

## Common Issues to Check

1. **Wrong service routing**: Tools routing to incorrect service
2. **Priority order wrong**: Server tools not checked first
3. **Unknown tool crash**: Unknown tools causing server crash instead of error
4. **Partial matching**: Tool names partially matching wrong patterns
5. **Race conditions**: Concurrent routing causing cross-contamination
6. **Stale references**: Service references becoming invalid after updates
7. **Missing route**: Some tools not matching any routing condition
8. **Ambiguous routing**: Tool name matching multiple patterns
9. **Service parameter wrong**: Wrong service passed to toolRegistry.execute()
10. **Handler not called**: Tool routing succeeds but handler not executed

## Test Commands

```bash
# Clean state
rm -f thoughtflow-state.json

# Rebuild after code changes
npm run build
```
