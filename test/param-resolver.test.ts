import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveArgs } from '../dist/utils/paramResolver.js';
import type { ParamFieldSpec } from '../dist/utils/paramResolver.js';

const taskSpec: ParamFieldSpec[] = [
  { canonical: 'id', type: 'string', numericRefTemplate: (n) => `task-${n}` },
  { canonical: 'name', aliases: ['title', 'taskName'], type: 'string' },
];

describe('resolveArgs', () => {
  it('resolves named args under the canonical name', () => {
    assert.deepStrictEqual(resolveArgs({ id: 'task-1', name: 'Do the thing' }, taskSpec), {
      id: 'task-1',
      name: 'Do the thing'
    });
  });

  it('resolves named args under an alias', () => {
    assert.deepStrictEqual(resolveArgs({ id: 'task-1', title: 'Do the thing' }, taskSpec), {
      id: 'task-1',
      name: 'Do the thing'
    });
  });

  it('is case-insensitive on key names', () => {
    assert.deepStrictEqual(resolveArgs({ ID: 'task-1', TaskName: 'Do the thing' }, taskSpec), {
      id: 'task-1',
      name: 'Do the thing'
    });
  });

  it('resolves positional args in field order', () => {
    assert.deepStrictEqual(resolveArgs(['task-1', 'dasdas'], taskSpec), {
      id: 'task-1',
      name: 'dasdas'
    });
  });

  it('formats a numeric positional shorthand via numericRefTemplate', () => {
    assert.deepStrictEqual(resolveArgs([1, 'dasdas'], taskSpec), {
      id: 'task-1',
      name: 'dasdas'
    });
  });

  it('treats task(1, "dasdas") the same as task("task-1", "dasdas")', () => {
    const a = resolveArgs([1, 'dasdas'], taskSpec);
    const b = resolveArgs(['task-1', 'dasdas'], taskSpec);
    assert.deepStrictEqual(a, b);
  });

  it('resolves a bare scalar to the first field', () => {
    assert.deepStrictEqual(resolveArgs('task-1', taskSpec), { id: 'task-1' });
  });

  it('passes through unrecognized fields instead of dropping them', () => {
    assert.deepStrictEqual(resolveArgs({ id: 'task-1', name: 'x', metadata: { a: 1 } }, taskSpec), {
      id: 'task-1',
      name: 'x',
      metadata: { a: 1 }
    });
  });

  it('coerces numeric strings and boolean-like strings', () => {
    const spec: ParamFieldSpec[] = [
      { canonical: 'order', type: 'number' },
      { canonical: 'verified', type: 'boolean' }
    ];
    assert.deepStrictEqual(resolveArgs({ order: '3', verified: 'true' }, spec), {
      order: 3,
      verified: true
    });
  });

  it('wraps a scalar into an array when the field expects an array', () => {
    const spec: ParamFieldSpec[] = [{ canonical: 'dependencies', type: 'array' }];
    assert.deepStrictEqual(resolveArgs({ dependencies: 'task-1' }, spec), {
      dependencies: ['task-1']
    });
  });
});
