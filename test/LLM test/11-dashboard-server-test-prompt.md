# MCP Dashboard Server Test Prompt

## Objective
Ensure the embedded `dashboard-server.ts` correctly spins up, binds to the designated port, serves the UI assets, and accurately reflects the backend state to the frontend in real-time.

## Test Steps

### 1. Launch Dashboard Server
- Start the dashboard server script in the background (e.g., via `npm run start:dashboard` or equivalent command).
- Wait for the server to report it is listening on its port.
- **Verify:**
  - The port binds successfully without EADDRINUSE errors.
  - The server process runs stably without immediate crashes.

### 2. API Endpoint Verification
- Perform an HTTP GET request (using curl or a similar tool) to the dashboard's primary state API endpoint (e.g., `http://localhost:<PORT>/api/state`).
- **Verify:**
  - A `200 OK` response is returned.
  - The JSON payload exactly matches the structure of `thoughtflow-state.json`.

### 3. Real-time / Polling Sync Test
- While the dashboard server is running, use an MCP tool (like `create_task`) to modify the state.
- Immediately poll the dashboard API again.
- **Verify:**
  - The newly created task is instantly present in the API response served by the dashboard.

### 4. CORS and Security
- Perform an OPTIONS request to the dashboard server to test CORS.
- **Verify:**
  - Proper headers are returned if cross-origin access is required, or it correctly restricts to localhost.

### 5. Graceful Shutdown
- Terminate the dashboard server process.
- **Verify:**
  - The server cleans up its connections and exits with code 0.

## Expected Results
- The dashboard acts as a reliable, read-only (or bi-directional if configured) window into the active `thoughtflow-state.json` memory.
- Concurrency between the MCP server modifying state and the dashboard server reading state causes no file locks or race conditions.

## Common Issues to Check
1. **Stale State**: The dashboard caches an old version of the state and does not reflect live MCP tool changes.
2. **File Locking**: The dashboard holds a read lock on the JSON file, causing MCP save operations to throw permission errors.
3. **Port Conflicts**: Failure to gracefully handle standard port collisions.

## Test Commands
```bash
# Clean state


# Start server in background
# (Replace with exact script name)
npx ts-node src/dashboard-server.ts &

# Test endpoint
curl http://localhost:3000/api/state
```
