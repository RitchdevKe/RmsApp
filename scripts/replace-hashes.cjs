const fs = require('fs');
const path = require('path');

const partialPath = path.resolve(__dirname, '..', 'src', 'partialRms');

function replaceInDir(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceInDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // We want to replace '#/' with '#/partial-rms/'
      // But only in strings like '#/dashboard', window.location.hash = '#/...', etc.
      // So let's match single or double quoted strings starting with #/
      content = content.replace(/(['"])#\//g, '$1#/partial-rms/');
      
      // We might have some things like currentPath.startsWith('#/partial-rms/partial-rms') if we are not careful
      // So let's clean it up just in case
      content = content.replace(/(['"])#\/partial-rms\/partial-rms\//g, '$1#/partial-rms/');
      
      fs.writeFileSync(fullPath, content, 'utf8');
    }
  });
}

replaceInDir(partialPath);
console.log('Replaced hashes in partialRms');
