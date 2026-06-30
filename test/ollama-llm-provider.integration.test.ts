import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { OllamaLLMProvider } from '../dist/llm-providers/ollama-llm-provider.js';

describe('OllamaLLMProvider', () => {
  let provider: OllamaLLMProvider;
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  let model = process.env.OLLAMA_MODEL;

  before(async () => {
    const tempProvider = new OllamaLLMProvider(baseUrl, model || 'llama3');
    
    // Check if Ollama is running
    const isConnected = await tempProvider.checkConnection();
    if (!isConnected) {
      console.warn(`Ollama not available at ${baseUrl}, skipping tests`);
      return;
    }

    // If no model specified, use the first available model
    if (!model) {
      const models = await tempProvider.listModels();
      if (models.length > 0) {
        model = models[0];
        console.log(`Using available model: ${model}`);
      } else {
        console.warn('No models available in Ollama, skipping tests');
        return;
      }
    }

    provider = new OllamaLLMProvider(baseUrl, model);
  });

  after(() => {
    // Cleanup if needed
  });

  describe('generateThoughts', () => {
    it('should generate thoughts', async () => {
      if (!provider) {
        return;
      }

      const thoughts = await provider.generateThoughts(
        'How to improve productivity',
        3,
        'Work context',
        0.7
      );

      assert.ok(Array.isArray(thoughts));
      assert.strictEqual(thoughts.length, 3);
      thoughts.forEach(thought => {
        assert.ok(typeof thought === 'string');
        assert.ok(thought.length > 0);
      });
    });

    it('should track usage stats', async () => {
      if (!provider) {
        return;
      }

      await provider.generateThoughts('Test prompt', 1);
      const stats = provider.getLastUsageStats();

      if (stats) {
        assert.ok(typeof stats.promptTokens === 'number');
        assert.ok(typeof stats.completionTokens === 'number');
        assert.ok(typeof stats.totalTokens === 'number');
      }
    });
  });

  describe('evaluateThoughtStructured', () => {
    it('should evaluate thought with structured output', async () => {
      if (!provider) {
        return;
      }

      const result = await provider.evaluateThoughtStructured(
        'Implement a feature using TypeScript',
        'Build a web application',
        'Frontend development context'
      );

      assert.ok(result);
      assert.ok(typeof result.overallScore === 'number');
      assert.ok(result.overallScore >= 0 && result.overallScore <= 100);
      assert.ok(typeof result.reasoning === 'string');
      assert.ok(result.criteriaScores);
      assert.ok(typeof result.creativity === 'number');
      assert.ok(typeof result.risk === 'number');
    });
  });

  describe('selfReflect', () => {
    it('should reflect on thought with feedback', async () => {
      if (!provider) {
        return;
      }

      const improved = await provider.selfReflect(
        'Use vanilla JavaScript',
        'Consider using a framework for better maintainability'
      );

      assert.ok(typeof improved === 'string');
      assert.ok(improved.length > 0);
    });
  });

  describe('refineThought', () => {
    it('should refine thought based on goal', async () => {
      if (!provider) {
        return;
      }

      const refined = await provider.refineThought(
        'Build a simple todo list',
        'Create a comprehensive task management system'
      );

      assert.ok(typeof refined === 'string');
      assert.ok(refined.length > 0);
    });
  });

  describe('synthesizeThoughts', () => {
    it('should synthesize multiple thoughts', async () => {
      if (!provider) {
        return;
      }

      const thoughts = [
        'Use React for the frontend',
        'Implement with TypeScript',
        'Add unit tests'
      ];

      const synthesized = await provider.synthesizeThoughts(
        thoughts,
        'Build a robust web application'
      );

      assert.ok(typeof synthesized === 'string');
      assert.ok(synthesized.length > 0);
    });
  });

  describe('checkConnection', () => {
    it('should check if Ollama is available', async () => {
      const isConnected = await provider.checkConnection();
      assert.ok(typeof isConnected === 'boolean');
    });
  });

  describe('listModels', () => {
    it('should list available models', async () => {
      const isConnected = await provider.checkConnection();
      if (!isConnected) {
        return;
      }

      const models = await provider.listModels();
      assert.ok(Array.isArray(models));
    });
  });
});
