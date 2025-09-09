import { PROJECT_NAME } from "./const";
import type { AIAssistant, Flags } from "./types";
import { getPackageManager } from "./utils";

export interface Context {
  cwd: string;
  packageManager: string;
  name: string;
  path?: string;
  description?: string;
  aiAssistant?: AIAssistant;
  flags: Flags;
  fpMcpServerEnabled: boolean;
  deploymentUrl?: string;
}

/**
 * Creates the context object passed to all CLI actions.
 * Parses first arg passed to the CLI as the directory
 * @TODO - Accept flags for various arguments (e.g. --path, --ai-assistant, --template, --deploy)
 */
export function initContext(): Context {
  const projectName = parseProjectName(process.argv);

  return {
    cwd: process.cwd(),
    name: projectName ?? PROJECT_NAME,
    packageManager: getPackageManager() ?? "npm",
    flags: [],
    fpMcpServerEnabled: false, // Temporarily disabled - Fiberplane MCP server is not yet ready
  };
}

/**
 * Checks first (non-system) argument for existence, ignoring flags
 * @param args - An array of command line arguments.
 * @returns The `string` project name if matched, or `undefined`
 */
function parseProjectName(args: string[]): string | undefined {
  const projectName = args.at(2);

  if (!projectName || projectName.startsWith("-")) {
    return undefined;
  }

  return projectName;
}
