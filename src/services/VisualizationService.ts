import type { TaskOrchestratorService } from './TaskOrchestratorService.js';
import type { ToTService } from './ToTService.js';
import type { CognitiveBridgeService } from './CognitiveBridgeService.js';

/**
 * VisualizationService provides visualization capabilities for trees, workflows, and cognitive links
 */
export class VisualizationService {
  private taskService: TaskOrchestratorService;
  private totService: ToTService;
  private bridgeService: CognitiveBridgeService;

  constructor(taskService: TaskOrchestratorService, totService: ToTService, bridgeService: CognitiveBridgeService) {
    this.taskService = taskService;
    this.totService = totService;
    this.bridgeService = bridgeService;
  }

  /**
   * Visualize a tree as ASCII art
   */
  visualizeTreeAscii(treeId: string): string {
    const tree = this.totService.getTreeFull(treeId);
    if (!tree) {
      throw new Error(`Tree ${treeId} not found`);
    }

    const lines: string[] = [];
    lines.push(`Tree: ${tree.id}`);
    lines.push(`Goal: ${tree.goal}`);
    lines.push(`Max Depth: ${tree.maxDepth}`);
    lines.push('');

    const visualizeThought = (thoughtId: string, prefix: string, isLast: boolean): void => {
      const thought = tree.thoughts.get(thoughtId);
      if (!thought) return;

      const connector = isLast ? '└── ' : '├── ';
      const content = thought.content.substring(0, 50) + (thought.content.length > 50 ? '...' : '');
      const evalScore = thought.evaluation !== null ? ` [${thought.evaluation}]` : '';
      const stateIcon = this.getStateIcon(thought.state);
      
      lines.push(`${prefix}${connector}${stateIcon} ${content}${evalScore}`);

      const children = thought.children;
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      
      children.forEach((childId: string, index: number) => {
        visualizeThought(childId, newPrefix, index === children.length - 1);
      });
    };

    visualizeThought(tree.rootId, '', true);
    return lines.join('\n');
  }

  /**
   * Visualize a tree with thought→task links
   */
  visualizeTreeWithLinks(treeId: string): string {
    const tree = this.totService.getTreeFull(treeId);
    if (!tree) {
      throw new Error(`Tree ${treeId} not found`);
    }

    const lines: string[] = [];
    lines.push(`Tree: ${tree.id} (with cognitive links)`);
    lines.push(`Goal: ${tree.goal}`);
    lines.push('');

    const visualizeThought = (thoughtId: string, prefix: string, isLast: boolean): void => {
      const thought = tree.thoughts.get(thoughtId);
      if (!thought) return;

      const connector = isLast ? '└── ' : '├── ';
      const content = thought.content.substring(0, 40) + (thought.content.length > 40 ? '...' : '');
      const evalScore = thought.evaluation !== null ? ` [${thought.evaluation}]` : '';
      const stateIcon = this.getStateIcon(thought.state);
      
      lines.push(`${prefix}${connector}${stateIcon} ${content}${evalScore}`);

      // Show linked tasks
      const cognitiveMeta = thought.metadata?.cognitive as any;
      if (cognitiveMeta?.promotedToTaskIds && cognitiveMeta.promotedToTaskIds.length > 0) {
        const taskPrefix = prefix + (isLast ? '    ' : '│   ');
        lines.push(`${taskPrefix}└── → Tasks: ${cognitiveMeta.promotedToTaskIds.slice(0, 2).join(', ')}${cognitiveMeta.promotedToTaskIds.length > 2 ? '...' : ''}`);
      }

      const children = thought.children;
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      
      children.forEach((childId: string, index: number) => {
        visualizeThought(childId, newPrefix, index === children.length - 1);
      });
    };

    visualizeThought(tree.rootId, '', true);
    return lines.join('\n');
  }

  /**
   * Get cognitive statistics
   */
  getCognitiveStats(): {
    totalTasks: number;
    totalTrees: number;
    totalThoughts: number;
    totalCognitiveLinks: number;
    promotedThoughts: number;
    spawnedTrees: number;
    linkedPairs: number;
  } {
    let totalThoughts = 0;
    let promotedThoughts = 0;
    let spawnedTrees = 0;
    let linkedPairs = 0;

    for (const tree of this.totService.getAllTrees()) {
      totalThoughts += tree.thoughts.size;
      
      for (const thought of tree.thoughts.values()) {
        const cognitiveMeta = thought.metadata?.cognitive as any;
        if (cognitiveMeta?.promotedToTaskIds && cognitiveMeta.promotedToTaskIds.length > 0) {
          promotedThoughts++;
        }
        if (cognitiveMeta?.linkedTaskIds && cognitiveMeta.linkedTaskIds.length > 0) {
          linkedPairs += cognitiveMeta.linkedTaskIds.length;
        }
      }
    }

    for (const task of this.taskService.getAllTasks()) {
      const cognitiveMeta = task.metadata?.cognitive as any;
      if (cognitiveMeta?.explorationTreeIds && cognitiveMeta.explorationTreeIds.length > 0) {
        spawnedTrees += cognitiveMeta.explorationTreeIds.length;
      }
    }

    return {
      totalTasks: this.taskService.getAllTasks().length,
      totalTrees: this.totService.getAllTrees().length,
      totalThoughts,
      totalCognitiveLinks: this.bridgeService.getCognitiveLinkCount(),
      promotedThoughts,
      spawnedTrees,
      linkedPairs
    };
  }

  /**
   * Get state icon for thought state
   */
  private getStateIcon(state: string): string {
    switch (state) {
      case 'pending': return '○';
      case 'evaluated': return '◎';
      case 'selected': return '✓';
      case 'pruned': return '✗';
      default: return '?';
    }
  }

  /**
   * Visualize a workflow as SVG (showing all tasks with detailed status)
   */
  visualizeWorkflowSvg(workflowId: string): string {
    const workflow = this.taskService.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const width = 800;
    const taskHeight = workflow.taskIds.length * 35;
    const height = 150 + taskHeight;

    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<style>
      .workflow-box { fill: #fff3e0; stroke: #e65100; stroke-width: 2; rx: 8; }
      .task-box { fill: #ffffff; stroke: #999; stroke-width: 1; rx: 3; }
      .workflow-title { font-family: Arial, sans-serif; font-size: 18px; font-weight: bold; fill: #e65100; }
      .task-title { font-family: Arial, sans-serif; font-size: 13px; font-weight: bold; fill: #333; }
      .task-meta { font-family: Arial, sans-serif; font-size: 11px; fill: #666; }
      .status-pending { fill: #fff9c4; }
      .status-in-progress { fill: #b3e5fc; }
      .status-completed { fill: #c8e6c9; }
      .status-failed { fill: #ffcdd2; }
    </style>`;

    svg += `<rect x="10" y="10" width="${width - 20}" height="${height - 20}" class="workflow-box" />`;
    svg += `<text x="30" y="45" class="workflow-title">Workflow: ${workflow.name}</text>`;
    svg += `<text x="30" y="70" class="task-meta">Tasks: ${workflow.taskIds.length} | Status: ${workflow.status}</text>`;

    let taskY = 95;
    workflow.taskIds.forEach((taskId: string, idx: number) => {
      const task = this.taskService.getTask(taskId);
      if (task) {
        const statusClass = `status-${task.status || 'pending'}`;
        const deps = task.dependencies && task.dependencies.length > 0 
          ? `→ deps: ${task.dependencies.length}` 
          : '';
        svg += `<rect x="30" y="${taskY}" width="${width - 60}" height="30" class="task-box ${statusClass}" />`;
        svg += `<text x="40" y="${taskY + 19}" class="task-title">${idx + 1}. ${task.name}</text>`;
        svg += `<text x="${width - 120}" y="${taskY + 19}" class="task-meta">${task.status}${deps}</text>`;
        taskY += 35;
      }
    });

    svg += '</svg>';
    return svg;
  }

  /**
   * Visualize a strategy as SVG (showing trees and workflows with detailed status)
   */
  visualizeStrategySvg(strategyId: string): string {
    const strategy = this.totService.getStrategy(strategyId);
    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    const trees = this.totService.getAllTrees().filter(t => strategy.treeIds?.includes(t.id));
    const workflows = this.taskService.getAllWorkflows().filter(w => strategy.workflowIds?.includes(w.id));
    
    const width = 900;
    const treeHeight = trees.length * 150;
    const workflowHeight = workflows.length * 200;
    const height = 200 + treeHeight + workflowHeight;

    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<style>
      .strategy-box { fill: #e3f2fd; stroke: #1565c0; stroke-width: 2; rx: 8; }
      .tree-box { fill: #f5f5f5; stroke: #666; stroke-width: 1; rx: 4; }
      .workflow-box { fill: #fff3e0; stroke: #e65100; stroke-width: 1; rx: 4; }
      .task-box { fill: #ffffff; stroke: #999; stroke-width: 1; rx: 3; }
      .thought-box { fill: #ffffff; stroke: #999; stroke-width: 1; rx: 3; }
      .strategy-title { font-family: Arial, sans-serif; font-size: 18px; font-weight: bold; fill: #1565c0; }
      .section-title { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; fill: #333; }
      .tree-title { font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; fill: #333; }
      .workflow-title { font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; fill: #e65100; }
      .task-title { font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; fill: #333; }
      .thought-title { font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; fill: #333; }
      .tree-meta { font-family: Arial, sans-serif; font-size: 11px; fill: #666; }
      .workflow-meta { font-family: Arial, sans-serif; font-size: 11px; fill: #666; }
      .task-meta { font-family: Arial, sans-serif; font-size: 10px; fill: #666; }
      .thought-meta { font-family: Arial, sans-serif; font-size: 10px; fill: #666; }
      .status-pending { fill: #fff9c4; }
      .status-in-progress { fill: #b3e5fc; }
      .status-completed { fill: #c8e6c9; }
      .status-failed { fill: #ffcdd2; }
      .state-pending { fill: #e0e0e0; }
      .state-selected { fill: #c8e6c9; }
      .state-evaluated { fill: #fff9c4; }
      .state-verified { fill: #b3e5fc; }
    </style>`;

    svg += `<rect x="10" y="10" width="${width - 20}" height="${height - 20}" class="strategy-box" />`;
    svg += `<text x="30" y="45" class="strategy-title">Strategy: ${strategy.name}</text>`;
    if (strategy.description) {
      svg += `<text x="30" y="70" class="tree-meta">${strategy.description.substring(0, 80)}${strategy.description.length > 80 ? '...' : ''}</text>`;
    }

    let yOffset = 100;

    // Trees section
    if (trees.length > 0) {
      svg += `<text x="30" y="${yOffset}" class="section-title">Trees (${trees.length})</text>`;
      yOffset += 30;
      
      trees.forEach((tree: any, index: number) => {
        const y = yOffset + index * 150;
        svg += `<rect x="30" y="${y}" width="${width - 60}" height="140" class="tree-box" />`;
        svg += `<text x="50" y="${y + 25}" class="tree-title">${tree.goal.substring(0, 40)}${tree.goal.length > 40 ? '...' : ''}</text>`;
        svg += `<text x="50" y="${y + 45}" class="tree-meta">Thoughts: ${tree.thoughts.size} | Max Depth: ${tree.maxDepth}</text>`;
        
        // Show detailed thoughts with status colors
        let thoughtY = y + 65;
        let thoughtCount = 0;
        tree.thoughts.forEach((thought: any) => {
          if (thoughtCount >= 3) return; // Show max 3 thoughts
          const stateClass = `state-${thought.state || 'pending'}`;
          svg += `<rect x="50" y="${thoughtY}" width="${width - 100}" height="20" class="thought-box ${stateClass}" />`;
          svg += `<text x="55" y="${thoughtY + 14}" class="thought-title">${thought.content}</text>`;
          thoughtY += 25;
          thoughtCount++;
        });
        
        if (tree.thoughts.size > 3) {
          svg += `<text x="50" y="${thoughtY + 5}" class="thought-meta">+${tree.thoughts.size - 3} more thoughts</text>`;
        }
      });
      
      yOffset += trees.length * 150 + 20;
    }

    // Workflows section
    if (workflows.length > 0) {
      svg += `<text x="30" y="${yOffset}" class="section-title">Workflows (${workflows.length})</text>`;
      yOffset += 30;
      
      workflows.forEach((workflow: any, index: number) => {
        const y = yOffset + index * 200;
        svg += `<rect x="30" y="${y}" width="${width - 60}" height="190" class="workflow-box" />`;
        svg += `<text x="50" y="${y + 25}" class="workflow-title">${workflow.name.substring(0, 40)}${workflow.name.length > 40 ? '...' : ''}</text>`;
        svg += `<text x="50" y="${y + 45}" class="workflow-meta">Tasks: ${workflow.taskIds.length} | Status: ${workflow.status}</text>`;
        
        // Show detailed tasks with status colors
        let taskY = y + 65;
        let taskCount = 0;
        workflow.taskIds.forEach((taskId: string, idx: number) => {
          if (taskCount >= 4) return; // Show max 4 tasks
          const task = this.taskService.getTask(taskId);
          if (task) {
            const statusClass = `status-${task.status || 'pending'}`;
            const deps = task.dependencies && task.dependencies.length > 0 
              ? `→ deps: ${task.dependencies.length}` 
              : '';
            svg += `<rect x="50" y="${taskY}" width="${width - 100}" height="25" class="task-box ${statusClass}" />`;
            svg += `<text x="55" y="${taskY + 16}" class="task-title">${idx + 1}. ${task.name}</text>`;
            svg += `<text x="${width - 150}" y="${taskY + 16}" class="task-meta">${task.status}${deps}</text>`;
            taskY += 30;
            taskCount++;
          }
        });
        
        if (workflow.taskIds.length > 4) {
          svg += `<text x="50" y="${taskY + 5}" class="task-meta">+${workflow.taskIds.length - 4} more tasks</text>`;
        }
      });
    }

    svg += '</svg>';
    return svg;
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    // No-op for visualization service - it doesn't own state
  }
}
