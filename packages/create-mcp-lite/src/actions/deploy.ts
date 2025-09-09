import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { confirm, spinner } from "@clack/prompts";
import pico from "picocolors";
import type { Context } from "../context";

// Read deployment info from .fiberplane file and construct URL
function getUrlFromFiberplaneFile(projectPath: string): string | null {
  try {
    const fiberplaneFilePath = join(projectPath, ".fiberplane");
    const fileContent = readFileSync(fiberplaneFilePath, "utf-8");
    const data = JSON.parse(fileContent);

    if (data.appName) {
      return `https://${data.appName}.fp.dev`;
    }
  } catch (_error) {
    // File doesn't exist or is invalid, ignore
  }
  return null;
}

export async function promptDeploy(context: Context) {
  const deployFiberplane = await confirm({
    message: "Should we deploy this thing now?",
    initialValue: true,
  });

  if (deployFiberplane) {
    context.flags.push("deploy-fiberplane");
  }

  return deployFiberplane;
}

export async function actionDeploy(context: Context) {
  if (!context.flags.includes("deploy-fiberplane") || !context.path) {
    return;
  }

  const s = spinner();
  s.start("Deploying to Fiberplane...");

  let deploymentUrl: string | null = null;

  try {
    // HACK - force login flow here until deploy does it automatically
    execSync(`${context.packageManager} fiberplane-cli auth login`, {
      cwd: context.path,
      stdio: "inherit", // Show output to user
    });

    // Execute the deploy script in the target project
    execSync(`${context.packageManager} run deploy`, {
      cwd: context.path,
      stdio: "inherit", // Show output to user
    });

    // Read deployment URL from .fiberplane file
    deploymentUrl = getUrlFromFiberplaneFile(context.path);

    s.stop(`${pico.green("✓")} Deployment completed successfully`);

    if (deploymentUrl) {
      console.log(`
${pico.cyan("🚀 Your MCP project is now live!")}

Your MCP server has been deployed to Fiberplane.
Visit your deployment: ${pico.bold(pico.cyan(deploymentUrl))}
`);
    } else {
      console.log(`
${pico.cyan("🚀 Your MCP project is now live!")}

Your MCP server has been deployed to Fiberplane.
Visit your Fiberplane dashboard to manage your deployment.
`);
    }

    // Set the deployment URL on context for later use
    if (deploymentUrl) {
      context.deploymentUrl = deploymentUrl;
    }
  } catch (error) {
    s.stop(`${pico.red("✗")} Deployment failed`);
    console.error(`
${pico.red("Deployment error:")} ${error instanceof Error ? error.message : "Unknown error"}

${pico.dim("Make sure:")}
• The template includes a "deploy" script in package.json
• You have proper Fiberplane credentials configured
• All dependencies are installed
`);
    throw error;
  }
}
