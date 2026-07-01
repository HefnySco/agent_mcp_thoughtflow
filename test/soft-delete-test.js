#!/usr/bin/env node

/**
 * Test script for soft-delete implementation
 * Tests: create → delete → list (hidden) → purge → verify gone
 */

import { TaskOrchestratorService } from '../dist/services/TaskOrchestratorService.js';
import { JsonStorageAdapter } from '../dist/storage/JsonStorageAdapter.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testSoftDelete() {
  console.log('=== Soft-Delete Implementation Test ===\n');
  
  // Use a test state file
  const testStatePath = join(__dirname, 'test-state-soft-delete.json');
  const storageAdapter = new JsonStorageAdapter(testStatePath);
  await storageAdapter.initialize();
  await storageAdapter.clear(); // Start clean
  
  const taskService = new TaskOrchestratorService(storageAdapter, 'TestService');
  await taskService.load();
  
  try {
    // Step 1: Create a task
    console.log('Step 1: Creating a task...');
    const task = taskService.createTask({
      name: 'Test Task for Soft-Delete',
      description: 'This task will be soft-deleted',
      status: 'pending'
    });
    console.log(`✓ Created task: ${task.id} - ${task.name}\n`);
    
    // Step 2: Verify task exists in list
    console.log('Step 2: Listing tasks (should include new task)...');
    const tasksBeforeDelete = taskService.listTasks();
    console.log(`✓ Tasks before delete: ${tasksBeforeDelete.length}`);
    console.log(`  Task IDs: ${tasksBeforeDelete.map(t => t.id).join(', ')}\n`);
    
    // Step 3: Soft-delete the task
    console.log('Step 3: Soft-deleting the task...');
    const deleted = taskService.deleteTask(task.id);
    console.log(`✓ Delete result: ${deleted}\n`);
    
    // Step 4: List tasks (should be hidden by default)
    console.log('Step 4: Listing tasks (should hide deleted task)...');
    const tasksAfterDelete = taskService.listTasks();
    console.log(`✓ Tasks after delete: ${tasksAfterDelete.length}`);
    console.log(`  Task IDs: ${tasksAfterDelete.map(t => t.id).join(', ')}`);
    if (tasksAfterDelete.length === 0) {
      console.log('✓ Deleted task is hidden from default list\n');
    } else {
      console.log('✗ ERROR: Deleted task still visible in default list\n');
      process.exit(1);
    }
    
    // Step 5: List tasks with includeDeleted=true (should show deleted task)
    console.log('Step 5: Listing tasks with includeDeleted=true (should show deleted task)...');
    const tasksWithDeleted = taskService.listTasks(undefined, true);
    console.log(`✓ Tasks with includeDeleted: ${tasksWithDeleted.length}`);
    console.log(`  Task IDs: ${tasksWithDeleted.map(t => t.id).join(', ')}`);
    
    // Get the full task object to check isDeleted flag
    const deletedTaskFull = taskService.getTask(task.id, true);
    if (deletedTaskFull && deletedTaskFull.isDeleted) {
      console.log(`✓ Deleted task is visible with includeDeleted=true`);
      console.log(`  isDeleted: ${deletedTaskFull.isDeleted}`);
      console.log(`  deletedAt: ${deletedTaskFull.deletedAt}\n`);
    } else {
      console.log('✗ ERROR: Deleted task not found or not marked as deleted\n');
      process.exit(1);
    }
    
    // Step 6: Purge deleted items
    console.log('Step 6: Purging soft-deleted items...');
    const purgeResult = await taskService.purgeDeleted('task');
    console.log(`✓ Purge result: ${JSON.stringify(purgeResult)}\n`);
    
    // Step 7: Verify task is completely gone
    console.log('Step 7: Listing tasks after purge (should be empty)...');
    const tasksAfterPurge = taskService.listTasks(undefined, true);
    console.log(`✓ Tasks after purge: ${tasksAfterPurge.length}`);
    if (tasksAfterPurge.length === 0) {
      console.log('✓ Task is completely gone after purge\n');
    } else {
      console.log('✗ ERROR: Task still exists after purge\n');
      process.exit(1);
    }
    
    console.log('=== All Tests Passed! ===');
    
  } catch (error) {
    console.error('✗ Test failed with error:', error);
    process.exit(1);
  } finally {
    await taskService.shutdown();
    await storageAdapter.close();
    // Clean up test state file
    const fs = await import('fs');
    if (fs.existsSync(testStatePath)) {
      fs.unlinkSync(testStatePath);
    }
  }
}

testSoftDelete();
