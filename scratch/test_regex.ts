import fs from 'fs';

const filePath = 'c:/Dev/webcad/files/scad/projects/myproject/BOSL/math.scad';
const code = fs.readFileSync(filePath, 'utf-8');

const importRegex = /^[ \t]*(include|use)[ \t]*[<"]([^>"]+)[>"][ \t]*;?/gm;
let match;
const regex = new RegExp(importRegex);
let count = 0;
while ((match = regex.exec(code)) !== null) {
  count++;
  console.log(`Match ${count}:`);
  console.log(`  Full: ${JSON.stringify(match[0])}`);
  console.log(`  Type: ${match[1]}`);
  console.log(`  Path: ${match[2]}`);
  console.log(`  Index: ${match.index}`);
  
  // Print some context around the match
  const start = Math.max(0, match.index - 50);
  const end = Math.min(code.length, match.index + match[0].length + 50);
  console.log(`  Context: ${JSON.stringify(code.slice(start, end))}`);
}
console.log(`Total imports matched: ${count}`);
