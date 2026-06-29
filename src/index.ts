#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { StorageFactory, StorageConfig } from './storage/StorageFactory.js';
import { TaskOrchestratorService } from './services/TaskOrchestratorService.js';
import { ToTService } from './services/ToTService.js';
import { CognitiveBridgeService } from './services/CognitiveBridgeService.js';
import { VisualizationService } from './services/VisualizationService.js';
import { ToolRegistry } from './registry/ToolRegistry.js';
import { taskToolDefinitions } from './registry/taskToolHandlers.js';
import { totToolDefinitions } from './registry/totToolHandlers.js';
import { bridgeToolDefinitions } from './registry/bridgeToolHandlers.js';
import { logger } from './utils/logger.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Thoughtflow MCP Server
 * Unified cognitive scaffold combining Task Orchestrator, Tree of Thoughts, and Bridge Layer
 */
class ThoughtflowServer {
  private server: Server;
  private taskService: TaskOrchestratorService;
  private totService: ToTService;
  private bridgeService: CognitiveBridgeService;
  private visualizationService: VisualizationService;
  private storageAdapter: any;
  private toolRegistry: ToolRegistry;

  constructor(config?: { storage?: StorageConfig }) {
    const storageConfig: StorageConfig = config?.storage || {
      backend: 'json',
      path: path.join(__dirname, '..', 'thoughtflow-state.json')
    };

    this.storageAdapter = StorageFactory.create(storageConfig);
    this.taskService = new TaskOrchestratorService(this.storageAdapter);
    this.totService = new ToTService(this.storageAdapter);
    this.bridgeService = new CognitiveBridgeService(this.storageAdapter, this.taskService, this.totService);
    this.visualizationService = new VisualizationService(this.taskService, this.totService, this.bridgeService);
    this.toolRegistry = new ToolRegistry();

    // Reduce debounce delay to ensure data persists before shutdown
    this.taskService.setSaveDebounceMs(100);
    this.totService.setSaveDebounceMs(100);
    this.bridgeService.setSaveDebounceMs(100);

    this.server = new Server(
      {
        name: 'agent_mcp_thoughtflow',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.registerTools();
    this.setupHandlers();
  }

  private registerTools(): void {
    // Register Task Orchestrator tools
    this.toolRegistry.registerBatch(taskToolDefinitions.map(def => ({
      name: def.name,
      tool: def.tool,
      handler: (args: any) => def.handler(args, this.taskService)
    })));

    // Register Tree of Thoughts tools
    this.toolRegistry.registerBatch(totToolDefinitions.map(def => ({
      name: def.name,
      tool: def.tool,
      handler: (args: any) => def.handler(args, this.totService)
    })));

    // Register Cognitive Bridge tools
    this.toolRegistry.registerBatch(bridgeToolDefinitions.map(def => ({
      name: def.name,
      tool: def.tool,
      handler: (args: any) => def.handler(args, this.bridgeService)
    })));

    logger.info(`Registered ${this.toolRegistry.size()} tools`);
  }

  private setupHandlers(): void {
    // Register tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.toolRegistry.getAllToolSchemas()
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Route to appropriate service based on tool name
        let result: any;
        
        if (taskToolDefinitions.some(def => def.name === name)) {
          result = await this.toolRegistry.execute(name, args, this.taskService);
        } else if (totToolDefinitions.some(def => def.name === name)) {
          result = await this.toolRegistry.execute(name, args, this.totService);
        } else if (bridgeToolDefinitions.some(def => def.name === name)) {
          result = await this.toolRegistry.execute(name, args, this.bridgeService);
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error(`Tool execution error: ${name}`, error instanceof Error ? error : undefined);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error'
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    });
  }

  async start(): Promise<void> {
    await this.storageAdapter.initialize();
    
    // Load state once and share it across all services
    const sharedState = await this.storageAdapter.load();
    this.taskService.setState(sharedState);
    this.totService.setState(sharedState);
    this.bridgeService.setState(sharedState);
    
    // VisualizationService no longer needs to load - it uses services directly

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info('Thoughtflow MCP Server started');
  }

  async shutdown(): Promise<void> {
    await this.taskService.shutdown();
    await this.totService.shutdown();
    await this.bridgeService.shutdown();
    await this.visualizationService.shutdown();
    await this.storageAdapter.close();
    logger.info('Thoughtflow MCP Server shut down');
  }

  // Service accessors for external use
  getTaskService(): TaskOrchestratorService {
    return this.taskService;
  }

  getToTService(): ToTService {
    return this.totService;
  }

  getBridgeService(): CognitiveBridgeService {
    return this.bridgeService;
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ThoughtflowServer();
  server.start().catch((error) => {
    logger.error('Failed to start server', error);
    process.exit(1);
  });

  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    await server.shutdown();
    process.exit(0);
  });
}

export { ThoughtflowServer };
