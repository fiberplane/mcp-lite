import { $ } from "bun";

const packageJsonUrl = new URL("../package.json", import.meta.url);
const packageJson = await Bun.file(packageJsonUrl).json();

await $`rm -rf dist`;

await Bun.build({
  format: "esm",
  outdir: "dist",
  root: "src",
  entrypoints: ["./src/index.ts"],
  sourcemap: "linked",
});

// After build: copy publishConfig.exports → package.json.exports
const publishExports = (packageJson as Record<string, any>)?.publishConfig?.exports;
if (publishExports) {
  const updated = { ...packageJson, exports: publishExports };
  await Bun.write(packageJsonUrl, `${JSON.stringify(updated, null, 2)}\n`);
}

await $`bun run build:types`;
