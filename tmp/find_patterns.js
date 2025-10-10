const fs = require('fs');

const content = fs.readFileSync('src/kanbanWebviewPanel.ts', 'utf8');
const lines = content.split('\n');

const patterns = {
    tryBlocks: 0,
    pathResolve: 0,
    fileExists: 0,
    readFile: 0,
    writeFile: 0,
    mapGet: 0
};

lines.forEach(line => {
    if (line.includes('try {')) patterns.tryBlocks++;
    if (line.includes('path.resolve(')) patterns.pathResolve++;
    if (line.includes('fs.existsSync(')) patterns.fileExists++;
    if (line.includes('fs.readFileSync(')) patterns.readFile++;
    if (line.includes('fs.writeFileSync(')) patterns.writeFile++;
    if (line.match(/\.get\(/)) patterns.mapGet++;
});

console.log('Pattern counts in kanbanWebviewPanel.ts:');
console.log(JSON.stringify(patterns, null, 2));
