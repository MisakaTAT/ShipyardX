import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const PACKAGE_JSON_PATH = resolve("package.json");
const CARGO_TOML_PATH = resolve("src-tauri/Cargo.toml");
const TAURI_CONFIG_PATH = resolve("src-tauri/tauri.conf.json");

export function isValidVersion(version) {
  return VERSION_PATTERN.test(version);
}

export function updatePackageJsonVersion(contents, version) {
  const data = JSON.parse(contents);
  data.version = version;
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function updateTauriConfigVersion(contents, version) {
  const data = JSON.parse(contents);
  data.version = version;
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function updateCargoTomlVersion(contents, version) {
  let replaced = false;
  const output = contents.replace(
    /^version = ".*"$/m,
    (line) => {
      replaced = true;
      return `version = "${version}"`;
    },
  );

  if (!replaced) {
    throw new Error("Could not find version field in src-tauri/Cargo.toml");
  }

  return output;
}

async function updateFile(path, updater, version) {
  const current = await readFile(path, "utf8");
  const next = updater(current, version);
  await writeFile(path, next);
}

export async function run(version) {
  if (!version) {
    throw new Error("Usage: pnpm release-version <version>");
  }

  if (!isValidVersion(version)) {
    throw new Error(`Invalid version: ${version}`);
  }

  await updateFile(PACKAGE_JSON_PATH, updatePackageJsonVersion, version);
  await updateFile(CARGO_TOML_PATH, updateCargoTomlVersion, version);
  await updateFile(TAURI_CONFIG_PATH, updateTauriConfigVersion, version);

  return version;
}

async function main() {
  try {
    const version = process.argv[2];
    const nextVersion = await run(version);
    console.log(`Updated release version to ${nextVersion}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
