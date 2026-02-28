import fs from "node:fs";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const KEEP = new Set(["AGENTS.md", "TOOLS.md"]);
const INJECT_SUBDIR = "task";

function copyDir(src: string, dst: string, log: (msg: string) => void): void {
  if (!fs.existsSync(src)) {
    log(`[workspace-filter] inject source not found, skipping: ${src}`);
    return;
  }
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d, log);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function pruneWorkspace(workspaceDir: string, log: (msg: string) => void): void {
  for (const entry of fs.readdirSync(workspaceDir, { withFileTypes: true })) {
    if (KEEP.has(entry.name)) continue;
    const target = path.join(workspaceDir, entry.name);
    try {
      if (entry.isDirectory()) {
        fs.rmSync(target, { recursive: true, force: true });
      } else {
        fs.unlinkSync(target);
      }
      log(`[workspace-filter] removed: ${entry.name}`);
    } catch (err) {
      log(`[workspace-filter] failed to remove ${entry.name}: ${err}`);
    }
  }
}

const plugin = {
  id: "superpack-workspace-filter",
  name: "Superpack Workspace Filter",
  description: "Prunes sandbox workspace to AGENTS.md + TOOLS.md, then injects task files",
  register(api: OpenClawPluginApi) {
    api.on("sandbox_workspace_ready", async (event) => {
      const cfg = api.pluginConfig as { targetAgentId?: string } | undefined;
      const targetAgentId = cfg?.targetAgentId ?? "code-only";

      if (event.agentId !== targetAgentId) return;

      const log = (msg: string) => api.logger?.info?.(msg) ?? console.log(msg);

      log(`[workspace-filter] firing for agent=${event.agentId} session=${event.sessionKey}`);

      const sandboxRoot = event.workspaceDir;

      // Step 1: prune everything except AGENTS.md and TOOLS.md
      try {
        pruneWorkspace(sandboxRoot, log);
        log(`[workspace-filter] pruned workspace, kept: ${[...KEEP].join(", ")}`);
      } catch (err) {
        log(`[workspace-filter] prune failed: ${err}`);
        // Don't abort — still try to inject
      }

      // Step 2: copy task files into a subdirectory
      // Coordinator stages files at runs/{sessionKey}/in before spawning the agent
      const hostRunIn = path.join(event.agentWorkspaceDir, "runs", event.sessionKey, "in");
      const injectDest = path.join(sandboxRoot, INJECT_SUBDIR);
      try {
        copyDir(hostRunIn, injectDest, log);
        log(`[workspace-filter] injected ${hostRunIn} → ${injectDest}`);
      } catch (err) {
        log(`[workspace-filter] inject failed: ${err}`);
      }

      // Step 3: write manifest
      const manifest = {
        agentId: event.agentId,
        sessionKey: event.sessionKey,
        scopeKey: event.scopeKey,
        injectedFrom: hostRunIn,
        injectedTo: injectDest,
        kept: [...KEEP],
      };
      try {
        fs.writeFileSync(
          path.join(sandboxRoot, "injection-manifest.json"),
          JSON.stringify(manifest, null, 2),
        );
        log(`[workspace-filter] manifest written`);
      } catch (err) {
        log(`[workspace-filter] manifest write failed: ${err}`);
      }
    });
  },
};

export default plugin;
