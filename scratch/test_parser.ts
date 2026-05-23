import { ScadLexer } from '../src/scad/parser/Lexer';
import { ScadParser } from '../src/scad/parser/Parser';
import fs from 'fs';

const filePath = 'c:/Dev/webcad/files/scad/projects/myproject/BOSL/math.scad';
let code = fs.readFileSync(filePath, 'utf-8');

// Strip out any include/use statements since ScadParser expects raw preprocessed content
code = code.replace(/^[ \t]*(include|use)[ \t]*[<"]([^>"]+)[>"][ \t]*;?/gm, "");

const lexer = new ScadLexer();
const parser = new ScadParser();

try {
  const tokens = lexer.tokenize(code);
  const ast = parser.parse(tokens);
  console.log("Entire math.scad parsed successfully! Total body nodes:", ast.body.length);
} catch (e: any) {
  console.error("Parser failed:", e.message);
  console.error(e.stack);
}
