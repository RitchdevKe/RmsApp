const fs = require('fs');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Only inject if not already injected
    if (content.includes('const _lazyLoadMap = [];')) return;

    // Inject our helper after imports
    const helper = `
const _lazyLoadMap: (() => Promise<any>)[]  = [];
function preloadableLazy<T extends React.ComponentType<any>>(importFunc: () => Promise<{ default: T }>) {
  _lazyLoadMap.push(importFunc);
  return React.lazy(importFunc);
}
`;
    content = content.replace(/const Auth = React\.lazy/m, helper + '\nconst Auth = React.lazy');

    // Replace all React.lazy(() => import( with preloadableLazy(
    content = content.replace(/React\.lazy\(/g, 'preloadableLazy(');

    // Add a useEffect in App component to preload
    const effect = `
    useEffect(() => {
        // Preload chunks slowly in the background
        let i = 0;
        const interval = setInterval(() => {
            if (i < _lazyLoadMap.length) {
                _lazyLoadMap[i]().catch(() => {});
                i++;
            } else {
                clearInterval(interval);
            }
        }, 500); // load one chunk every 500ms
        return () => clearInterval(interval);
    }, []);
`;
    content = content.replace(/const App: React\.FC = \(\) => \{\n/, match => match + effect);

    fs.writeFileSync(filePath, content);
}

processFile('./taskmerms2026-main/App.tsx');
processFile('./taskmerms2026-main/src/partialRms/App.tsx');
