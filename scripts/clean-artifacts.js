const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const keepDaysArg = process.argv.find((arg) => arg.startsWith("--keep-days="));
const keepDays = keepDaysArg ? Number(keepDaysArg.split("=")[1]) : 7;
const cleanAllGenerated = process.argv.includes("--all-generated");
const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;

const targetsInsideRoot = [
  path.join(rootDir, "tmp"),
  path.join(rootDir, "data", "ppt-guide-extract"),
  path.join(rootDir, "data", "reference-assets"),
];

function removePath(targetPath) {
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(rootDir + path.sep)) {
    throw new Error(`Refusing to remove outside project: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
  console.log(`removed ${path.relative(rootDir, resolved)}`);
}

function cleanDirectoryFiles(dir, shouldRemove) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.name === ".gitkeep") continue;
    if (entry.isDirectory()) {
      cleanDirectoryFiles(entryPath, shouldRemove);
      if (!fs.readdirSync(entryPath).length) removePath(entryPath);
      continue;
    }
    if (entry.isFile() && shouldRemove(entryPath)) {
      removePath(entryPath);
    }
  }
}

for (const target of targetsInsideRoot) {
  removePath(target);
}

for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
  if (entry.isFile() && /^tmp-server.*\.log$/i.test(entry.name)) {
    removePath(path.join(rootDir, entry.name));
  }
}

cleanDirectoryFiles(path.join(rootDir, "exports"), () => true);
cleanDirectoryFiles(path.join(rootDir, "generated-images"), (filePath) => {
  if (cleanAllGenerated) return true;
  return fs.statSync(filePath).mtimeMs < cutoff;
});
