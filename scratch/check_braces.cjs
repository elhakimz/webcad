const fs = require('fs');
const content = fs.readFileSync('c:/Dev/webcad/src/core/io/OCCWorker.ts', 'utf8');

let balance = 0;
for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') balance++;
    if (content[i] === '}') balance--;
}

console.log('Final brace balance:', balance);
if (balance > 0) console.log('Missing }');
if (balance < 0) console.log('Extra }');
