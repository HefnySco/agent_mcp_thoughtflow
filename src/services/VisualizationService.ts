import type { Task } from '../types/index.js';
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
    const tree = this.totService.getTree(treeId);
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
    const tree = this.totService.getTree(treeId);
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
   * Visualize a workflow as SVG
   */
  visualizeWorkflowSvg(workflowId: string): string {
    const workflow = this.taskService.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const tasks = workflow.taskIds.map(id => this.taskService.getTask(id)).filter(t => t !== undefined) as Task[];
    
    // Calculate layout (simple topological layout)
    const taskPositions = new Map<string, { x: number; y: number }>();
    const levels = new Map<string, number>();
    
    // Calculate levels based on dependencies
    const calculateLevel = (taskId: string, visited = new Set<string>()): number => {
      if (visited.has(taskId)) return 0;
      visited.add(taskId);
      
      const task = this.taskService.getTask(taskId);
      if (!task || !task.dependencies || task.dependencies.length === 0) return 0;
      
      const maxDepLevel = Math.max(...task.dependencies.map((depId: string) => calculateLevel(depId, visited)));
      return maxDepLevel + 1;
    };

    tasks.forEach(task => {
      levels.set(task.id, calculateLevel(task.id));
    });

    // Group by level
    const levelGroups = new Map<number, Task[]>();
    tasks.forEach(task => {
      const level = levels.get(task.id) || 0;
      if (!levelGroups.has(level)) levelGroups.set(level, []);
      levelGroups.get(level)!.push(task);
    });

    // Calculate positions
    const nodeWidth = 160;
    const nodeHeight = 60;
    const horizontalGap = 40;
    const verticalGap = 80;

    levelGroups.forEach((tasksAtLevel, level) => {
      tasksAtLevel.forEach((task, index) => {
        const x = index * (nodeWidth + horizontalGap) + 50;
        const y = level * (nodeHeight + verticalGap) + 50;
        taskPositions.set(task.id, { x, y });
      });
    });

    // Generate SVG
    const width = Math.max(...Array.from(taskPositions.values()).map(p => p.x)) + nodeWidth + 50;
    const height = Math.max(...Array.from(taskPositions.values()).map(p => p.y)) + nodeHeight + 50;

    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<style>
      .task-box { fill: #f0f0f0; stroke: #333; stroke-width: 2; rx: 8; }
      .task-box-pending { fill: #fff9c4; stroke: #f9a825; }
      .task-box-in_progress { fill: #c8e6c9; stroke: #2e7d32; }
      .task-box-completed { fill: #bbdefb; stroke: #1565c0; }
      .task-box-failed { fill: #ffcdd2; stroke: #c62828; }
      .task-text { font-family: Arial, sans-serif; font-size: 12px; fill: #333; }
      .dependency-line { stroke: #666; stroke-width: 2; marker-end: url(#arrowhead); }
      .workflow-title { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; fill: #333; }
    </style>`;
    svg += `<defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
      </marker>
    </defs>`;
    
    svg += `<text x="20" y="25" class="workflow-title">Workflow: ${workflow.name}</text>`;

    // Draw dependency lines
    tasks.forEach(task => {
      const fromPos = taskPositions.get(task.id);
      if (!fromPos) return;

      (task.dependencies || []).forEach((depId: string) => {
        const toPos = taskPositions.get(depId);
        if (toPos) {
          svg += `<line x1="${toPos.x + nodeWidth/2}" y1="${toPos.y + nodeHeight}" x2="${fromPos.x + nodeWidth/2}" y2="${fromPos.y}" class="dependency-line" />`;
        }
      });
    });

    // Draw task boxes
    tasks.forEach(task => {
      const pos = taskPositions.get(task.id);
      if (!pos) return;

      const statusClass = `task-box-${task.status}`;
      const displayName = task.name.substring(0, 20) + (task.name.length > 20 ? '...' : '');
      
      svg += `<rect x="${pos.x}" y="${pos.y}" width="${nodeWidth}" height="${nodeHeight}" class="task-box ${statusClass}" />`;
      svg += `<text x="${pos.x + nodeWidth/2}" y="${pos.y + nodeHeight/2 + 4}" text-anchor="middle" class="task-text">${displayName}</text>`;
    });

    svg += '</svg>';
    return svg;
  }

  /**
   * Visualize a single task as SVG
   */
  visualizeTaskSvg(taskId: string): string {
    const task = this.taskService.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const width = 300;
    const height = 200;

    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<style>
      .task-box { fill: #f0f0f0; stroke: #333; stroke-width: 2; rx: 8; }
      .task-box-pending { fill: #fff9c4; stroke: #f9a825; }
      .task-box-in_progress { fill: #c8e6c9; stroke: #2e7d32; }
      .task-box-completed { fill: #bbdefb; stroke: #1565c0; }
      .task-box-failed { fill: #ffcdd2; stroke: #c62828; }
      .task-title { font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; fill: #333; }
      .task-desc { font-family: Arial, sans-serif; font-size: 12px; fill: #555; }
      .task-meta { font-family: Arial, sans-serif; font-size: 11px; fill: #666; }
    </style>`;

    const statusClass = `task-box-${task.status}`;
    const displayName = task.name.substring(0, 30) + (task.name.length > 30 ? '...' : '');
    const displayDesc = task.description ? task.description.substring(0, 40) + (task.description.length > 40 ? '...' : '') : '';

    svg += `<rect x="10" y="10" width="${width - 20}" height="${height - 20}" class="task-box ${statusClass}" />`;
    svg += `<text x="20" y="35" class="task-title">${displayName}</text>`;
    svg += `<text x="20" y="55" class="task-desc">${displayDesc}</text>`;
    svg += `<text x="20" y="80" class="task-meta">Status: ${task.status}</text>`;
    svg += `<text x="20" y="95" class="task-meta">Dependencies: ${(task.dependencies || []).length}</text>`;
    
    if (task.metadata?.cognitive) {
      const cognitive = task.metadata.cognitive as any;
      if (cognitive.sourceThoughtId) {
        svg += `<text x="20" y="110" class="task-meta">Source Thought: ${cognitive.sourceThoughtId.substring(0, 15)}...</text>`;
      }
      if (cognitive.explorationTreeIds && cognitive.explorationTreeIds.length > 0) {
        svg += `<text x="20" y="125" class="task-meta">Exploration Trees: ${cognitive.explorationTreeIds.length}</text>`;
      }
    }

    svg += '</svg>';
    return svg;
  }

  /**
   * Visualize a strategy as SVG (showing trees)
   */
  visualizeStrategySvg(strategyId: string): string {
    const strategy = this.totService.getStrategy(strategyId);
    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    const trees = this.totService.getAllTrees().filter(t => strategy.treeIds?.includes(t.id));
    
    const width = 800;
    const height = 200 + trees.length * 120;

    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<style>
      .strategy-box { fill: #e3f2fd; stroke: #1565c0; stroke-width: 2; rx: 8; }
      .tree-box { fill: #f5f5f5; stroke: #666; stroke-width: 1; rx: 4; }
      .strategy-title { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; fill: #1565c0; }
      .tree-title { font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; fill: #333; }
      .tree-meta { font-family: Arial, sans-serif; font-size: 12px; fill: #666; }
    </style>`;

    svg += `<rect x="10" y="10" width="${width - 20}" height="${height - 20}" class="strategy-box" />`;
    svg += `<text x="30" y="40" class="strategy-title">Strategy: ${strategy.name}</text>`;
    if (strategy.description) {
      svg += `<text x="30" y="60" class="tree-meta">${strategy.description.substring(0, 60)}${strategy.description.length > 60 ? '...' : ''}</text>`;
    }

    trees.forEach((tree: any, index: number) => {
      const y = 90 + index * 120;
      svg += `<rect x="30" y="${y}" width="${width - 60}" height="100" class="tree-box" />`;
      svg += `<text x="50" y="${y + 25}" class="tree-title">${tree.goal.substring(0, 30)}${tree.goal.length > 30 ? '...' : ''}</text>`;
      svg += `<text x="50" y="${y + 45}" class="tree-meta">Thoughts: ${tree.thoughts.size}</text>`;
      svg += `<text x="50" y="${y + 65}" class="tree-meta">Max Depth: ${tree.maxDepth}</text>`;
    });

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
