import { ScadLexer } from '../src/scad/parser/Lexer';
import fs from 'fs';

const code = `
function enumerate(l,idx=undef) =
	(l==[])? [] :
	(idx==undef)?
		[for (i=[0:len(l)-1]) [i,l[i]]] :
		[for (i=[0:len(l)-1]) concat([i], [for (j=idx) l[i][j]])];
`;

const lexer = new ScadLexer();
try {
  const tokens = lexer.tokenize(code);
  tokens.forEach((t, i) => {
    console.log(`${i}: Type=${t.type} (${t.value}) Line=${t.line} Col=${t.col}`);
  });
} catch (e) {
  console.error(e);
}
