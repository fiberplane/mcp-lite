import { DEFAULT_PROJECT_NAME } from "./const";
import type { AIAssistant, Flags, Template } from "./types";
import { getPackageManager } from "./utils";

export interface Context {
  cwd: string;
  packageManager: string;
  name: string;
  path?: string;
  description?: string;
  template?: Template;
  aiAssistant?: AIAssistant;
  flags: Flags;
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
    name: projectName ?? DEFAULT_PROJECT_NAME,
    packageManager: getPackageManager() ?? "npm",
    flags: [],
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
