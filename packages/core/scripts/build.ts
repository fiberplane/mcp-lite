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

// publishConfig exports resolve from the repository root (e.g. "./dist/index.js"),
// but the package.json we write here lives inside the built dist/ directory. We
// rewrite any "./dist/" prefixes so that installed consumers resolve files from
// the dist package root ("./index.js", "./types/index.d.ts", etc.).
const stripDistPrefix = (value: unknown): unknown => {
  if (typeof value === "string" && value.startsWith("./dist/")) {
    return `./${value.slice("./dist/".length)}`;
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
