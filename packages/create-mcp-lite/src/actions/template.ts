import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { spinner } from "@clack/prompts";
import { downloadTemplate } from "giget";
import pico from "picocolors";
import type { Context } from "../context";
import type { Template } from "../types";

const TEMPLATE_URLS: Record<Template, string> = {
  bun: "github:fiberplane/mcp-lite/templates/starter-mcp-bun",
  cloudflare: "github:fiberplane/mcp-lite/templates/starter-mcp-cloudflare",
  "chatgpt-app-sdk": "github:fiberplane/mcp-lite/templates/starter-chatgpt-app-sdk",
};

// TEMPLATE_ROOT_PATH: Override for local development to avoid GitHub downloads.
// When set, templates are copied from the local filesystem instead of being fetched from GitHub.
// Example: TEMPLATE_ROOT_PATH=../../templates (relative to create-mcp-lite package)
function getLocalTemplatePath(template: Template): string | null {
  const templateRoot = process.env.TEMPLATE_ROOT_PATH;
  if (!templateRoot) {
    return null;
  }

  const resolvedRoot = resolve(templateRoot);

  // Map template names to their directory names
  const templateDir = template === "bun" || template === "cloudflare"
    ? `starter-mcp-${template}`
    : `starter-${template}`;

  const templatePath = join(resolvedRoot, templateDir);

  if (existsSync(templatePath)) {
    return templatePath;
  }

  return null;
}

export async function actionTemplate(context: Context) {
  if (!context.path) {
    throw new Error("Path not set");
  }

  if (!context.template) {
    throw new Error("Template not selected");
  }

  const s = spinner();
  s.start("Creating MCP project from template...");

  try {
    // Ensure the directory exists
    if (!existsSync(context.path)) {
      mkdirSync(context.path, { recursive: true });
    }

    // Check if using local templates (for development)
    const localTemplatePath = getLocalTemplatePath(context.template);

    if (localTemplatePath) {
      // Copy from local filesystem
      cpSync(localTemplatePath, context.path, { recursive: true });
    } else {
      // Download from GitHub
      const templateUrl = TEMPLATE_URLS[context.template];
      await downloadTemplate(templateUrl, {
        dir: context.path,
        force: true,
      });
    }

    // Update package.json name field with the project directory name
    const packageJsonPath = join(context.path, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const packageJsonContent = readFileSync(packageJsonPath, "utf-8");
        const packageJson = JSON.parse(packageJsonContent);

        // Set the name to the basename of the path (project directory name)
        packageJson.name = basename(context.path);

        // Write back the updated package.json
        writeFileSync(
          packageJsonPath,
          `${JSON.stringify(packageJson, null, 2)}\n`,
        );
      } catch (_error) {
        // If package.json parsing fails, continue without updating
        console.warn(
          `${pico.yellow("⚠")} Could not update package.json name field`,
        );
      }
    }

    s.stop(`${pico.green("✓")} MCP template downloaded successfully`);
  } catch (error) {
    s.stop(`${pico.red("✗")} Failed to download template`);
    throw error;
  }
}
