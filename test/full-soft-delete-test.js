#!/usr/bin/env node

/**
 * Full soft-delete implementation test
 * Tests: create → delete → list (hidden) → includeDeleted (visible) → restore → purge → gone
 */

import { TaskOrchestratorService } from '../dist/services/TaskOrchestratorService.js';
import { JsonStorageAdapter } from '../dist/storage/JsonStorageAdapter.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testFullSoftDelete() {
  console.log('=== Full Soft-Delete Implementation Test ===\n');
  
  // Use a test state file
  const testStatePath = join(__dirname, 'test-state-full-soft-delete.json');
  const storageAdapter = new JsonStorageAdapter(testStatePath);
  await storageAdapter.initialize();
  await storageAdapter.clear(); // Start clean
  
  const taskService = new TaskOrchestratorService(storageAdapter, 'TestService');
  await taskService.load();
  
  try {
    // Step 1: Create a task
    console.log('Step 1: Creating a task...');
    const task = taskService.createTask({
      name: 'Test Task for Full Soft-Delete',
      description: 'This task will be soft-deleted, restored, and purged',
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
    
    // Step 6: Restore the deleted task
    console.log('Step 6: Restoring the deleted task...');
    const restored = taskService.restoreDeleted('task', task.id);
    console.log(`✓ Restore result: ${restored}\n`);
    
    // Step 7: Verify task is visible again without includeDeleted
    console.log('Step 7: Listing tasks after restore (should show restored task)...');
    const tasksAfterRestore = taskService.listTasks();
    console.log(`✓ Tasks after restore: ${tasksAfterRestore.length}`);
    console.log(`  Task IDs: ${tasksAfterRestore.map(t => t.id).join(', ')}`);
    
    const restoredTaskFull = taskService.getTask(task.id);
    if (restoredTaskFull && !restoredTaskFull.isDeleted) {
      console.log(`✓ Restored task is visible without includeDeleted`);
      console.log(`  isDeleted: ${restoredTaskFull.isDeleted}`);
      console.log(`  deletedAt: ${restoredTaskFull.deletedAt}\n`);
    } else {
      console.log('✗ ERROR: Restored task not visible or still marked as deleted\n');
      process.exit(1);
    }
    
    // Step 8: Delete again for purge test
    console.log('Step 8: Soft-deleting the task again for purge test...');
    const deletedAgain = taskService.deleteTask(task.id);
    console.log(`✓ Delete result: ${deletedAgain}\n`);
    
    // Step 9: Purge deleted items
    console.log('Step 9: Purging soft-deleted items...');
    const purgeResult = await taskService.purgeDeleted('task');
    console.log(`✓ Purge result: ${JSON.stringify(purgeResult)}\n`);
    
    // Step 10: Verify task is completely gone
    console.log('Step 10: Listing tasks after purge (should be empty)...');
    const tasksAfterPurge = taskService.listTasks(undefined, true);
    console.log(`✓ Tasks after purge: ${tasksAfterPurge.length}`);
    if (tasksAfterPurge.length === 0) {
      console.log('✓ Task is completely gone after purge\n');
    } else {
      console.log('✗ ERROR: Task still exists after purge\n');
      process.exit(1);
    }
    
    // Step 11: Test restore on non-existent task
    console.log('Step 11: Testing restore on non-existent task...');
    const restoreNonExistent = taskService.restoreDeleted('task', 'non-existent-id');
    console.log(`✓ Restore non-existent result: ${restoreNonExistent} (should be false)\n`);
    
    // Step 12: Test restore on non-deleted task
    console.log('Step 12: Testing restore on non-deleted task...');
    const newTask = taskService.createTask({
      name: 'Active Task',
      description: 'This task is not deleted',
      status: 'pending'
    });
    const restoreActive = taskService.restoreDeleted('task', newTask.id);
    console.log(`✓ Restore active task result: ${restoreActive} (should be false)\n`);
    
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

testFullSoftDelete();
