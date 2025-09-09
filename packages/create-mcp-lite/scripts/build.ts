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

// Make the built CLI file executable
const distIndexPath = "dist/index.js";
await $`chmod +x ${distIndexPath}`;

await $`bun run build:types`;
