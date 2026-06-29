# Thoughtflow Dashboard

A modern, responsive web dashboard for monitoring the Thoughtflow MCP server state.

## Features

- **Overview Cards**: Quick stats for Strategies, Trees, Tasks, Workflows, and Cognitive Links
- **Strategies Panel**: View all strategies with their linked trees and workflows
- **Tasks Panel**: Status breakdown (Pending/In Progress/Completed/Failed) with recent tasks
- **Trees/Ideas Panel**: List of trees with thought counts and ASCII visualization
- **Workflows Panel**: View all workflows with task counts
- **Cognitive Links Panel**: Display thought-task provenance links
- **Auto-refresh**: Data refreshes every 30 seconds
- **Manual Refresh**: Click the Refresh button to update immediately
- **Tree Visualization**: Click "Visualize" on any tree to see its ASCII structure

## Usage

### Start the Dashboard Server

```bash
npm run dashboard
```

The dashboard will be available at:
- **Dashboard**: http://localhost:3000/dashboard
- **API**: http://localhost:3000/api/state

### Custom Port

Set the `DASHBOARD_PORT` environment variable to use a different port:

```bash
DASHBOARD_PORT=8080 npm run dashboard
```

## Architecture

The dashboard uses a simple HTTP server that:
1. Serves the static HTML dashboard from the `public/` directory
2. Provides a REST API endpoint (`/api/state`) that reads `thoughtflow-state.json`
3. The dashboard JavaScript fetches state from the API and updates the UI

This architecture keeps the dashboard independent of the MCP server's stdio transport, allowing both to run simultaneously.

## Technical Stack

- **Server**: Node.js HTTP module (no external dependencies)
- **Styling**: Tailwind CSS via CDN
- **JavaScript**: Vanilla JS with fetch() for API calls
- **Data**: Reads directly from `thoughtflow-state.json`

## File Structure

```
agent_mcp_thoughtflow/
├── src/
│   └── dashboard-server.ts    # HTTP server for dashboard
├── public/
│   └── dashboard.html         # Dashboard UI (self-contained)
├── thoughtflow-state.json     # State file (read by dashboard)
└── package.json               # Includes dashboard script
```

## Running with MCP Server

The dashboard can run alongside the MCP server:

```bash
# Terminal 1: Start MCP server
npm run dev

# Terminal 2: Start dashboard
npm run dashboard
```

Both processes read from the same `thoughtflow-state.json` file, so the dashboard will reflect changes made through the MCP server.

## Future Enhancements

Potential improvements for future versions:
- SVG visualizations for workflows and strategies (from VisualizationService)
- Interactive tree editing
- Task creation/management from dashboard
- Real-time WebSocket updates instead of polling
- Historical data and trends
- Search and filtering capabilities
