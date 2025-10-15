import { $ } from "bun";

const packageJson = await Bun.file(new URL("../package.json", import.meta.url)).json();

await $`rm -rf dist`;

await Bun.build({
  format: "esm",
  outdir: "dist",
  root: "src",
  entrypoints: ["./src/index.ts"],
  sourcemap: "linked",
});

const publishExports = packageJson.publishConfig?.exports ?? packageJson.exports;

if (publishExports) {
  await Bun.write(
    new URL("../dist/package.json", import.meta.url),
    `${JSON.stringify(
      {
        ...packageJson,
        exports: publishExports,
      },
      null,
      2,
    )}\n`,
  );
}

await $`bun run build:types`;
