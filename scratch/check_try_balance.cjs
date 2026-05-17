const fs = require('fs');
const content = fs.readFileSync('c:/Dev/webcad/src/core/io/OCCWorker.ts', 'utf8');
const lines = content.split('\n');

let stack = [];
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('try {')) {
        stack.push(i + 1);
    }
    if (line.includes('catch') || line.includes('finally')) {
        if (stack.length > 0) stack.pop();
    }
}

if (stack.length > 0) {
    console.log('Unbalanced try blocks at lines:', stack);
} else {
    console.log('Try blocks are balanced (naive check)');
}
