# MCP Visualization and Export Test Prompt

## Objective
Verify the `VisualizationService` behavior. Ensure that the system accurately translates internal state (Trees, Workflows, Tasks) into formatted visual outputs like Mermaid diagrams or Markdown structures, if applicable via the dashboard or internal mechanisms.

## Test Steps

### 1. Construct Complex State
- Clear state.
- Create a highly nested Tree of Thoughts (at least depth 3 with branches).
- Mark some thoughts as `evaluated`, some as `pruned`, and one as `selected`.
- Create a Workflow with sequential and parallel dependencies.

### 2. Test Visualization Service Endpoints
- Since the visualization might be served via internal logic or the dashboard server, execute the necessary node script or internal method to generate the output representations.
- Retrieve the Mermaid diagram output for the Tree.
- **Verify:**
  - The syntax of the generated Mermaid diagram is perfectly valid.
  - Pruned nodes have distinct visual styling (e.g., dotted lines or specific classes).
  - Selected nodes are highlighted.

### 3. Workflow Graph Verification
- Generate the visualization diagram for the Workflow.
- **Verify:**
  - Dependencies correctly point from prerequisites to dependents (A --> B).
  - Parallel tasks branch correctly from their origin.

### 4. Edge Case: Empty States
- Clear the state entirely.
- Attempt to generate visualizations for empty workflows or trees.
- **Verify:**
  - Returns a graceful "No data to visualize" message or a valid empty graph, rather than crashing with undefined errors.

## Expected Results
- Output graphs have 100% valid syntax compatible with standard Mermaid renderers.
- Node states (`pending`, `completed`, `failed`, `pruned`) are visually distinguishable.
- Scale does not break the graph rendering logic.

## Common Issues to Check
1. **Syntax Errors**: Unescaped quotes or special characters in thought content breaking the Mermaid graph syntax.
2. **Missing Links**: Disconnected nodes in the diagram that should have parent-child or dependency relationships.
3. **Crash on Large Graphs**: Buffer overflows or infinite loops when evaluating massive state objects.

## Test Commands
```bash
# Clean state


# Run tests
npm run test
```
