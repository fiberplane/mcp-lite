/**
 * Parses changeset JSON output to determine which packages have pending changes
 * Outputs GitHub Actions variables for conditional publishing
 */

const statusFile = Bun.argv[2] || "changeset-status.json";

try {
  // Read and parse the changeset status JSON using Bun's file API
  const data = await Bun.file(statusFile).json();

  // Check if any packages have changesets
  const hasChangesets = data.releases?.length > 0;
  console.log(`hasChangesets=${hasChangesets}`);

  if (hasChangesets) {
    // Check for specific packages
    const hasCoreChangesets = data.releases.some((r) => r.name === "mcp-lite");
    const hasCliChangesets = data.releases.some(
      (r) => r.name === "create-mcp-lite",
    );

    console.log(`hasCoreChangesets=${hasCoreChangesets}`);
    console.log(`hasCliChangesets=${hasCliChangesets}`);

    // Optional: Log which packages will be published for debugging
    if (Bun.env.GITHUB_ACTIONS) {
      const packagesToPublish = data.releases.map(
        (r) => `${r.name}@${r.newVersion}`,
      );
      console.error(
        `📦 Packages to be published: ${packagesToPublish.join(", ")}`,
      );
    }
  } else {
    console.log("hasCoreChangesets=false");
    console.log("hasCliChangesets=false");

    if (Bun.env.GITHUB_ACTIONS) {
      console.error("📦 No packages to be published");
    }
  }
} catch (error) {
  // Fallback on any error - assume no changesets
  console.error(`Error parsing changeset status: ${error.message}`);
  console.log("hasChangesets=false");
  console.log("hasCoreChangesets=false");
  console.log("hasCliChangesets=false");
}
