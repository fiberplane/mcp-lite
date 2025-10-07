import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { note, spinner } from "@clack/prompts";
import pico from "picocolors";
import type { Context } from "../../context";
import { AGENTS_MD } from "./constants";

export async function actionWindsurf(context: Context) {
  if (!context.path) {
    throw new Error("Path not set");
  }

  const s = spinner();
  s.start("Setting up Windsurf configuration...");

  try {
    const agentsPath = join(context.path, "AGENTS.md");

    if (!existsSync(agentsPath)) {
      writeFileSync(agentsPath, AGENTS_MD);
    }

    s.stop(`${pico.green("✓")} Windsurf configuration created`);

    note(`${pico.cyan("Windsurf setup complete!")}

${pico.dim("Created:")}
• AGENTS.md
`);
  } catch (error) {
    s.stop(`${pico.red("✗")} Failed to set up Windsurf configuration`);
    throw error;
  }
}
