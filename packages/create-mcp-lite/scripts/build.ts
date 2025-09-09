import { $ } from "bun";

await $`rm -rf dist`;

await Bun.build({
  format: "esm",
  outdir: "dist",
  root: "src",
  entrypoints: ["./src/index.ts"],
  sourcemap: "linked",
  target: "node",
  minify: false,
  external: [
    "giget",
    "open",
    "@clack/prompts",
    "@clack/core",
    "picocolors",
    "pino",
    "pino-pretty",
    "@oslojs/oauth2",
  ],
});

// Add shebang to the built CLI file for executable
const distIndexPath = "dist/index.js";
const content = await Bun.file(distIndexPath).text();
const contentWithShebang = `#!/usr/bin/env node\n${content}`;
await Bun.write(distIndexPath, contentWithShebang);

// Make the file executable
await $`chmod +x ${distIndexPath}`;

await $`bun run build:types`;
