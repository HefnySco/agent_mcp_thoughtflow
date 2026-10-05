/**
 * Tool profile. "tasks" (default) exposes only the task/workflow/strategy tools
 * - the part that sees real use, and ~40% fewer tool schemas in every prompt.
 * "full" also exposes Tree of Thoughts (tree/thought) and the cognitive bridge.
 * Set THOUGHTFLOW_PROFILE=full to opt in.
 */
export function isFullProfile(): boolean {
  return (process.env.THOUGHTFLOW_PROFILE || 'tasks').toLowerCase() === 'full';
}
