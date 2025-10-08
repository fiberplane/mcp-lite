import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { note, spinner } from "@clack/prompts";
import pico from "picocolors";
import type { Context } from "../../context";
import { AGENTS_MD } from "./constants";

export async function actionVSCode(context: Context) {
  if (!context.path) {
    throw new Error("Path not set");
  }

  const s = spinner();
  s.start("Setting up VSCode configuration...");

  try {
    const githubDir = join(context.path, ".github");
    const copilotInstructionsPath = join(githubDir, "copilot-instructions.md");
    // NOTE - VSCode (experimentally) supports AGENTS.md: https://code.visualstudio.com/updates/v1_104#_support-for-agentsmd-files-experimental
    const agentsPath = join(context.path, "AGENTS.md");

    // Ensure .github directory exists
    if (!existsSync(githubDir)) {
      mkdirSync(githubDir, { recursive: true });
    }

    // Create .github/copilot-instructions.md if it doesn't exist
    if (!existsSync(copilotInstructionsPath)) {
      const agentsContent = AGENTS_MD;

      writeFileSync(copilotInstructionsPath, agentsContent);
    }

    // Create AGENTS.md if it doesn't exist (experimental support)
    if (!existsSync(agentsPath)) {
      const agentsContent = AGENTS_MD;

      writeFileSync(agentsPath, agentsContent);
    }

    s.stop(`${pico.green("✓")} VSCode configuration created`);

    note(`${pico.cyan("VSCode setup complete!")}

${pico.dim("Created:")}
• .github/copilot-instructions.md
• AGENTS.md
`);
  } catch (error) {
    s.stop(`${pico.red("✗")} Failed to set up VSCode configuration`);
    throw error;
  }
}
