import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { note, spinner } from "@clack/prompts";
import pico from "picocolors";
import type { Context } from "../../context";
import { AGENTS_MD } from "./constants";

/**
 * @NOTE - As of writing, nested AGENTS.md within a project are not supported
 *         So if someone installs this as a package-within-a-project, then AGENTS.md will not get pickedup.
 * @TODO - Add a `.cursor/rule` file...
 */
export async function actionCursor(context: Context) {
  if (!context.path) {
    throw new Error("Path not set");
  }

  const s = spinner();
  s.start("Setting up Cursor configuration...");

  try {
    const agentsPath = join(context.path, "AGENTS.md");

    // Create AGENTS.md if it doesn't exist
    if (!existsSync(agentsPath)) {
      const agentsContent = AGENTS_MD;

      writeFileSync(agentsPath, agentsContent);
    }

    s.stop(`${pico.green("✓")} Cursor configuration created`);

    note(`${pico.cyan("Cursor setup complete!")}

${pico.dim("Created:")}
• AGENTS.md
`);
  } catch (error) {
    s.stop(`${pico.red("✗")} Failed to set up Cursor configuration`);
    throw error;
  }
}
