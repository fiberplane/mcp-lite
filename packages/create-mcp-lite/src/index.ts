#!/usr/bin/env node
import { intro, isCancel, outro } from "@clack/prompts";
import pico from "picocolors";
import {
  actionAIAssistant,
  promptAIAssistant,
} from "./actions/ai-assistant/ai-assistant";
import { actionDependencies, promptDependencies } from "./actions/dependencies";
import { actionGit, promptGit } from "./actions/git";
import { promptPath } from "./actions/path";
import { actionTemplate } from "./actions/template";
import { promptTemplate } from "./actions/template-selection";
import { FIBERPLANE_TITLE } from "./const";
import { initContext } from "./context";
import { isError } from "./types";
import { handleCancel, handleError } from "./utils";

async function main() {
  console.log("");
  console.log(pico.cyan(FIBERPLANE_TITLE));
  console.log("");

  intro("🚀 create-mcp-lite");

  const context = initContext();

  const prompts = [
    promptTemplate,
    promptPath,
    promptAIAssistant,
    promptDependencies,
    promptGit,
  ];

  for (const prompt of prompts) {
    if (!prompt) {
      continue;
    }

    const result = await prompt(context);
    if (isCancel(result)) {
      handleCancel();
    }

    if (isError(result)) {
      handleError(result);
    }
  }

  const actions = [
    actionTemplate,
    actionAIAssistant,
    actionDependencies,
    actionGit,
  ];

  for (const action of actions) {
    const result = await action(context);

    if (isCancel(result)) {
      handleCancel();
    }

    if (isError(result)) {
      handleError(result);
    }
  }

  const devCommand = context.template === "bun" ? "bun run dev" : "npm run dev";
  const deployInfo =
    context.template === "cloudflare"
      ? `\n# Deploy to Cloudflare:\n${context.packageManager} run deploy\n`
      : "";

  outro(`🚀 MCP project created successfully in ${context.path}!

${pico.cyan("Next steps:")}

# Navigate to your project:
cd ${context.name}

# Start the dev server:
${devCommand}
${deployInfo}
# Learn more about mcp-lite:
open https://github.com/fiberplane/mcp
`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
