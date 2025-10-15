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

const { publishConfig, ...packageJsonForDist } = packageJson;
const publishExports = publishConfig?.exports ?? packageJson.exports;

const rewriteExports = (value: unknown, transform: (path: string) => string): unknown => {
  if (typeof value === "string") {
    return transform(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteExports(entry, transform));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, rewriteExports(entry, transform)]),
    );
  }
  return value;
};

if (publishExports) {
  const exportsForDist = rewriteExports(publishExports, (path) =>
    path.startsWith("./dist/") ? `./${path.slice("./dist/".length)}` : path,
  );

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

  const { exports: _ignoredExports, ...publishConfigWithoutExports } = publishConfig ?? {};
  const packageJsonForPublish = {
    ...packageJson,
    exports: publishExports,
    ...(publishConfigWithoutExports && Object.keys(publishConfigWithoutExports).length
      ? { publishConfig: publishConfigWithoutExports }
      : {}),
  };

  await Bun.write(
    packageJsonUrl,
    `${JSON.stringify(packageJsonForPublish, null, 2)}\n`,
  );
}

await $`bun run build:types`;
