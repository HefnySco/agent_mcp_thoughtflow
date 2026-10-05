#!/usr/bin/env node
/**
 * Offline cleanup of thoughtflow-state.json: backs the file up, then repairs
 * links, merges duplicate workflows, re-derives workflow/strategy status and
 * drops empty implicit strategies. Same pass the server runs on startup.
 *
 *   npm run maintain            # apply
 *   npm run maintain -- --dry   # report only
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JsonStorageAdapter } from './storage/JsonStorageAdapter.js';
import { runMaintenance } from './utils/stateMaintenance.js';

const file = process.env.THOUGHTFLOW_STATE_FILE
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'thoughtflow-state.json');
const dry = process.argv.includes('--dry');

const adapter = new JsonStorageAdapter(file);
const state = await adapter.load();
const before = { tasks: state.tasks.size, workflows: state.workflows.size, strategies: state.strategies.size };
const report = runMaintenance(state);

console.log(JSON.stringify({ file, before, report, after: { tasks: state.tasks.size, workflows: state.workflows.size, strategies: state.strategies.size } }, null, 2));
if (dry || !report.changed) {
  console.log(dry ? 'Dry run - nothing written.' : 'Nothing to change.');
} else {
  const backup = `${file}.premaintain-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(file, backup);
  await adapter.save(state);
  console.log(`Saved. Backup: ${backup}`);
}
