# MCP Service Accessors Test Prompt

## Objective
Test the service accessor methods (getTaskService(), getToTService(), getBridgeService()) in src/index.ts to ensure external code can access the internal services correctly and the returned service instances are the correct ones.

## Test Steps

### 1. Clean State Baseline
- Delete any existing `thoughtflow-state.json` file in the project directory
- Use `clear_state` tool to ensure clean memory state

### 2. Test getTaskService() Accessor
Verify getTaskService() returns the correct task service instance:

**Create Server:**
- Create a ThoughtflowServer instance
- Call server.getTaskService()
- Verify returned value is a TaskOrchestratorService instance
- Verify returned value is the same instance used internally

**Test Service Functionality:**
- Use the returned service to create a task
- Verify task is created successfully
- Verify task appears in the server's internal state

**Expected:**
- getTaskService() returns TaskOrchestratorService instance
- Returned service is functional
- Returned service is the same instance used internally

### 3. Test getToTService() Accessor
Verify getToTService() returns the correct ToT service instance:

**Create Server:**
- Create a ThoughtflowServer instance
- Call server.getToTService()
- Verify returned value is a ToTService instance
- Verify returned value is the same instance used internally

**Test Service Functionality:**
- Use the returned service to create a tree
- Verify tree is created successfully
- Verify tree appears in the server's internal state

**Expected:**
- getToTService() returns ToTService instance
- Returned service is functional
- Returned service is the same instance used internally

### 4. Test getBridgeService() Accessor
Verify getBridgeService() returns the correct bridge service instance:

**Create Server:**
- Create a ThoughtflowServer instance
- Call server.getBridgeService()
- Verify returned value is a CognitiveBridgeService instance
- Verify returned value is the same instance used internally

**Test Service Functionality:**
- Use the returned service to create a strategy
- Verify strategy is created successfully
- Verify strategy appears in the server's internal state

**Expected:**
- getBridgeService() returns CognitiveBridgeService instance
- Returned service is functional
- Returned service is the same instance used internally

### 5. Test Accessor Instance Identity
Verify accessors return the same instance on multiple calls:

**Multiple Calls Test:**
- Call getTaskService() twice
- Verify both calls return the same instance (reference equality)
- Call getToTService() twice
- Verify both calls return the same instance
- Call getBridgeService() twice
- Verify both calls return the same instance

**Expected:**
- Multiple calls to same accessor return same instance
- No new instances are created on each call
- Reference equality holds

### 6. Test Accessor After Initialization
Verify accessors work after full initialization:

**Full Initialization:**
- Create ThoughtflowServer with full initialization
- Call server.start() to complete initialization
- Call accessors after start()
- Verify all accessors return valid services
- Verify services are fully initialized

**Expected:**
- Accessors work after full initialization
- Returned services are fully initialized
- Services have correct state

### 7. Test Accessor Before Start
Verify accessors work before server.start():

**Before Start Test:**
- Create ThoughtflowServer instance
- Don't call start()
- Call accessors
- Verify accessors return services
- Verify services are created but not started

**Expected:**
- Accessors work before start()
- Services exist but may not be fully initialized
- No errors from calling accessors early

### 8. Test Accessor State Sharing
Verify services from accessors share state:

**State Sharing Test:**
- Get taskService via accessor
- Get totService via accessor
- Get bridgeService via accessor
- Create task via taskService accessor
- Verify totService accessor can see the task
- Verify bridgeService accessor can see the task
- Create tree via totService accessor
- Verify taskService accessor can see the tree
- Verify bridgeService accessor can see the tree

**Expected:**
- Services from accessors share state
- Changes visible across all accessor services
- State is truly shared

### 9. Test Accessor Service Configuration
Verify services from accessors have correct configuration:

**Configuration Test:**
- Get taskService via accessor
- Verify it has correct storage adapter
- Verify it has correct debounce configuration
- Get totService via accessor
- Verify it has correct storage adapter
- Verify it has correct LLM provider
- Verify it has correct cognitive bridge service
- Get bridgeService via accessor
- Verify it has correct storage adapter
- Verify it has correct task and tot service references

**Expected:**
- Services have correct configuration
- Services have correct dependencies
- Configuration matches initialization

### 10. Test Accessor Service Methods
Verify services from accessors have all expected methods:

**Method Availability Test:**
- Get taskService via accessor
- Verify it has createTask, updateTask, listTasks, etc.
- Get totService via accessor
- Verify it has createTree, addIdea, evaluateThought, etc.
- Get bridgeService via accessor
- Verify it has createStrategy, linkThoughtToTask, etc.

**Expected:**
- Services have all expected methods
- Methods are callable
- No missing methods

### 11. Test Accessor Immutability
Verify accessors don't allow service replacement:

**Immutability Test:**
- Get taskService via accessor
- Try to replace the service (if possible)
- Verify internal service reference cannot be changed
- Verify accessor continues to return original service

**Expected:**
- Service references are immutable
- Accessors always return original service
- No way to replace internal services

### 12. Test Accessor After Shutdown
Verify accessors work after shutdown:

**After Shutdown Test:**
- Create ThoughtflowServer
- Start server
- Call server.shutdown()
- Call accessors after shutdown
- Verify accessors still return services
- Verify services are in shutdown state

**Expected:**
- Accessors work after shutdown
- Returned services are in shutdown state
- No errors from calling accessors after shutdown

### 13. Test Accessor with Custom Config
Verify accessors work with custom server configuration:

**Custom Config Test:**
- Create ThoughtflowServer with custom storage config
- Create ThoughtflowServer with custom LLM config
- Call accessors
- Verify services use custom configurations
- Verify accessors return correctly configured services

**Expected:**
- Accessors work with custom configs
- Services use custom configurations
- No configuration loss through accessors

### 14. Test Accessor Type Safety
Verify accessors return correct types:

**Type Safety Test:**
- Call getTaskService()
- Verify return type is TaskOrchestratorService
- Call getToTService()
- Verify return type is ToTService
- Call getBridgeService()
- Verify return type is CognitiveBridgeService
- Verify no type mismatches

**Expected:**
- Accessors return correct types
- Type safety is maintained
- No type errors

### 15. Test Accessor Concurrent Access
Verify accessors handle concurrent access safely:

**Concurrent Access Test:**
- Call getTaskService() from multiple "threads" simultaneously
- Call getToTService() from multiple "threads" simultaneously
- Call getBridgeService() from multiple "threads" simultaneously
- Verify all calls return same instance
- Verify no race conditions
- Verify no corruption

**Expected:**
- Accessors handle concurrent access
- No race conditions
- Consistent instances returned

## Expected Results

- getTaskService() returns correct TaskOrchestratorService instance
- getToTService() returns correct ToTService instance
- getBridgeService() returns correct CognitiveBridgeService instance
- Multiple calls return same instance
- Accessors work before and after start()
- Services from accessors share state
- Services have correct configuration
- Services have all expected methods
- Service references are immutable
- Accessors work after shutdown
- Accessors work with custom configs
- Accessors return correct types
- Accessors handle concurrent access

## Common Issues to Check

1. **Wrong service returned**: Accessor returns wrong service instance
2. **Different instances**: Multiple calls return different instances
3. **Service not functional**: Returned service doesn't work
4. **State not shared**: Services from accessors don't share state
5. **Configuration wrong**: Services have wrong configuration
6. **Methods missing**: Services missing expected methods
7. **Mutable references**: Service references can be changed
8. **Shutdown error**: Accessors fail after shutdown
9. **Type mismatch**: Accessors return wrong types
10. **Race conditions**: Concurrent access causes issues

## Test Commands

```bash
# Clean state
rm -f thoughtflow-state.json

# Rebuild after code changes
npm run build
```
