import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const rootDir = process.cwd();
const packageJsonPath = join(rootDir, "package.json");
const readmePath = join(rootDir, "README.md");
const hooksDir = join(rootDir, "src", "hooks");

const forbiddenDependencies = new Set([
  "next",
  "vite-plugin-pwa",
  "@vite-pwa/assets-generator",
  "workbox-build",
  "workbox-window",
]);

const collectFiles = (dirPath: string, fileList: string[] = []) => {
  for (const entry of readdirSync(dirPath)) {
    const entryPath = join(dirPath, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      collectFiles(entryPath, fileList);
      continue;
    }

    fileList.push(entryPath);
  }

  return fileList;
};

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const dependencyEntries = Object.entries({
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
});

const failures: string[] = [];

for (const [name, version] of dependencyEntries) {
  if (version === "latest") {
    failures.push(`latest version is not allowed: ${name}`);
  }

  if (forbiddenDependencies.has(name)) {
    failures.push(`forbidden dependency is still present: ${name}`);
  }
}

const readme = readFileSync(readmePath, "utf8");
for (const heading of ["### Done", "### Prototype", "### Planned"]) {
  if (!readme.includes(heading)) {
    failures.push(`README.md is missing section: ${heading}`);
  }
}

for (const filePath of collectFiles(hooksDir)) {
  if (!/\.(ts|tsx)$/.test(filePath)) {
    continue;
  }

  const content = readFileSync(filePath, "utf8");
  if (content.includes('"use client"') || content.includes("'use client'")) {
    failures.push(`unexpected use client directive: ${relative(rootDir, filePath)}`);
  }
}

if (failures.length > 0) {
  console.error("Lint checks failed:\n");
  failures.forEach((failure) => {
    console.error(`- ${failure}`);
  });
  process.exit(1);
}

console.log("Lint checks passed.");