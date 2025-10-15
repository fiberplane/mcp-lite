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

// Sync exports from publishConfig into dist/package.json and root package.json
interface PackageJsonShape {
  exports?: unknown;
  publishConfig?: { exports?: unknown } & Record<string, unknown>;
  [key: string]: unknown;
}

const { publishConfig, ...packageJsonForDist } =
  packageJson as PackageJsonShape;
const publishExports =
  publishConfig?.exports ?? (packageJson as PackageJsonShape).exports;

const rewriteExports = (
  value: unknown,
  transform: (path: string) => string,
): unknown => {
  if (typeof value === "string") {
    return transform(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteExports(entry, transform));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        rewriteExports(entry, transform),
      ]),
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

  const { exports: _ignoredExports, ...publishConfigWithoutExports } =
    (publishConfig ?? {}) as Record<string, unknown>;
  const packageJsonForPublish = {
    ...(packageJson as Record<string, unknown>),
    exports: publishExports,
    ...(publishConfigWithoutExports &&
    Object.keys(publishConfigWithoutExports).length
      ? { publishConfig: publishConfigWithoutExports }
      : {}),
  };

  await Bun.write(
    packageJsonUrl,
    `${JSON.stringify(packageJsonForPublish, null, 2)}\n`,
  );
}

// Make the built CLI file executable
const distIndexPath = "dist/index.js";
await $`chmod +x ${distIndexPath}`;

await $`bun run build:types`;
