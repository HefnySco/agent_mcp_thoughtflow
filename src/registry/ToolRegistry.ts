import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Tool handler function type
 * Takes args and the service instance
 */
export type ToolHandler = (args: any, service: any) => Promise<any>;

/**
 * Tool definition with handler
 */
export interface ToolDefinition {
  tool: Tool;
  handler: ToolHandler;
}

/**
 * ToolRegistry manages tool definitions and their handlers
 * Provides centralized tool registration and retrieval
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Register a tool with its handler
   */
  register(name: string, tool: Tool, handler: ToolHandler): void {
    this.tools.set(name, { tool, handler });
  }

  /**
   * Register multiple tools at once
   */
  registerBatch(tools: { name: string; tool: Tool; handler: ToolHandler }[]): void {
    tools.forEach(({ name, tool, handler }) => {
      this.register(name, tool, handler);
    });
  }

  /**
   * Get a tool definition by name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tool definitions
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tool schemas (for ListTools response)
   */
  getAllToolSchemas(): Tool[] {
    return Array.from(this.tools.values()).map(def => def.tool);
  }

  /**
   * Execute a tool by name with service instance
   */
  async execute(name: string, args: any, service: any): Promise<any> {
    const definition = this.tools.get(name);
    if (!definition) {
      throw new Error(`Tool '${name}' not found`);
    }
    return definition.handler(args, service);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Remove a tool
   */
  remove(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * Get tool count
   */
  size(): number {
    return this.tools.size;
  }
}
