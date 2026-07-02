# MCP Deduplication and Idempotency Test Prompt

## Objective
Verify the robustness of the system's deduplication tools. Ensure that duplicate records (Strategies, Trees) caused by concurrent writes or legacy migrations can be safely merged or purged using `deduplicate_strategies`, `deduplicate_trees`, and `deduplicate_strategies_and_trees`.

## Test Steps

### 1. Manual Corruption (Setup)
- Clear state using `clear_state`.
- Create a basic strategy: "Marketing Plan".
- Manually edit the `thoughtflow-state.json` file to copy and paste the "Marketing Plan" strategy object 3 times, giving each duplicate a slightly different random ID but the EXACT same `name` or `goal`.
- Reload state into memory using `reload_state`.
- **Verify:**
  - `list_strategies` shows 3 strategies with identical names.

### 2. Execute Deduplication
- Call the `deduplicate_strategies` tool.
- **Verify:**
  - The tool completes successfully and reports how many duplicates were removed.

### 3. Verify Clean State
- Call `list_strategies`.
- **Verify:**
  - Only ONE instance of "Marketing Plan" remains.
  - The remaining instance kept the properties of the *first* occurrence (or the one with the most relations).

### 4. Tree Deduplication
- Repeat the manual corruption process, but this time for Trees with the identical `goal`.
- Call `deduplicate_trees`.
- **Verify:**
  - Duplicate trees are purged, leaving only one tree per unique normalized goal.

### 5. Idempotent Creation (Implicit Deduplication)
- With a clean state, call `create_strategy` with name "Architecture Strategy".
- Call `create_strategy` AGAIN with the exact same name "Architecture Strategy".
- **Verify:**
  - The second call does not create a new duplicate object. It instead returns the ID of the originally created strategy (acting as a get-or-create).

## Expected Results
- The database actively resists duplicated normalized names/goals via idempotent creation.
- If duplicates are artificially introduced, the deduplication tools cleanly remove them without breaking referenced foreign keys (if logic dictates merging arrays, verify that).

## Common Issues to Check
1. **Foreign Key Orphans**: Deleting a duplicate strategy leaves workflows pointing to a now-deleted strategy ID.
2. **Over-pruning**: Deduplication accidentally deletes items that are similarly named but not exactly matching due to improper normalization (e.g. "Marketing Plan" vs "Marketing Plan v2").
3. **Missing Tool Return**: Deduplication logic fails to save back to the state file after memory manipulation.

## Test Commands
```bash
# Clean state


# Run tests
npm run test
```
