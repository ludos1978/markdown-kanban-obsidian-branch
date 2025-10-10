const fs = require('fs');

const content = fs.readFileSync('src/kanbanWebviewPanel.ts', 'utf8');
const lines = content.split('\n');

const fileOps = {
    existsSync: [],
    readFileSync: [],
    readFile: [],
    writeFileSync: [],
    writeFile: [],
    mkdirSync: [],
    unlinkSync: [],
    statSync: []
};

lines.forEach((line, idx) => {
    if (line.includes('fs.existsSync(')) fileOps.existsSync.push({ line: idx + 1, code: line.trim() });
    if (line.includes('fs.readFileSync(')) fileOps.readFileSync.push({ line: idx + 1, code: line.trim() });
    if (line.includes('fs.readFile(')) fileOps.readFile.push({ line: idx + 1, code: line.trim() });
    if (line.includes('fs.writeFileSync(')) fileOps.writeFileSync.push({ line: idx + 1, code: line.trim() });
    if (line.includes('fs.writeFile(')) fileOps.writeFile.push({ line: idx + 1, code: line.trim() });
    if (line.includes('fs.mkdirSync(')) fileOps.mkdirSync.push({ line: idx + 1, code: line.trim() });
    if (line.includes('fs.unlinkSync(')) fileOps.unlinkSync.push({ line: idx + 1, code: line.trim() });
    if (line.includes('fs.statSync(')) fileOps.statSync.push({ line: idx + 1, code: line.trim() });
});

console.log('File I/O Operations Analysis:\n');
for (const [op, instances] of Object.entries(fileOps)) {
    if (instances.length > 0) {
        console.log(`\n${op}: ${instances.length} occurrences`);
        instances.slice(0, 5).forEach(inst => {
            console.log(`  Line ${inst.line}: ${inst.code.substring(0, 80)}${inst.code.length > 80 ? '...' : ''}`);
        });
        if (instances.length > 5) {
            console.log(`  ... and ${instances.length - 5} more`);
        }
    }
}
