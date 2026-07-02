# MCP Thought Evaluation Test Prompt

## Objective
Test the MCP thoughtflow thought evaluation functionality to ensure thoughts can be scored, evaluated with multi-criteria, pruned based on thresholds, and backtracked when needed.

## Test Steps

### 1. Clean State
- Delete any existing `thoughtflow-state.json` file in the project directory
- Restart the MCP server to ensure clean state

### 2. Create Evaluation Tree
Create a thought tree for testing evaluation:

**Tree:**
- Goal: "Find the best approach to solve a problem"
- Root content: "I need to solve a complex problem. What approach should I take?"

**Add Child Thoughts:**
- Thought A: "Approach A: Use brute force algorithm"
- Thought B: "Approach B: Use dynamic programming"
- Thought C: "Approach C: Use greedy algorithm"
- Thought D: "Approach D: Use divide and conquer"

### 3. Evaluate Thoughts with Simple Scores
Use `evaluate_thought` on each child thought:

**Thought A:**
- Score: 60
- Reasoning: "Simple but inefficient for large inputs"

**Thought B:**
- Score: 85
- Reasoning: "Optimal for this problem type, good time complexity"

**Thought C:**
- Score: 40
- Reasoning: "Fast but may not find optimal solution"

**Thought D:**
- Score: 75
- Reasoning: "Good balance of complexity and efficiency"

**Verify:**
- Each thought has evaluation with score and reasoning
- Scores are stored in thought.evaluation field

### 4. Evaluate with Multi-Criteria
Use `evaluate_thought` with multi-criteria scores:

**Thought B (re-evaluate):**
- Score: 85
- Creativity: 70
- Risk: 30
- Criteria scores:
  - "time_complexity": 90
  - "space_complexity": 80
  - "implementation_difficulty": 70
- Reasoning: "Optimal time complexity, moderate space usage, moderate implementation effort"

**Verify:**
- Multi-criteria fields are stored
- Custom criteria scores are preserved

### 5. Test Pruning
Use `prune_tree` to remove low-scoring thoughts:

**Prune with threshold 50:**
- Threshold: 50
- Expected: Thoughts with score < 50 are pruned (Thought C with score 40)

**Verify:**
- Thought C is marked as pruned
- Its descendants (if any) are also pruned
- Other thoughts remain active

### 6. Test Pruning with Risk Threshold
Use `prune_tree` with risk threshold:

**Prune with risk threshold 40:**
- Threshold: 50
- Risk threshold: 40
- Expected: Thoughts with score < 50 OR risk > 40 are pruned

**Verify:**
- High-risk thoughts are pruned even if score is good
- Low-risk thoughts with good scores remain

### 7. Test Thought Selection
Use `select_thought` to mark a thought for further exploration:

**Select Thought B:**
- Mark Thought B as selected
- Reason: "Highest score, best approach"

**Verify:**
- Thought B is marked as selected
- Can be used to guide further exploration

### 8. Test Backtracking
Use `backtrack` to prune a thought and all its descendants:

**Backtrack from Thought A:**
- Mark Thought A as backtrack point
- Expected: Thought A and all its descendants are pruned

**Verify:**
- Thought A is marked as pruned
- Any child thoughts of A are also pruned
- Tree structure is updated correctly

### 9. Test Thought Verification
Use `verify_thought` to confirm a thought's findings:

**Verify Thought B:**
- Mark Thought B as verified
- Verification notes: "Tested with sample inputs, confirmed optimal performance"

**Verify:**
- Thought B is marked as verified
- Verification notes are stored
- Can be used to track confirmed solutions

### 10. Test Auto-Evaluation of Parent Thoughts
Test automatic parent evaluation when all children are evaluated (from ideas-rules.md):

**Create Parent with Children:**
- Create a parent thought: "Caching strategy"
- Add 3 child thoughts using batch creation:
  - Child 1: "In-memory cache"
  - Child 2: "Redis backend"
  - Child 3: "Invalidation logic"

**Evaluate Children Individually:**
- Evaluate Child 1 with score 80
- Evaluate Child 2 with score 90
- Verify parent is still pending (not all children evaluated yet)

**Evaluate Last Child:**
- Evaluate Child 3 with score 85
- Verify parent automatically becomes evaluated
- Verify parent's score is average: (80 + 90 + 85) / 3 = 85
- Verify parent's updatedAt timestamp is updated

**Test Recursive Propagation:**
- If parent has a grandparent, verify grandparent is also checked
- Verify evaluation propagates up the hierarchy

**Verify:**
- Parent auto-evaluates when all children are evaluated
- Parent score is average of children's scores
- Propagation works recursively up the tree
- Timestamps are updated correctly

### 11. Verify Persistence
- Wait 1-2 seconds for debounced save to complete
- Check the `thoughtflow-state.json` file
- Verify all evaluation data persisted:
  - Thought scores and reasoning
  - Multi-criteria evaluations
  - Pruning state
  - Selection state
  - Verification state
  - Backtracking state

## Expected Results

- Thoughts can be evaluated with simple scores
- Multi-criteria evaluations are preserved
- Pruning removes low-scoring thoughts correctly
- Risk-based pruning filters high-risk thoughts
- Selection marks thoughts for exploration
- Backtracking prunes thought subtrees
- Verification confirms thought findings
- All evaluation state persists correctly

## Common Issues to Check

1. **Evaluation not saving**: Scores not persisted after evaluation
2. **Multi-criteria lost**: Custom criteria scores not saved
3. **Pruning not working**: Low-scoring thoughts not pruned
4. **Risk threshold ignored**: High-risk thoughts not pruned
5. **Selection not persisting**: Selected state lost after reload
6. **Backtracking incomplete**: Descendants not pruned
7. **Verification not stored**: Verification notes not saved
8. **State corruption**: Evaluation state inconsistent after operations
9. **Auto-evaluation not working**: Parent doesn't auto-evaluate when all children are evaluated
10. **Score averaging wrong**: Parent score not calculated as average of children

## Test Commands

```bash
# Clean state
rm -f thoughtflow-state.json

# Rebuild after code changes
npm run build

# Run tests
npm run test
```
