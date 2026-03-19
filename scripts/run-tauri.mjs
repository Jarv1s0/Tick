import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const tauriEntryFile = resolve(
  projectRoot,
  "node_modules",
  "@tauri-apps",
  "cli",
  "tauri.js",
);
const tauriArgs = process.argv.slice(2);
const tauriCommand = tauriArgs[0];
const tauriConfig = JSON.parse(
  readFileSync(resolve(projectRoot, "src-tauri", "tauri.conf.json"), "utf8"),
);
const productName = tauriConfig.productName || "Tick";
const appVersion = tauriConfig.version || "0.0.0";
const releaseSourceDir = resolve(projectRoot, "src-tauri", "target", "release");
const publishReleaseDir = resolve(projectRoot, "build-output", "release");
const sourceExeFileName = `${productName}.exe`;
const versionedExeFileName = `${productName}_${appVersion}.exe`;

function cleanPublishReleaseDir() {
  rmSync(publishReleaseDir, { recursive: true, force: true });
  mkdirSync(publishReleaseDir, { recursive: true });
}

function copyIfExists(sourcePath, destinationPath) {
  if (!existsSync(sourcePath)) return;
  mkdirSync(dirname(destinationPath), { recursive: true });
  cpSync(sourcePath, destinationPath, { recursive: true, force: true });
}

function syncReleaseArtifacts() {
  cleanPublishReleaseDir();
  copyIfExists(resolve(releaseSourceDir, sourceExeFileName), resolve(publishReleaseDir, versionedExeFileName));
  copyIfExists(resolve(releaseSourceDir, "bundle", "nsis"), resolve(publishReleaseDir, "bundle", "nsis"));
  copyIfExists(resolve(releaseSourceDir, "bundle", "msi"), resolve(publishReleaseDir, "bundle", "msi"));
}

const child = spawn(process.execPath, [tauriEntryFile, ...tauriArgs], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error("启动 Tauri 构建命令失败:", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  if ((tauriCommand === "build" || tauriCommand === "bundle") && code === 0) {
    syncReleaseArtifacts();
  }

  process.exit(code ?? 0);
});
