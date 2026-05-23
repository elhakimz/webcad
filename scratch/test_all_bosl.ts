import { ScadLexer } from '../src/scad/parser/Lexer';
import { ScadParser } from '../src/scad/parser/Parser';
import fs from 'fs';
import path from 'path';

const boslDir = 'c:/Dev/webcad/files/scad/projects/myproject/BOSL';
const files = fs.readdirSync(boslDir).filter(f => f.endsWith('.scad'));

console.log(`Found ${files.length} SCAD files in BOSL/. Testing them...`);

let successCount = 0;
let failCount = 0;

for (const file of files) {
  const filePath = path.join(boslDir, file);
  let code = fs.readFileSync(filePath, 'utf-8');
  
  // Strip imports
  code = code.replace(/^[ \t]*(include|use)[ \t]*[<"]([^>"]+)[>"][ \t]*;?/gm, "");
  
  const lexer = new ScadLexer();
  const parser = new ScadParser();
  
  try {
    const tokens = lexer.tokenize(code);
    parser.parse(tokens);
    console.log(`✅ ${file} parsed successfully.`);
    successCount++;
  } catch (e: any) {
    console.error(`❌ ${file} failed: ${e.message}`);
    failCount++;
  }
}

console.log(`\nSummary: ${successCount} passed, ${failCount} failed.`);
