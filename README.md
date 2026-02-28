# superpack-workspace-filter (example)

Minimal example plugin using `sandbox_workspace_ready` with agent filtering.
Patterned after `~/.openclaw/extensions/superpack-snitch/`.

## Files
- `openclaw.plugin.json`
- `package.json`
- `src/index.ts`

## Behavior
- Filters by `agentId` (configurable via `targetAgentId`).
- Copies `workspace/runs/<runId>/in` from host agent workspace into the sandbox root.
- Writes `injection-manifest.json` into the sandbox root.

## Config (example)
```json
{
  "plugins": {
    "config": {
      "superpack-workspace-filter": {
        "targetAgentId": "code-only",
        "runId": "dev-run"
      }
    }
  }
}
```

## Notes
- Hooks are run by the runtime; agents cannot invoke them directly.
- Use `event.agentWorkspaceDir` for host staging and `event.workspaceDir` for sandbox root.
