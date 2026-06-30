# MCP LLM Generation Test Prompt

## Objective
Test the dynamic thought generation capabilities using the `generate_children_with_llm` tool. Ensure that the agent correctly interacts with configured LLM providers, respects parameters like temperature, and integrates new thoughts into the existing Tree of Thoughts structure.

## Test Steps

### 1. Clean State Baseline
- Delete any existing `thoughtflow-state.json` file in the project directory.
- Use `clear_state` tool to ensure clean memory state.

### 2. Create Target Tree
- Create a new Tree of Thoughts using `create_tree`.
- Goal: "Brainstorm marketing strategies for a new AI product"
- Root Content: "We need 3 unique marketing angles."

### 3. Generate Thoughts (Mock Provider)
- Verify that your environment is configured to use the Mock LLM provider (or expect real output if using a live provider).
- Call `generate_children_with_llm` on the root thought ID.
- Parameters: `numChildren: 3`, `temperature: 0.7`.
- **Verify:**
  - The tool completes successfully.
  - The tree state now contains 3 new child thoughts attached to the root.
  - The generated thoughts have a `pending` state and standard evaluation structures ready.

### 4. Parameter Adjustment Test
- Select one of the newly generated child thoughts.
- Call `generate_children_with_llm` on this child thought ID.
- Parameters: `numChildren: 1`, `temperature: 0.1` (low temperature).
- **Verify:**
  - Exactly 1 new thought is generated and appended as a grandchild to the root.

### 5. Error Handling and Edge Cases
- Provide an invalid `parentId` (e.g., a non-existent ID) to `generate_children_with_llm`.
- **Verify:**
  - The system returns a clear error message that the parent ID could not be found.
  - The server does not crash.

### 6. Verify Persistence
- Wait 1-2 seconds for debounced save.
- Read `thoughtflow-state.json`.
- **Verify:**
  - The new generated thoughts and their exact hierarchy (parent-child links) are correctly persisted to the file.

## Expected Results
- `generate_children_with_llm` correctly requests and formats output from the LLM.
- The specified number of child nodes are automatically parsed and inserted into the tree.
- Invalid requests (bad IDs) fail gracefully without corrupting state.
- Generated nodes persist perfectly across debounced saves.

## Common Issues to Check
1. **Formatting Failures**: The LLM provider returns markdown that the service fails to parse into distinct thoughts.
2. **Timeout Issues**: The LLM request hangs and blocks the MCP server.
3. **Hierarchy Mismatch**: Generated thoughts are placed at the root level instead of under the specified `parentId`.

## Test Commands
```bash
# Clean state
rm -f thoughtflow-state.json

# Run tests
npm run test
```
