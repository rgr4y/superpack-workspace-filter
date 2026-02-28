import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SESSION_KEY = "agent:main:subagent:code-only:abc123";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wsf-test-"));
}

function writeFile(dir: string, name: string, content = "x"): string {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

function makeEvent(overrides: Partial<{
  workspaceDir: string;
  agentWorkspaceDir: string;
  agentId: string;
  sessionKey: string;
  scopeKey: string;
}> = {}) {
  return {
    workspaceDir: overrides.workspaceDir ?? "/tmp/sandbox",
    agentWorkspaceDir: overrides.agentWorkspaceDir ?? "/tmp/agent",
    agentId: overrides.agentId ?? "code-only",
    sessionKey: overrides.sessionKey ?? TEST_SESSION_KEY,
    scopeKey: overrides.scopeKey ?? "abc123",
  };
}

function makeApi(cfg: { targetAgentId?: string } = {}) {
  const logs: string[] = [];
  return {
    pluginConfig: cfg,
    logger: { info: (msg: string) => logs.push(msg) },
    logs,
    _handlers: {} as Record<string, Function>,
    on(hookName: string, handler: Function) {
      this._handlers[hookName] = handler;
    },
    async fire(hookName: string, event: object) {
      await this._handlers[hookName]?.(event);
    },
  };
}

async function loadPlugin() {
  const mod = await import("./index.ts");
  return mod.default;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("superpack-workspace-filter sanity", () => {
  let sandboxDir: string;
  let agentDir: string;

  beforeEach(() => {
    sandboxDir = makeTmpDir();
    agentDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(sandboxDir, { recursive: true, force: true });
    fs.rmSync(agentDir, { recursive: true, force: true });
  });

  it("skips when agentId doesn't match targetAgentId", async () => {
    const plugin = await loadPlugin();
    const api = makeApi({ targetAgentId: "code-only" });
    plugin.register(api as any);

    writeFile(sandboxDir, "SOUL.md", "should stay");

    await api.fire("sandbox_workspace_ready", makeEvent({
      agentId: "some-other-agent",
      workspaceDir: sandboxDir,
      agentWorkspaceDir: agentDir,
    }));

    expect(fs.existsSync(path.join(sandboxDir, "SOUL.md"))).toBe(true);
  });

  it("prunes everything except AGENTS.md and TOOLS.md", async () => {
    const plugin = await loadPlugin();
    const api = makeApi({ targetAgentId: "code-only" });
    plugin.register(api as any);

    writeFile(sandboxDir, "AGENTS.md", "keep");
    writeFile(sandboxDir, "TOOLS.md", "keep");
    writeFile(sandboxDir, "SOUL.md", "prune");
    writeFile(sandboxDir, "IDENTITY.md", "prune");
    writeFile(sandboxDir, ".bootstrap", "prune");
    writeFile(sandboxDir, ".heartbeat", "prune");

    await api.fire("sandbox_workspace_ready", makeEvent({
      agentId: "code-only",
      workspaceDir: sandboxDir,
      agentWorkspaceDir: agentDir,
    }));

    expect(fs.existsSync(path.join(sandboxDir, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(sandboxDir, "TOOLS.md"))).toBe(true);
    expect(fs.existsSync(path.join(sandboxDir, "SOUL.md"))).toBe(false);
    expect(fs.existsSync(path.join(sandboxDir, "IDENTITY.md"))).toBe(false);
    expect(fs.existsSync(path.join(sandboxDir, ".bootstrap"))).toBe(false);
    expect(fs.existsSync(path.join(sandboxDir, ".heartbeat"))).toBe(false);
  });

  it("injects task files into task/ subdir using sessionKey as run path", async () => {
    const plugin = await loadPlugin();
    const api = makeApi({ targetAgentId: "code-only" });
    plugin.register(api as any);

    // Coordinator stages files at runs/{sessionKey}/in before spawning
    const runIn = path.join(agentDir, "runs", TEST_SESSION_KEY, "in");
    writeFile(runIn, "task.md", "do the thing");
    writeFile(runIn, "data/input.json", '{"key":"val"}');

    writeFile(sandboxDir, "AGENTS.md", "keep");
    writeFile(sandboxDir, "TOOLS.md", "keep");

    await api.fire("sandbox_workspace_ready", makeEvent({
      agentId: "code-only",
      workspaceDir: sandboxDir,
      agentWorkspaceDir: agentDir,
      sessionKey: TEST_SESSION_KEY,
    }));

    expect(fs.existsSync(path.join(sandboxDir, "task", "task.md"))).toBe(true);
    expect(fs.existsSync(path.join(sandboxDir, "task", "data", "input.json"))).toBe(true);
    expect(fs.readFileSync(path.join(sandboxDir, "task", "task.md"), "utf-8")).toBe("do the thing");
  });

  it("missing run dir doesn't throw or wipe sandbox", async () => {
    const plugin = await loadPlugin();
    const api = makeApi({ targetAgentId: "code-only" });
    plugin.register(api as any);

    writeFile(sandboxDir, "AGENTS.md", "keep");
    writeFile(sandboxDir, "TOOLS.md", "keep");

    // No staging dir created — simulates coordinator not staging anything
    await expect(
      api.fire("sandbox_workspace_ready", makeEvent({
        agentId: "code-only",
        workspaceDir: sandboxDir,
        agentWorkspaceDir: agentDir,
        sessionKey: "agent:main:subagent:code-only:no-such-run",
      }))
    ).resolves.not.toThrow();

    expect(fs.existsSync(path.join(sandboxDir, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(sandboxDir, "TOOLS.md"))).toBe(true);
    expect(fs.existsSync(path.join(sandboxDir, "task"))).toBe(false);
  });

  it("manifest uses sessionKey as injectedFrom path, no runId field", async () => {
    const plugin = await loadPlugin();
    const api = makeApi({ targetAgentId: "code-only" });
    plugin.register(api as any);

    const sessionKey = "agent:main:subagent:code-only:xyz";
    const runIn = path.join(agentDir, "runs", sessionKey, "in");
    writeFile(runIn, "task.md", "task");
    writeFile(sandboxDir, "AGENTS.md", "keep");

    await api.fire("sandbox_workspace_ready", makeEvent({
      agentId: "code-only",
      workspaceDir: sandboxDir,
      agentWorkspaceDir: agentDir,
      sessionKey,
      scopeKey: "xyz",
    }));

    const manifest = JSON.parse(
      fs.readFileSync(path.join(sandboxDir, "injection-manifest.json"), "utf-8")
    );
    expect(manifest.agentId).toBe("code-only");
    expect(manifest.sessionKey).toBe(sessionKey);
    expect(manifest.scopeKey).toBe("xyz");
    expect(manifest.injectedFrom).toContain(sessionKey);
    expect(manifest.kept).toEqual(expect.arrayContaining(["AGENTS.md", "TOOLS.md"]));
    expect(manifest).not.toHaveProperty("runId");
  });

  it("logs activity throughout", async () => {
    const plugin = await loadPlugin();
    const api = makeApi({ targetAgentId: "code-only" });
    plugin.register(api as any);

    writeFile(sandboxDir, "AGENTS.md", "keep");
    writeFile(sandboxDir, "SOUL.md", "prune");

    await api.fire("sandbox_workspace_ready", makeEvent({
      agentId: "code-only",
      workspaceDir: sandboxDir,
      agentWorkspaceDir: agentDir,
    }));

    const allLogs = api.logs.join("\n");
    expect(allLogs).toContain("[workspace-filter]");
    expect(allLogs).toContain("agent=code-only");
  });
});
