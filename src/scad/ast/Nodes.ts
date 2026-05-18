export type Node = 
  | Program
  | ModuleDef
  | FunctionDef
  | Assignment
  | ModuleInstantiation
  | IfStatement
  | ForStatement
  | Expression;

export interface Program {
  type: "Program";
  body: Node[];
}

export interface ModuleDef {
  type: "ModuleDef";
  name: string;
  parameters: Parameter[];
  body: Node[];
}

export interface FunctionDef {
  type: "FunctionDef";
  name: string;
  parameters: Parameter[];
  expr: Expression;
}

export interface Parameter {
  name: string;
  defaultValue?: Expression;
}

export interface Assignment {
  type: "Assignment";
  name: string;
  value: Expression;
}

export interface ModuleInstantiation {
  type: "ModuleInstantiation";
  name: string;
  arguments: Argument[];
  children: Node[];
}

export interface IfStatement {
  type: "IfStatement";
  condition: Expression;
  thenBranch: Node[];
  elseBranch?: Node[];
}

export interface ForStatement {
  type: "ForStatement";
  variables: string[];
  range: Expression;
  body: Node[];
}

export interface Argument {
  name?: string;
  value: Expression;
}

export type Expression =
  | Literal
  | Identifier
  | BinaryExpression
  | UnaryExpression
  | TernaryExpression
  | FunctionCall
  | ArrayExpression
  | RangeExpression
  | IndexExpression
  | DotExpression
  | LetExpression
  | ListComprehension
  | EachExpression;

export interface EachExpression {
  type: "EachExpression";
  expr: Expression;
}

export interface DotExpression {
  type: "DotExpression";
  expr: Expression;
  property: string;
}

export interface LetExpression {
  type: "LetExpression";
  assignments: { name: string; value: Expression }[];
  expr: Expression;
}

export interface ListComprehension {
  type: "ListComprehension";
  variable: string;
  range: Expression;
  condition?: Expression;
  expr: Expression;
}

export interface IndexExpression {
  type: "IndexExpression";
  expr: Expression;
  index: Expression;
}

export interface Literal {
  type: "Literal";
  value: any;
}

export interface Identifier {
  type: "Identifier";
  name: string;
}

export interface BinaryExpression {
  type: "BinaryExpression";
  operator: string;
  left: Expression;
  right: Expression;
}

export interface UnaryExpression {
  type: "UnaryExpression";
  operator: string;
  argument: Expression;
}

export interface TernaryExpression {
  type: "TernaryExpression";
  condition: Expression;
  trueExpr: Expression;
  falseExpr: Expression;
}

export interface FunctionCall {
  type: "FunctionCall";
  name: string;
  arguments: Argument[];
}

export interface ArrayExpression {
  type: "ArrayExpression";
  elements: Expression[];
}

export interface RangeExpression {
  type: "RangeExpression";
  start: Expression;
  step?: Expression;
  end: Expression;
}
