# MCP Service Initialization Order Test Prompt

## Objective
Test the complex service initialization sequence in src/index.ts constructor to ensure temporary services are created correctly, bridge service is injected properly, state is shared across services, and the final service references are correct.

## Test Steps

### 1. Clean State Baseline
- Delete any existing `thoughtflow-state.json` file in the project directory
- Use `clear_state` tool to ensure clean memory state

### 2. Test Storage Adapter Initialization
Verify storage adapter is created first:

**Storage Config:**
- Verify default storage config is used if none provided
- Verify storage config has backend: 'json'
- Verify storage config has path to thoughtflow-state.json
- Verify StorageFactory.create() is called with config

**Expected:**
- Storage adapter is created before any services
- Storage path is correct (absolute path in project directory)
- Storage backend is JSON

### 3. Test LLM Provider Creation
Verify LLM provider is created correctly:

**LLM Config:**
- Verify createLLMProvider() is called
- Verify environment variables are read (LLM_PROVIDER_TYPE, GROK_API_KEY, OLLAMA_BASE_URL, OLLAMA_MODEL)
- Verify default is MockLLMProvider if no config
- Verify GrokLLMProvider is created if providerType='grok' and API key present
- Verify OllamaLLMProvider is created if providerType='ollama'
- Verify null provider is created if providerType='null' or 'none'

**Expected:**
- LLM provider is created before services
- Correct provider type based on environment
- Fallback to mock if configuration invalid

### 4. Test Tool Registry Initialization
Verify tool registry is created:

**Tool Registry:**
- Verify ToolRegistry is instantiated
- Verify tool registry is created before service registration
- Verify tool registry is empty initially

**Expected:**
- Tool registry exists before tool registration
- Registry is ready to accept tool registrations

### 5. Test Temporary Service Creation
Verify temporary services are created for bridge initialization:

**Temporary Services:**
- Verify tempTaskService is created with storageAdapter
- Verify tempTotService is created with storageAdapter and llmConfig
- Verify bridgeService is created with storageAdapter, tempTaskService, tempTotService
- Verify bridgeService is created before final services

**Expected:**
- Temporary services are created successfully
- Bridge service receives temporary services
- Temporary services have storage adapter

### 6. Test Final Service Creation with Bridge Injection
Verify final services are created with bridge injection:

**Final Task Service:**
- Verify taskService is created with storageAdapter
- Verify taskService.setState() is called with bridgeService.getState()
- Verify taskService receives shared state from bridge

**Final ToT Service:**
- Verify llmConfigWithBridge includes cognitiveBridgeService
- Verify totService is created with storageAdapter and llmConfigWithBridge
- Verify totService.setState() is called with bridgeService.getState()
- Verify totService receives shared state from bridge

**Expected:**
- Final services are created after bridge
- Services receive shared state from bridge
- ToT service receives bridge in config

### 7. Test Bridge Service Internal Reference Update
Verify bridge service internal references are updated:

**Internal Reference Update:**
- Verify (bridgeService as any).taskService is set to taskService
- Verify (bridgeService as any).totService is set to totService
- Verify bridge service now references final services instead of temporary ones

**Expected:**
- Bridge internal references point to final services
- Temporary services are no longer referenced by bridge
- Bridge can communicate with final services

### 8. Test Visualization Service Creation
Verify visualization service is created after services are initialized:

**Visualization Service:**
- Verify VisualizationService is created after all other services
- Verify VisualizationService receives taskService, totService, bridgeService
- Verify VisualizationService can access all services

**Expected:**
- Visualization service is created last
- Visualization service receives all three services
- Visualization service can access complete service set

### 9. Test Debounced Save Configuration
Verify debounced save is configured on all services:

**Debounce Configuration:**
- Verify taskService.setSaveDebounceMs(300) is called
- Verify totService.setSaveDebounceMs(300) is called
- Verify bridgeService.setSaveDebounceMs(300) is called
- Verify debounce is set after service initialization

**Expected:**
- All services have 300ms debounce configured
- Debounce is set after services are fully initialized
- Debounce is consistent across all services

### 10. Test Server Initialization
Verify MCP server is initialized:

**Server Initialization:**
- Verify Server is created with name and version
- Verify capabilities include tools
- Verify registerTools() is called
- Verify setupHandlers() is called

**Expected:**
- Server is initialized after all services
- Server has correct metadata
- Server is ready to handle requests

### 11. Test State Sharing Verification
Verify state is shared correctly across services:

**State Sharing Test:**
- Create a task via taskService
- Verify totService can see the task
- Verify bridgeService can see the task
- Create a tree via totService
- Verify taskService can see the tree
- Verify bridgeService can see the tree
- Create a strategy via bridgeService
- Verify taskService can see the strategy
- Verify totService can see the strategy

**Expected:**
- All services share the same state
- Changes in one service are visible to others
- State is truly shared, not copied

### 12. Test Initialization Order Validation
Verify initialization happens in correct order:

**Order Check:**
1. Storage adapter
2. LLM provider
3. Tool registry
4. Temporary services (task, tot)
5. Bridge service (with temporary services)
6. Final task service (with bridge state)
7. Final ToT service (with bridge in config)
8. Bridge internal reference update
9. Visualization service
10. Debounce configuration
11. Server initialization

**Expected:**
- Initialization follows exact order
- No step is skipped
- Dependencies are satisfied before use

### 13. Test Initialization with Custom Config
Verify initialization works with custom configuration:

**Custom Config Test:**
- Create ThoughtflowServer with custom storage config
- Create ThoughtflowServer with custom LLM config
- Verify custom configs are used
- Verify initialization still succeeds

**Expected:**
- Custom configs are respected
- Initialization order remains correct
- Services use custom configurations

## Expected Results

- Storage adapter is created first
- LLM provider is created with correct type
- Tool registry is initialized
- Temporary services are created for bridge
- Bridge service is created with temporary services
- Final services are created with bridge injection
- Bridge internal references are updated to final services
- Visualization service is created last
- Debounced save is configured on all services
- Server is initialized
- State is shared across all services
- Initialization order is correct
- Custom configurations work

## Common Issues to Check

1. **Wrong initialization order**: Services created before dependencies
2. **Bridge not injected**: Bridge service not passed to other services
3. **State not shared**: Services have independent state instead of shared
4. **Temporary services leaked**: Temporary services still referenced after final services created
5. **Debounce not set**: Services don't have debounce configured
6. **Storage path wrong**: State file saved to wrong location
7. **LLM provider wrong**: Wrong provider type created
8. **Visualization service early**: Visualization service created before services are ready
9. **Internal references wrong**: Bridge still references temporary services
10. **Custom config ignored**: Custom configurations not used

## Test Commands

```bash
# Clean state
rm -f thoughtflow-state.json

# Rebuild after code changes
npm run build
```
