# Thoughtflow Examples

This document provides detailed examples of using Thoughtflow for various agent workflows.

## Example 1: Problem Solving with Hybrid Workflow

A complete example showing the reasoning → execution → reflection loop.

```typescript
import { ThoughtflowServer } from 'agent_mcp_thoughtflow';

const server = new ThoughtflowServer({
  storage: { backend: 'json', path: './thoughtflow-state.json' }
});

await server.start();

// Get services
const totService = server.getToTService();
const taskService = server.getTaskService();
const bridgeService = server.getBridgeService();

// Step 1: Explore the problem with ToT
const tree = await totService.createTree({
  goal: "Design a scalable user authentication system",
  rootContent: "Consider JWT vs session-based authentication",
  maxDepth: 8
});

// Step 2: Generate and evaluate alternatives
const jwtThought = await totService.addChildThought({
  treeId: tree.id,
  parentId: tree.rootId,
  content: "Use JWT tokens for stateless authentication"
});

const sessionThought = await totService.addChildThought({
  treeId: tree.id,
  parentId: tree.rootId,
  content: "Use session-based authentication with Redis"
});

await totService.evaluateThought({
  treeId: tree.id,
  thoughtId: jwtThought.id,
  score: 85,
  creativity: 70,
  risk: 20,
  reasoning: "JWT scales better for microservices, no server state"
});

await totService.evaluateThought({
  treeId: tree.id,
  thoughtId: sessionThought.id,
  score: 70,
  creativity: 50,
  risk: 30,
  reasoning: "Sessions offer better security but require shared state"
});

// Step 3: Select the best approach
await totService.verifyThought({
  treeId: tree.id,
  thoughtId: jwtThought.id,
  verificationNotes: "JWT aligns with microservices architecture"
});

await totService.selectThought({
  treeId: tree.id,
  thoughtId: jwtThought.id
});

// Step 4: Promote to executable tasks
const promotionResult = await bridgeService.promoteThoughtToTasks({
  treeId: tree.id,
  thoughtId: jwtThought.id,
  includeDescendants: true,
  taskNamePrefix: "auth-"
});

// Step 5: Create a workflow for implementation
const workflow = await taskService.createWorkflow({
  name: "JWT Authentication Implementation",
  taskIds: promotionResult.taskIds,
  description: "Implement JWT-based authentication system"
});

// Step 6: Execute tasks (simulated)
for (const taskId of promotionResult.taskIds) {
  await taskService.updateTask({
    id: taskId,
    status: 'in_progress'
  });
  
  // ... perform work ...
  
  await taskService.updateTask({
    id: taskId,
    status: 'completed'
  });
}

// Step 7: If blocked, spawn new reasoning
const blockedTask = promotionResult.taskIds[0];
const newTree = await bridgeService.spawnTotFromTask({
  taskId: blockedTask,
  goal: "Resolve token refresh challenge",
  rootContent: "Consider refresh token rotation strategies",
  maxDepth: 5
});

// Step 8: Trace provenance
const provenance = await bridgeService.getCognitiveProvenance({
  id: blockedTask,
  type: 'task',
  maxDepth: 3
});

console.log('Provenance chain:', provenance);
```

## Example 2: Architecture Decision Making

Using ToT to explore architectural alternatives before implementation.

```typescript
// Create a tree for architecture exploration
const tree = await totService.createTree({
  goal: "Choose database architecture for high-traffic application",
  rootContent: "Evaluate PostgreSQL vs MongoDB vs DynamoDB",
  maxDepth: 6
});

// Branch into each option
const postgresBranch = await totService.addChildThought({
  treeId: tree.id,
  parentId: tree.rootId,
  content: "PostgreSQL: Relational, ACID compliant, mature"
});

const mongoBranch = await totService.addChildThought({
  treeId: tree.id,
  parentId: tree.rootId,
  content: "MongoDB: Document-oriented, flexible schema"
});

const dynamoBranch = await totService.addChildThought({
  treeId: tree.id,
  parentId: tree.rootId,
  content: "DynamoDB: NoSQL, fully managed, auto-scaling"
});

// Evaluate each option with multiple criteria
await totService.evaluateThought({
  treeId: tree.id,
  thoughtId: postgresBranch.id,
  score: 80,
  criteriaScores: {
    scalability: 70,
    consistency: 95,
    cost: 80,
    complexity: 60
  },
  reasoning: "Strong consistency, but requires scaling effort"
});

await totService.evaluateThought({
  treeId: tree.id,
  thoughtId: mongoBranch.id,
  score: 75,
  criteriaScores: {
    scalability: 85,
    consistency: 70,
    cost: 75,
    complexity: 80
  },
  reasoning: "Flexible schema, good for read-heavy workloads"
});

await totService.evaluateThought({
  treeId: tree.id,
  thoughtId: dynamoBranch.id,
  score: 85,
  criteriaScores: {
    scalability: 95,
    consistency: 80,
    cost: 70,
    complexity: 90
  },
  reasoning: "Best scalability, managed service reduces ops"
});

// Select DynamoDB and promote to implementation
await totService.selectThought({
  treeId: tree.id,
  thoughtId: dynamoBranch.id
});

const result = await bridgeService.promoteThoughtToTasks({
  treeId: tree.id,
  thoughtId: dynamoBranch.id,
  includeDescendants: true,
  taskNamePrefix: "db-"
});

console.log('Created tasks:', result.taskIds);
```

## Example 3: Debugging with Reasoning

When encountering a bug, spawn a ToT tree to explore possible causes.

```typescript
// Task is blocked by a bug
const buggyTask = await taskService.getTask('task-123');

// Spawn reasoning tree to debug
const debugTree = await bridgeService.spawnTotFromTask({
  taskId: buggyTask.id,
  goal: "Diagnose authentication failure",
  rootContent: "Check common causes: token expiry, invalid signature, network issues"
});

// Explore potential causes
const tokenExpiry = await totService.addChildThought({
  treeId: debugTree.id,
  parentId: debugTree.rootId,
  content: "Token may have expired before reaching server"
});

const invalidSignature = await totService.addChildThought({
  treeId: debugTree.id,
  parentId: debugTree.rootId,
  content: "Token signature validation may be failing"
});

const networkIssue = await totService.addChildThought({
  treeId: debugTree.id,
  parentId: debugTree.rootId,
  content: "Network timeout or CORS issue"
});

// Evaluate based on logs/error messages
await totService.evaluateThought({
  treeId: debugTree.id,
  thoughtId: tokenExpiry.id,
  score: 30,
  reasoning: "Logs show token is fresh (created 5 min ago)"
});

await totService.evaluateThought({
  treeId: debugTree.id,
  thoughtId: invalidSignature.id,
  score: 90,
  reasoning: "Error message indicates signature validation failed"
});

await totService.evaluateThought({
  treeId: debugTree.id,
  thoughtId: networkIssue.id,
  score: 20,
  reasoning: "Network requests are succeeding with 200 status"
});

// Select the most likely cause
await totService.selectThought({
  treeId: debugTree.id,
  thoughtId: invalidSignature.id
});

// Create fix task
const fixTask = await taskService.createTask({
  name: "Fix JWT signature validation",
  description: "Investigate and fix token signature verification",
  dependencies: [buggyTask.id],
  metadata: {
    cognitive: {
      debugTreeId: debugTree.id,
      rootCauseThoughtId: invalidSignature.id
    }
  }
});

console.log('Created fix task:', fixTask.id);
```

## Example 4: Incremental Feature Development

Use ToT to break down complex features into smaller tasks.

```typescript
// Explore feature implementation
const tree = await totService.createTree({
  goal: "Implement real-time notifications",
  rootContent: "Consider WebSocket vs Server-Sent Events vs polling",
  maxDepth: 10
});

// Break down into components
const websocket = await totService.addChildThought({
  treeId: tree.id,
  parentId: tree.rootId,
  content: "WebSocket implementation for bidirectional communication"
});

const backend = await totService.addChildThought({
  treeId: tree.id,
  parentId: websocket.id,
  content: "Set up WebSocket server with authentication"
});

const frontend = await totService.addChildThought({
  treeId: tree.id,
  parentId: websocket.id,
  content: "Implement WebSocket client with reconnection logic"
});

const testing = await totService.addChildThought({
  treeId: tree.id,
  parentId: websocket.id,
  content: "Add integration tests for WebSocket connections"
});

// Evaluate and promote entire subtree
await totService.evaluateThought({
  treeId: tree.id,
  thoughtId: websocket.id,
  score: 90,
  reasoning: "WebSocket provides best real-time experience"
});

await totService.selectThought({
  treeId: tree.id,
  thoughtId: websocket.id
});

const result = await bridgeService.promoteThoughtToTasks({
  treeId: tree.id,
  thoughtId: websocket.id,
  includeDescendants: true,
  flattenHierarchy: false,  // Preserve parent-child as dependencies
  taskNamePrefix: "notification-"
});

// Create workflow
const workflow = await taskService.createWorkflow({
  name: "Real-time Notifications",
  taskIds: result.taskIds,
  description: "Implement WebSocket-based notification system"
});

console.log('Workflow created with', result.taskIds.length, 'tasks');
```

## Example 5: Provenance Tracking

Trace the complete reasoning chain for any task or thought.

```typescript
// Get provenance for a task
const provenance = await bridgeService.getCognitiveProvenance({
  id: 'task-123',
  type: 'task',
  maxDepth: 5
});

console.log('Task:', provenance.data.name);
console.log('Source thought:', provenance.cognitiveMetadata?.sourceThoughtId);
console.log('Related entries:', provenance.relatedEntries);

// Each related entry shows the chain
provenance.relatedEntries.forEach(entry => {
  console.log(`- ${entry.type}: ${entry.id}`);
  console.log(`  Link type: ${entry.linkType}`);
  console.log(`  Reason: ${entry.reason}`);
  console.log(`  Created at: ${entry.createdAt}`);
});
```

## Example 6: Strategy Management

Organize related trees under strategies for long-term projects.

```typescript
// Create a strategy for a project
const strategy = await totService.createStrategy({
  name: "E-commerce Platform Migration",
  description: "Migrate legacy monolith to microservices"
});

// Create multiple trees under this strategy
const authTree = await totService.createTree({
  goal: "Design authentication microservice",
  rootContent: "Evaluate OAuth2 vs JWT vs session",
  metadata: { strategyId: strategy.id }
});

const paymentTree = await totService.createTree({
  goal: "Design payment processing microservice",
  rootContent: "Evaluate Stripe vs PayPal vs custom",
  metadata: { strategyId: strategy.id }
});

// Update strategy to include trees
strategy.treeIds.push(authTree.id, paymentTree.id);
await totService.updateStrategy(strategy.id, { treeIds: strategy.treeIds });

// Get all trees in a strategy
const strategyTrees = await totService.getStrategy(strategy.id);
console.log('Strategy trees:', strategyTrees.treeIds);
```

## Example 7: Lightweight Linking

Link thoughts to tasks without full promotion for tracking purposes.

```typescript
// Link a design thought to its implementation task
await bridgeService.linkThoughtToTask({
  treeId: 'design-tree-123',
  thoughtId: 'thought-456',
  taskId: 'task-789',
  reason: 'Design informs implementation'
});

// The link is recorded in both metadata
const task = await taskService.getTask('task-789');
console.log('Linked thoughts:', task.metadata?.cognitive?.linkedThoughtIds);

const thought = await totService.getThought('design-tree-123', 'thought-456');
console.log('Linked tasks:', thought.metadata?.cognitive?.linkedTaskIds);
```

## Example 8: Backtracking and Pruning

Manage complex reasoning trees by backtracking and pruning.

```typescript
// After exploring many branches, prune low-quality ones
const pruneResult = await totService.pruneTree({
  treeId: 'tree-123',
  threshold: 60,  // Remove thoughts with score < 60
  riskThreshold: 70  // Also remove high-risk thoughts
});

console.log(`Pruned ${pruneResult.prunedCount} thoughts`);
console.log(`Remaining: ${pruneResult.remainingCount}`);

// Backtrack from a dead-end
await totService.backtrack({
  treeId: 'tree-123',
  thoughtId: 'thought-456'
});

// All descendants are marked as 'pruned'
```

## Configuration Examples

### Custom Storage Path

```typescript
const server = new ThoughtflowServer({
  storage: {
    backend: 'json',
    path: '/custom/path/thoughtflow-state.json'
  }
});
```

### Environment Variable Configuration

```typescript
const storagePath = process.env.THOUGHTFLOW_STORAGE_PATH || './thoughtflow-state.json';

const server = new ThoughtflowServer({
  storage: {
    backend: 'json',
    path: storagePath
  }
});
```

### Multiple Instances

```typescript
// Separate instances for different projects
const projectA = new ThoughtflowServer({
  storage: { backend: 'json', path: './project-a.json' }
});

const projectB = new ThoughtflowServer({
  storage: { backend: 'json', path: './project-b.json' }
});
```
