# superpack-workspace-filter (example)

Minimal example plugin using `sandbox_workspace_ready` with agent filtering.
Patterned after `~/.openclaw/extensions/superpack-snitch/`.

## Files
- `openclaw.plugin.json`
- `package.json`
- `src/index.ts`

## Behavior
- Filters by `agentId` (configurable via `targetAgentId`).
- Copies `runs/<sessionKey>/in` from host agent workspace into the sandbox `./task/`.
- Writes `injection-manifest.json` into the sandbox root.

## Config (example)
```json
{
  "plugins": {
    "entries": {
      "superpack-workspace-filter": {
        "enabled": true,
        "config": {
          "targetAgentId": "code-only"
        }
      }
    }
  }
}
```

## Notes
- Hooks are run by the runtime; agents cannot invoke them directly.
- Use `event.agentWorkspaceDir` for host staging and `event.workspaceDir` for sandbox root.
