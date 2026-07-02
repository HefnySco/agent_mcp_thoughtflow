# MCP LLM Providers Integration Test Prompt

## Objective
Test the specific integrations with external LLM providers: Grok and Ollama. Ensure the `generate_children_with_llm` tool can properly communicate with these services when configured, handle authentication (Grok), and process streaming or structured outputs.

## Test Steps

### 1. Ollama Integration Test
**Setup:**
- Ensure you have Ollama running locally.
- In `.env`, set `LLM_PROVIDER=ollama` and `OLLAMA_MODEL=llama3` (or your preferred local model).
- Restart the MCP server.

**Execution:**
- Create a tree with root thought: "Name 3 colors".
- Call `generate_children_with_llm` on the root.
- **Verify:**
  - The request connects to `localhost:11434` successfully.
  - The local model generates 3 children.
  - The response is correctly parsed into thought objects.

### 2. Grok API Integration Test
**Setup:**
- In `.env`, set `LLM_PROVIDER=grok` and provide a valid `GROK_API_KEY`.
- Restart the MCP server.

**Execution:**
- Create a tree with root thought: "What are 2 benefits of typescript?".
- Call `generate_children_with_llm` on the root.
- **Verify:**
  - The API call to Grok succeeds (no 401 Unauthorized errors).
  - The response formatting respects the system prompt (JSON/markdown structure).
  - The thoughts are appended correctly to the tree.

### 3. Provider Error Handling
**Setup:**
- Set `LLM_PROVIDER=grok` but use an INVALID `GROK_API_KEY`.
- Restart the MCP server.

**Execution:**
- Attempt to generate children.
- **Verify:**
  - The system gracefully catches the 401/403 error.
  - Returns a clean error message to the MCP client instead of crashing the server.

### 4. Mock Provider Fallback
**Setup:**
- Do not set an `LLM_PROVIDER` in the environment, or set it to `mock`.

**Execution:**
- Attempt to generate children.
- **Verify:**
  - The system falls back to the `mock-llm-provider`.
  - It generates dummy data ("Generated idea 1...", etc.) seamlessly.

## Expected Results
- Ollama local requests work without CORS/connection issues.
- Grok API requests authenticate and format correctly.
- Invalid configuration (bad API keys, missing Ollama) results in clear, actionable error messages rather than unhandled promise rejections.

## Common Issues to Check
1. **JSON Parsing**: Grok or Ollama returns wrapped markdown (e.g. ````json ... ````) that the parser fails to read.
2. **Connection Refused**: Ollama is not running, but the error message is cryptic.
3. **Missing Keys**: Grok API key is missing, and the system fails silently.

## Test Commands
```bash
# Clean state


# Run tests
npm run test
```
