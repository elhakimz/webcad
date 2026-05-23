import { ScadLexer } from '../src/scad/parser/Lexer';
import { ScadParser } from '../src/scad/parser/Parser';
import { ScadEvaluator } from '../src/scad/interpreter/Evaluator';
import * as AST from '../src/scad/ast/Nodes';

const lexer = new ScadLexer();
const parser = new ScadParser();
const evaluator = new ScadEvaluator();

const code = `
function bez_point(curve,u)=
	(len(curve) <= 1) ?
		curve[0] :
		bez_point(
			[for(i=[0:len(curve)-2]) curve[i]*(1-u)+curve[i+1]*u],
			u
		);
function bezier_patch_point(patch, u, v) = [u, v, 0];

function bezier_patch(patch, splinesteps=2, vertices=[], faces=[]) =
	let(
		base = len(vertices),
		pts = [for (v=[0:splinesteps], u=[0:splinesteps]) bezier_patch_point(patch, u/splinesteps, v/splinesteps)],
		new_vertices = concat(vertices, pts),
		new_faces = [
			for (
				v=[0:splinesteps-1],
				u=[0:splinesteps-1],
				i=[0,1]
			) let (
				v1 = u+v*(splinesteps+1) + base,
				v2 = v1 + 1,
				v3 = v1 + splinesteps + 1,
				v4 = v3 + 1,
				face = i? [v1,v3,v2] : [v2,v3,v4]
			) face
		]
	) [new_vertices, concat(faces, new_faces)];

res = bez_point([[0,0,0], [10,10,10]], 0.5);
echo(res);
`;

const tokens = lexer.tokenize(code);
const ast = parser.parse(tokens);
const geom = evaluator.evaluate(ast);
console.log("Result:", JSON.stringify(geom, null, 2));
