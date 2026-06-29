import { JsonStorageAdapter } from './dist/storage/JsonStorageAdapter.js';
import { TaskOrchestratorService } from './dist/services/TaskOrchestratorService.js';
import { ToTService } from './dist/services/ToTService.js';
import { VisualizationService } from './dist/services/VisualizationService.js';
import fs from 'fs/promises';

async function generateVisualization() {
  const storageAdapter = new JsonStorageAdapter('./thoughtflow-state.json');
  await storageAdapter.initialize();

  const taskService = new TaskOrchestratorService(storageAdapter);
  const totService = new ToTService(storageAdapter);
  const visualizationService = new VisualizationService(taskService, totService);

  await taskService.load();
  await totService.load();

  // Create test data
  console.log('Creating test strategy...');
  const strategy = totService.createStrategy({
    name: 'Test Strategy for Visualization',
    description: 'A test strategy to demonstrate the new visualization'
  });

  console.log('Creating test tree...');
  const tree = totService.createTree({
    goal: 'Explore visualization options',
    rootContent: 'Consider different visualization approaches for the strategy'
  });

  const child1 = totService.addChildThought({
    treeId: tree.id,
    parentId: tree.rootId,
    content: 'Use SVG for crisp graphics'
  });

  const child2 = totService.addChildThought({
    treeId: tree.id,
    parentId: tree.rootId,
    content: 'Add color coding for different sections'
  });

  console.log('Creating test workflow...');
  const task1 = taskService.createTask({
    name: 'Design SVG layout',
    description: 'Create the SVG layout structure for strategy visualization'
  });

  const task2 = taskService.createTask({
    name: 'Implement color scheme',
    description: 'Add colors to distinguish trees and workflows',
    dependencies: [task1.id]
  });

  const task3 = taskService.createTask({
    name: 'Add task dependencies',
    description: 'Show dependency visualization',
    dependencies: [task2.id]
  });

  const workflow = taskService.createWorkflow({
    name: 'Visualization Implementation Workflow',
    taskIds: [task1.id, task2.id, task3.id]
  });

  console.log('Adding tree and workflow to strategy...');
  // Manually update the strategy to include both tree and workflow
  const updatedStrategy = totService.addWorkflowToStrategy(strategy.id, workflow.id);
  // Manually add tree ID to the strategy
  updatedStrategy.treeIds = updatedStrategy.treeIds || [];
  if (!updatedStrategy.treeIds.includes(tree.id)) {
    updatedStrategy.treeIds.push(tree.id);
  }

  console.log('Generating SVG for strategy:', strategy.name);
  const svg = visualizationService.visualizeStrategySvg(strategy.id);
  
  await fs.writeFile('./strategy-visualization.svg', svg);
  console.log('SVG saved to strategy-visualization.svg');

  // Generate individual workflow visualizations
  console.log('Generating individual workflow visualizations...');
  const workflows = taskService.getAllWorkflows().filter(w => updatedStrategy.workflowIds?.includes(w.id));
  
  for (const workflow of workflows) {
    const workflowSvg = visualizationService.visualizeWorkflowSvg(workflow.id);
    const filename = `workflow-${workflow.id.substring(0, 8)}.svg`;
    await fs.writeFile(filename, workflowSvg);
    console.log(`Workflow SVG saved to ${filename}`);
  }

  await visualizationService.shutdown();
  await taskService.shutdown();
  await totService.shutdown();
  await storageAdapter.close();
}

generateVisualization().catch(console.error);
