// Test file to verify module import doesn't auto-start server
import { ThoughtflowServer } from './dist/index.js';

console.log('Module imported successfully');
console.log('ThoughtflowServer class available:', typeof ThoughtflowServer);
console.log('No server should have auto-started');

// Verify we can manually instantiate
const server = new ThoughtflowServer();
console.log('Manual instantiation successful');
