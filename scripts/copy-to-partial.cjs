const fs = require('fs');
const path = require('path');

const srcFolders = ['components', 'context', 'hooks', 'lib', 'utils'];
const srcFiles = ['types.ts', 'constants.ts', 'App.tsx'];

const rootPath = path.resolve(__dirname, '..');
const partialPath = path.join(rootPath, 'src', 'partialRms');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    // Only copy if it doesn't already exist to avoid accidentally overwriting edits
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
  }
}

// Ensure target dir exists
if (!fs.existsSync(partialPath)) {
  fs.mkdirSync(partialPath, { recursive: true });
}

console.log('Copying folders...');
for (const folder of srcFolders) {
  const src = path.join(rootPath, folder);
  const dest = path.join(partialPath, folder);
  if (fs.existsSync(src)) {
    copyRecursiveSync(src, dest);
    console.log(`Copied ${folder} to src/partialRms/${folder}`);
  }
}

console.log('Copying files...');
for (const file of srcFiles) {
  const src = path.join(rootPath, file);
  const dest = path.join(partialPath, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} to src/partialRms/${file}`);
  }
}

console.log('Done cloning to partialRms');
