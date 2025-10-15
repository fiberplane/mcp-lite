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

const { publishConfig, ...packageJsonForDist } = packageJson;
const publishExports = publishConfig?.exports ?? packageJson.exports;

const stripDistPrefix = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.replace(/^\.\/dist\//, "./");
  }
  if (Array.isArray(value)) {
    return value.map((entry) => stripDistPrefix(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, stripDistPrefix(entry)]),
    );
  }
  return value;
};

if (publishExports) {
  const exportsForDist = stripDistPrefix(publishExports);
  await Bun.write(
    new URL("../dist/package.json", import.meta.url),
    `${JSON.stringify(
      {
        ...packageJsonForDist,
        exports: exportsForDist,
      },
      null,
      2,
    )}\n`,
  );
}

await $`bun run build:types`;
