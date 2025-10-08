import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { note, spinner } from "@clack/prompts";
import pico from "picocolors";
import type { Context } from "../../context";
import { AGENTS_MD } from "./constants";

export async function actionClaudeCode(context: Context) {
  if (!context.path) {
    throw new Error("Path not set");
  }

  const s = spinner();
  s.start("Setting up Claude Code configuration...");

  try {
    const claudePath = join(context.path, "CLAUDE.md");

    // Create CLAUDE.md if it doesn't exist
    if (!existsSync(claudePath)) {
      const claudeContent = AGENTS_MD;

      writeFileSync(claudePath, claudeContent);
    }

    s.stop(`${pico.green("✓")} Claude Code configuration created`);

    note(`${pico.cyan("Claude Code setup complete!")}

${pico.dim("Created:")}
• CLAUDE.md
`);
  } catch (error) {
    s.stop(`${pico.red("✗")} Failed to set up Claude Code configuration`);
    throw error;
  }
}
