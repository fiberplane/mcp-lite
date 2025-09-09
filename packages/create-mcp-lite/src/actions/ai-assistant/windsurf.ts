import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { note, spinner } from "@clack/prompts";
import pico from "picocolors";
import type { Context } from "../../context";
import { AGENTS_MD, FIBERPLANE_MCP_CONFIG } from "./constants";

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function upsertMcpConfig(targetDir: string, targetPath: string) {
  ensureDir(targetDir);

  try {
    if (existsSync(targetPath)) {
      const raw = readFileSync(targetPath, "utf8");
      const existing = raw ? JSON.parse(raw) : {};
      const merged = {
        ...existing,
        mcpServers: {
          ...(existing?.mcpServers ?? {}),
          ...FIBERPLANE_MCP_CONFIG.mcpServers,
        },
      };
      writeFileSync(targetPath, JSON.stringify(merged, null, 2));
      return "updated" as const;
    }
  } catch {
    // Fall through to write fresh config
  }

  writeFileSync(targetPath, JSON.stringify(FIBERPLANE_MCP_CONFIG, null, 2));
  return "created" as const;
}

export async function actionWindsurf(context: Context) {
  if (!context.path) {
    throw new Error("Path not set");
  }

  const s = spinner();
  s.start("Setting up Windsurf MCP integration...");

  try {
    const agentsPath = join(context.path, "AGENTS.md");

    if (!existsSync(agentsPath)) {
      writeFileSync(agentsPath, AGENTS_MD);
    }

    const createdOrUpdated: string[] = [];

    // Only configure MCP if enabled
    if (context.fpMcpServerEnabled) {
      const home = homedir();
      const primaryDir = join(home, ".codeium", "windsurf");
      const primaryPath = join(primaryDir, "mcp_config.json");

      const altDir = join(home, ".config", "Codeium", "Windsurf");
      const altPath = join(altDir, "mcp_config.json");

      const primaryResult = upsertMcpConfig(primaryDir, primaryPath);
      createdOrUpdated.push(
        `~/.codeium/windsurf/mcp_config.json (${primaryResult})`,
      );

      // If the alternative location already exists, mirror the configuration there as well.
      if (existsSync(altDir) || existsSync(altPath)) {
        const altResult = upsertMcpConfig(altDir, altPath);
        createdOrUpdated.push(
          `~/.config/Codeium/Windsurf/mcp_config.json (${altResult})`,
        );
      }
    }

    s.stop(`${pico.green("✓")} Windsurf MCP configured`);

    const allFiles = ["AGENTS.md"];
    if (context.fpMcpServerEnabled) {
      allFiles.push(...createdOrUpdated);
    }

    note(`${pico.cyan("Windsurf setup complete!")}
    
${pico.dim("Created/Updated:")}
• ${allFiles.join("\n• ")}

${context.fpMcpServerEnabled ? "Windsurf will now connect to the Fiberplane MCP server." : "Windsurf setup complete."}`);
  } catch (error) {
    s.stop(`${pico.red("✗")} Failed to set up Windsurf configuration`);
    throw error;
  }
}
