#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { StorageFactory, StorageConfig } from './storage/StorageFactory.js';
import { TaskOrchestratorService } from './services/TaskOrchestratorService.js';
import { ToTService, ToTServiceConfig } from './services/ToTService.js';
import { CognitiveBridgeService } from './services/CognitiveBridgeService.js';
import { VisualizationService } from './services/VisualizationService.js';
import { ToolRegistry } from './registry/ToolRegistry.js';
import { taskToolDefinitions } from './registry/taskToolHandlers.js';
import { totToolDefinitions } from './registry/totToolHandlers.js';
import { bridgeToolDefinitions } from './registry/bridgeToolHandlers.js';
import { logger } from './utils/logger.js';
import { MockLLMProvider } from './llm-providers/mock-llm-provider.js';
import { GrokLLMProvider } from './llm-providers/grok-llm-provider.js';
import { OllamaLLMProvider } from './llm-providers/ollama-llm-provider.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create LLM provider based on environment variables
 */
function createLLMProvider(): ToTServiceConfig {
  const providerType = process.env.LLM_PROVIDER_TYPE || 'mock';
  const grokApiKey = process.env.GROK_API_KEY;
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama2';

  if (providerType === 'null' || providerType === 'none') {
    logger.info('No LLM provider configured. ToTService will use MockLLMProvider as fallback.');
    return { llmProvider: null };
  }

  if (providerType === 'grok') {
    if (!grokApiKey) {
      logger.warn('GROK_API_KEY not set, falling back to MockLLMProvider');
      return { llmProvider: new MockLLMProvider() };
    }
    logger.info('Using GrokLLMProvider');
    return { llmProvider: new GrokLLMProvider(grokApiKey) };
  }

  if (providerType === 'ollama') {
    logger.info(`Using OllamaLLMProvider at ${ollamaBaseUrl} with model ${ollamaModel}`);
    return { llmProvider: new OllamaLLMProvider(ollamaBaseUrl, ollamaModel) };
  }

  logger.info('Using MockLLMProvider');
  return { llmProvider: new MockLLMProvider() };
}

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

  constructor(config?: { storage?: StorageConfig; llmProvider?: ToTServiceConfig }) {
    const storageConfig: StorageConfig = config?.storage || {
      backend: 'json',
      path: path.join(__dirname, '..', 'thoughtflow-state.json')
    };

    this.storageAdapter = StorageFactory.create(storageConfig);
    const llmConfig = config?.llmProvider || createLLMProvider();
    this.toolRegistry = new ToolRegistry();

    // Create CognitiveBridgeService first (it will be injected into other services)
    // Use temporary service instances that will be replaced
    const tempTaskService = new TaskOrchestratorService(this.storageAdapter);
    const tempTotService = new ToTService(this.storageAdapter, llmConfig);
    this.bridgeService = new CognitiveBridgeService(this.storageAdapter, tempTaskService, tempTotService);

    // Now create the actual services with proper bridge injection
    this.taskService = new TaskOrchestratorService(this.storageAdapter);
    this.taskService.setState(this.bridgeService.getState());
    this.taskService.setCognitiveBridgeService(this.bridgeService);

    const llmConfigWithBridge = { ...llmConfig, cognitiveBridgeService: this.bridgeService };
    this.totService = new ToTService(this.storageAdapter, llmConfigWithBridge);
    this.totService.setState(this.bridgeService.getState());

    // Update bridge service's internal references to the real services
    // This is needed because bridge was created with temp services
    (this.bridgeService as any).taskService = this.taskService;
    (this.bridgeService as any).totService = this.totService;

    // Create VisualizationService after services are properly initialized
    this.visualizationService = new VisualizationService(this.taskService, this.totService, this.bridgeService);

    // 300ms debounce: coalesces rapid consecutive writes into a single flush
    // while staying short enough that data persists before shutdown.
    // shutdown() calls forceSave() so clean-exit safety is unaffected.
    this.taskService.setSaveDebounceMs(300);
    this.totService.setSaveDebounceMs(300);
    this.bridgeService.setSaveDebounceMs(300);

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

    // Register server-level utility tools
    this.toolRegistry.register(
      'reload_state',
      {
        name: 'reload_state',
        description: 'Reload state from storage and share it across all services. Useful after manually deleting or editing the state file.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      async () => {
        const sharedState = await this.storageAdapter.load();
        this.taskService.setState(sharedState);
        this.totService.setState(sharedState);
        this.bridgeService.setState(sharedState);
        return { success: true };
      }
    );

    this.toolRegistry.register(
      'clear_state',
      {
        name: 'clear_state',
        description: 'Clear all state from storage and memory. This deletes the state file and resets all services to empty state. Useful for starting fresh without restarting the server.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      async () => {
        await this.storageAdapter.clear();
        const emptyState = {
          tasks: new Map(),
          workflows: new Map(),
          workflowRuns: new Map(),
          strategies: new Map(),
          trees: new Map(),
          cognitiveLinks: new Map()
        };
        this.taskService.setState(emptyState);
        this.totService.setState(emptyState);
        this.bridgeService.setState(emptyState);
        return { success: true, message: 'State cleared successfully' };
      }
    );

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
        
        if (name === 'reload_state' || name === 'clear_state') {
          result = await this.toolRegistry.execute(name, args, null);
        } else if (taskToolDefinitions.some(def => def.name === name)) {
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
if (process.argv[1]) {
  try {
    const realEntryPath = fs.realpathSync(process.argv[1]);
    if (import.meta.url === pathToFileURL(realEntryPath).href) {
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
  } catch {
    // Not run as the main entry point; do nothing
  }
}

export { ThoughtflowServer };
