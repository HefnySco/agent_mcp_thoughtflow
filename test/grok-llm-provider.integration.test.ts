import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { GrokLLMProvider } from '../dist/llm-providers/grok-llm-provider.js';

describe('GrokLLMProvider', () => {
  let provider: GrokLLMProvider;
  const apiKey = process.env.GROK_API_KEY;

  before(() => {
    if (!apiKey) {
      console.warn('GROK_API_KEY not set, skipping Grok provider tests');
      return;
    }
    provider = new GrokLLMProvider(apiKey, 'grok-3');
  });

  after(() => {
    // Cleanup if needed
  });

  describe('generateThoughts', () => {
    it('should generate thoughts', async () => {
      if (!apiKey) {
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
      if (!apiKey) {
        return;
      }

      await provider.generateThoughts('Test prompt', 1);
      const stats = provider.getLastUsageStats();

      assert.ok(stats);
      assert.ok(typeof stats.promptTokens === 'number');
      assert.ok(typeof stats.completionTokens === 'number');
      assert.ok(typeof stats.totalTokens === 'number');
    });
  });

  describe('evaluateThoughtStructured', () => {
    it('should evaluate thought with structured output', async () => {
      if (!apiKey) {
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
      if (!apiKey) {
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
      if (!apiKey) {
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
      if (!apiKey) {
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
});
