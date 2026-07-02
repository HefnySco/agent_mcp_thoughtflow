# Ideas (Thoughts) Rules

This document outlines the rules and best practices for working with Ideas (Thoughts) in the Thoughtflow MCP system.

## Core Concepts

### What are Ideas?

Ideas (also called Thoughts) are the fundamental units of reasoning in the Tree of Thoughts (ToT) system. They represent:
- Divergent exploration of solution space
- Hierarchical reasoning chains
- Evaluated alternatives with multi-criteria scoring
- The raw material that can be promoted to executable tasks

### Key Properties

Every Idea has:
- **id**: Unique slug-based identifier
- **content**: The thought/idea text
- **parentId**: Reference to parent thought (for hierarchy)
- **children**: Array of child thought IDs
- **state**: Current state (`pending`, `selected`, `pruned`, `verified`)
- **depth**: Depth in the tree (root = 0)
- **evaluation**: Multi-criteria evaluation (score, creativity, risk, custom)
- **metadata**: Arbitrary key-value pairs
- **createdAt** / **updatedAt**: Timestamps

## Creation Rules

### Use Batch Creation Only

**Rule**: Always use `add_ideas` (batch) for creating ideas. Single-item `add_idea` is not available.

**Why**: Batch creation is more efficient, supports positional references, and provides consistent return values.

**Example**:
```json
{
  "treeId": "tree-123",
  "ideas": [
    {
      "parentId": "root",
      "content": "Implement in-memory cache with LRU eviction"
    },
    {
      "parentId": "idea-1",
      "content": "Add Redis backend for distributed caching"
    },
    {
      "parentId": "idea-1",
      "content": "Implement cache invalidation on write operations"
    }
  ],
  "deduplication": "skip"
}
```

### Positional References

**Rule**: Use positional references (`idea-1`, `idea-2`, etc.) for `parentId` within the same batch.

**Why**: Enables expressing parent-child relationships without knowing real IDs in advance.

**Example**:
```json
{
  "ideas": [
    { "parentId": "root", "content": "First idea" },  // Becomes idea-1
    { "parentId": "idea-1", "content": "Child of first" },  // References idea-1
    { "parentId": "idea-1", "content": "Another child" }  // Also references idea-1
  ]
}
```

### Deduplication Strategies

**Rule**: Choose appropriate deduplication strategy based on use case.

**Options**:
- **`skip`** (default): Reuse existing thought with same normalized content
- **`error`**: Fail if duplicate exists
- **`overwrite`**: Update existing thought in-place (resets state to pending)

**When to use each**:
- `skip`: When you want to avoid duplicates and reuse existing reasoning
- `error`: When duplicates indicate a problem and should be caught
- `overwrite`: When you want to reset/update existing reasoning

### Name-Based Resolution

**Rule**: Can use existing thought IDs or names for `parentId` (not just positional refs).

**Why**: Enables attaching new ideas to existing tree structure.

**Feature**: Uses fuzzy matching for robustness against typos.

## Hierarchy Rules

### Depth Limits

**Rule**: Each tree has a `maxDepth` (default: 10). Cannot add children beyond this limit.

**Why**: Prevents infinite recursion and keeps reasoning tractable.

**Error**: `ValidationError` with message "Maximum depth reached for tree {treeId}"

### Parent Validation

**Rule**: Parent must exist in the same tree. Parent reference is resolved using:
1. Positional reference (`idea-1`, etc.)
2. Exact ID match
3. Fuzzy name match

**Why**: Ensures tree integrity and prevents orphaned thoughts.

## Evaluation Rules

### Multi-Criteria Evaluation

**Rule**: Use `evaluate_thought` to assign scores across multiple dimensions.

**Dimensions**:
- **score** (0-100): Overall quality
- **creativity** (0-100): Novelty/innovation
- **risk** (0-100): Potential downsides
- **criteriaScores**: Custom criteria (key-value pairs)

**Example**:
```json
{
  "treeId": "tree-123",
  "thoughtId": "idea-1",
  "score": 85,
  "creativity": 70,
  "risk": 30,
  "reasoning": "Good balance of innovation and practicality"
}
```

### Verification

**Rule**: Use `verify_thought` to mark a thought as confirmed after validation.

**Fields**:
- **verified**: Boolean flag
- **verificationNotes**: Explanation of verification process

**Why**: Distinguishes between evaluated (scored) and verified (tested/confirmed) thoughts.

### Auto-Evaluation of Parent Thoughts

**Rule**: When a child thought is evaluated, the system automatically checks if all sibling children are also evaluated. If so, the parent thought is automatically marked as `evaluated` with the average score of its children.

**Behavior**:
- Triggered when any thought is evaluated
- Checks if all children of the parent are in `evaluated` state
- If all children are evaluated, parent state → `evaluated`
- Parent's evaluation score is set to the average of all children's scores
- Updates `updatedAt` timestamp on parent
- Recursively propagates up the hierarchy (grandparent, great-grandparent, etc.)

**Example**:
```json
// Parent thought with 3 children
Thought: "Caching strategy" (pending)
├── Child 1: "In-memory cache" (evaluated, score: 80)
├── Child 2: "Redis backend" (evaluated, score: 90)
└── Child 3: "Invalidation logic" (in_progress)

// When Child 3 is evaluated with score 85:
evaluate_thought({ "thoughtId": "idea-3", "score": 85 })
// → Parent "Caching strategy" automatically becomes evaluated
// → Parent's score = (80 + 90 + 85) / 3 = 85
// → If parent has a parent, that grandparent is also checked
```

**Why**: Enables hierarchical evaluation without manual parent evaluation, aggregating child scores for parent-level decision making.

## Selection and Pruning

### Selection

**Rule**: Use `select_thought` to mark a thought as the chosen path for execution.

**Effect**: Marks thought state as `selected`, signals this branch should be promoted to tasks.

### Pruning

**Rule**: Use `prune_tree` to remove thoughts below an evaluation threshold.

**Parameters**:
- **threshold**: Thoughts with score below this are pruned
- **riskThreshold** (optional): Also prune if risk exceeds this

**Effect**: Marks pruned thoughts as `pruned`, they are excluded from future operations.

### Backtracking

**Rule**: Use `backtrack` to mark a thought and all descendants as pruned.

**When**: When a reasoning path proves unproductive.

**Effect**: Efficiently cuts off entire branches.

## Promotion to Tasks

### When to Promote

**Rule**: Promote thoughts to tasks when:
- Reasoning is complete and validated
- A clear execution path is identified
- The thought represents concrete work items

### How to Promote

**Tool**: `promote_thought_to_tasks`

**Options**:
- **includeDescendants**: Promote entire subtree (default: false)
- **flattenHierarchy**: Flatten subtree into flat task list (default: false)
- **workflowId**: Target workflow (required)

**Result**: Creates tasks with cognitive provenance metadata linking back to source thoughts.

## Best Practices

### 1. Structure Trees by Depth

- **Level 0**: Root problem/goal
- **Level 1**: Major approaches
- **Level 2**: Specific implementations
- **Level 3**: Detailed sub-tasks

### 2. Evaluate Before Pruning

- Always evaluate thoughts before pruning
- Use multi-criteria evaluation for nuanced decisions
- Document reasoning in evaluation comments

### 3. Use Batch Creation

- Always create multiple related ideas in one `add_ideas` call
- Use positional references for parent-child relationships
- Leverage deduplication to avoid redundant reasoning

### 4. Maintain Tree Health

- Regularly prune low-quality branches
- Verify high-quality thoughts before promotion
- Backtrack when paths prove unproductive

### 5. Document Decisions

- Use evaluation reasoning to explain scores
- Use verification notes to document validation
- Use metadata to track external references

## Common Patterns

### Exploratory Pattern

```
1. create_tree (root problem)
2. add_ideas (major approaches - batch)
3. evaluate_thought (score each approach)
4. add_ideas (dive into best approach - batch with positional refs)
5. evaluate_thought (score sub-approaches)
6. select_thought (choose best path)
7. promote_thought_to_tasks (convert to execution)
```

### Iterative Refinement Pattern

```
1. create_tree (initial exploration)
2. add_ideas + evaluate (explore space)
3. prune_tree (remove low-quality branches)
4. add_ideas (refine remaining branches)
5. verify_thought (validate best options)
6. promote_thought_to_tasks (execute)
```

### Debugging Pattern

```
1. spawn_tot_from_task (when task blocked)
2. add_ideas (explore failure modes)
3. evaluate_thought (identify root cause)
4. select_thought (choose fix)
5. promote_thought_to_tasks (implement fix)
```

## Error Handling

### Common Errors

- **ThoughtNotFoundError**: Parent thought doesn't exist (check ID/fuzzy match)
- **ValidationError**: Depth limit reached or invalid input
- **DUPLICATE_THOUGHT**: Duplicate content with `deduplication: "error"`

### Resolution

- Use fuzzy matching for parent references
- Check tree depth before adding children
- Use appropriate deduplication strategy
- Use `get_tree` to inspect current structure

## Performance Considerations

### Large Trees

- Batch creation is O(n) where n = number of ideas
- Evaluation is O(1) per thought
- Pruning is O(k) where k = number of thoughts pruned
- Backtracking is O(m) where m = descendants of target

### Optimization Tips

- Use batch creation for all multi-idea operations
- Prune early to reduce tree size
- Use `skip` deduplication to avoid redundant processing
- Leverage positional references to avoid ID lookups
