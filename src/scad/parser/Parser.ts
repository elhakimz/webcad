import { Token, TokenType } from "./Lexer";
import * as AST from "../ast/Nodes";

export class ScadParser {
  private tokens: Token[] = [];
  private current: number = 0;

  parse(tokens: Token[]): AST.Program {
    this.tokens = tokens;
    this.current = 0;
    const body: AST.Node[] = [];

    while (!this.isAtEnd()) {
      const stmt = this.declaration();
      if (stmt) body.push(stmt);
    }

    return { type: "Program", body };
  }

  private declaration(): AST.Node {
    if (this.match(TokenType.STAR)) {
      this.declaration(); // parse and ignore
      return { type: "Assignment", name: "_ignored_" + Math.random().toString(36).substring(2, 9), value: { type: "Literal", value: 0 } };
    }
    if (this.match(TokenType.PERCENT)) {
      const child = this.declaration();
      return {
        type: "ModuleInstantiation",
        name: "color",
        arguments: [{ name: undefined, value: { type: "Literal", value: [0.5, 0.5, 0.5, 0.2] } }],
        children: [child]
      };
    }
    if (this.match(TokenType.BANG)) {
      return this.declaration();
    }
    if (this.match(TokenType.HASH)) {
      const child = this.declaration();
      return {
        type: "ModuleInstantiation",
        name: "color",
        arguments: [{ name: undefined, value: { type: "Literal", value: [1.0, 0.41, 0.7, 0.5] } }],
        children: [child]
      };
    }

    if (this.match(TokenType.MODULE)) return this.moduleDeclaration();
    if (this.match(TokenType.FUNCTION)) return this.functionDeclaration();
    if (this.match(TokenType.IF)) return this.ifStatement();
    if (this.match(TokenType.FOR)) return this.forStatement();
    
    // Check for assignment vs instantiation
    if (this.check(TokenType.IDENT) && this.peekNext().type === TokenType.EQUALS) {
      return this.assignment();
    }

    return this.moduleInstantiation();
  }

  private moduleDeclaration(): AST.ModuleDef {
    const name = this.consume(TokenType.IDENT, "Expect module name.").value;
    this.consume(TokenType.LPAREN, "Expect '(' after module name.");
    const parameters = this.parameterList();
    this.consume(TokenType.RPAREN, "Expect ')' after parameters.");
    const body = this.statementOrBlock();
    return { type: "ModuleDef", name, parameters, body };
  }

  private functionDeclaration(): AST.FunctionDef {
    const name = this.consume(TokenType.IDENT, "Expect function name.").value;
    this.consume(TokenType.LPAREN, "Expect '(' after function name.");
    const parameters = this.parameterList();
    this.consume(TokenType.RPAREN, "Expect ')' after parameters.");
    this.consume(TokenType.EQUALS, "Expect '=' before function body.");
    const expr = this.expression();
    this.consume(TokenType.SEMICOLON, "Expect ';' after function definition.");
    return { type: "FunctionDef", name, parameters, expr };
  }

  private parameterList(): AST.Parameter[] {
    const parameters: AST.Parameter[] = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        if (this.check(TokenType.RPAREN)) {
          break;
        }
        const name = this.consume(TokenType.IDENT, "Expect parameter name.").value;
        let defaultValue: AST.Expression | undefined;
        if (this.match(TokenType.EQUALS)) {
          defaultValue = this.expression();
        }
        parameters.push({ name, defaultValue });
      } while (this.match(TokenType.COMMA));
    }
    return parameters;
  }

  private assignment(): AST.Assignment {
    const name = this.consume(TokenType.IDENT, "Expect variable name.").value;
    this.consume(TokenType.EQUALS, "Expect '=' after variable name.");
    const value = this.expression();
    this.consume(TokenType.SEMICOLON, "Expect ';' after assignment.");
    return { type: "Assignment", name, value };
  }

  private moduleInstantiation(): AST.ModuleInstantiation {
    const name = this.consume(TokenType.IDENT, "Expect module or primitive name.").value;
    this.consume(TokenType.LPAREN, "Expect '(' after module name.");
    const args = this.argumentList();
    this.consume(TokenType.RPAREN, "Expect ')' after arguments.");
    
    let children: AST.Node[] = [];
    if (this.match(TokenType.SEMICOLON)) {
      children = [];
    } else {
      children = this.statementOrBlock();
    }

    return { type: "ModuleInstantiation", name, arguments: args, children };
  }

  private argumentList(): AST.Argument[] {
    const args: AST.Argument[] = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        if (this.check(TokenType.RPAREN)) {
          break;
        }
        let name: string | undefined;
        if (this.check(TokenType.IDENT) && this.peekNext().type === TokenType.EQUALS) {
          name = this.consume(TokenType.IDENT, "Expect argument name.").value;
          this.consume(TokenType.EQUALS, "Expect '=' after argument name.");
        }
        const value = this.expression();
        args.push({ name, value });
      } while (this.match(TokenType.COMMA));
    }
    return args;
  }

  private ifStatement(): AST.IfStatement {
    this.consume(TokenType.LPAREN, "Expect '(' after 'if'.");
    const condition = this.expression();
    this.consume(TokenType.RPAREN, "Expect ')' after condition.");
    const thenBranch = this.statementOrBlock();
    let elseBranch: AST.Node[] | undefined;
    if (this.match(TokenType.ELSE)) {
      elseBranch = this.statementOrBlock();
    }
    return { type: "IfStatement", condition, thenBranch, elseBranch };
  }

  private forStatement(): AST.Node {
    this.consume(TokenType.LPAREN, "Expect '(' after 'for'.");
    const loops: { variable: string; range: AST.Expression }[] = [];
    do {
      const variable = this.consume(TokenType.IDENT, "Expect loop variable.").value;
      this.consume(TokenType.EQUALS, "Expect '=' after loop variable.");
      const range = this.expression();
      loops.push({ variable, range });
    } while (this.match(TokenType.COMMA));
    this.consume(TokenType.RPAREN, "Expect ')' after for parameters.");

    const body = this.statementOrBlock();

    // Desugar loops from right to left (innermost to outermost)
    let currentBody = body;
    for (let i = loops.length - 1; i >= 0; i--) {
      const loop = loops[i];
      currentBody = [{
        type: "ForStatement",
        variables: [loop.variable],
        range: loop.range,
        body: currentBody
      }];
    }
    return currentBody[0];
  }

  private statementOrBlock(): AST.Node[] {
    if (this.match(TokenType.LBRACE)) {
      return this.blockInner();
    } else {
      return [this.declaration()];
    }
  }

  private block(): AST.Node[] {
    this.consume(TokenType.LBRACE, "Expect '{' before block.");
    return this.blockInner();
  }

  private blockInner(): AST.Node[] {
    const body: AST.Node[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      body.push(this.declaration());
    }
    this.consume(TokenType.RBRACE, "Expect '}' after block.");
    return body;
  }

  // Expressions
  private expression(): AST.Expression {
    return this.ternary();
  }

  private ternary(): AST.Expression {
    const expr = this.logicalOr();
    if (this.match(TokenType.QUESTION)) {
      const trueExpr = this.expression();
      this.consume(TokenType.COLON, "Expect ':' in ternary.");
      const falseExpr = this.expression();
      return { type: "TernaryExpression", condition: expr, trueExpr, falseExpr };
    }
    return expr;
  }

  private logicalOr(): AST.Expression {
    let expr = this.logicalAnd();
    while (this.match(TokenType.PIPE_PIPE)) {
      const right = this.logicalAnd();
      expr = { type: "BinaryExpression", operator: "||", left: expr, right };
    }
    return expr;
  }

  private logicalAnd(): AST.Expression {
    let expr = this.equality();
    while (this.match(TokenType.AMP_AMP)) {
      const right = this.equality();
      expr = { type: "BinaryExpression", operator: "&&", left: expr, right };
    }
    return expr;
  }

  private equality(): AST.Expression {
    let expr = this.comparison();
    while (this.match(TokenType.EQ, TokenType.NEQ)) {
      const operator = this.previous().value;
      const right = this.comparison();
      expr = { type: "BinaryExpression", operator, left: expr, right };
    }
    return expr;
  }

  private comparison(): AST.Expression {
    let expr = this.term();
    while (this.match(TokenType.LT, TokenType.GT, TokenType.LE, TokenType.GE)) {
      const operator = this.previous().value;
      const right = this.term();
      expr = { type: "BinaryExpression", operator, left: expr, right };
    }
    return expr;
  }

  private term(): AST.Expression {
    let expr = this.factor();
    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const operator = this.previous().value;
      const right = this.factor();
      expr = { type: "BinaryExpression", operator, left: expr, right };
    }
    return expr;
  }

  private factor(): AST.Expression {
    let expr = this.unary();
    while (this.match(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT)) {
      const operator = this.previous().value;
      const right = this.unary();
      expr = { type: "BinaryExpression", operator, left: expr, right };
    }
    return expr;
  }

  private unary(): AST.Expression {
    if (this.match(TokenType.BANG, TokenType.MINUS, TokenType.PLUS)) {
      const operator = this.previous().value;
      const argument = this.unary();
      return { type: "UnaryExpression", operator, argument };
    }
    return this.exponent();
  }

  private exponent(): AST.Expression {
    let expr = this.primary();
    while (this.match(TokenType.CARET)) {
      const operator = this.previous().value;
      const right = this.unary();
      expr = { type: "BinaryExpression", operator, left: expr, right };
    }
    return expr;
  }

  private primary(): AST.Expression {
    let expr = this.basePrimary();
    while (true) {
      if (this.match(TokenType.LSQUARE)) {
        const index = this.expression();
        this.consume(TokenType.RSQUARE, "Expect ']' after index.");
        expr = { type: "IndexExpression", expr, index };
      } else if (this.match(TokenType.DOT)) {
        const property = this.consume(TokenType.IDENT, "Expect property name after '.'.").value;
        expr = { type: "DotExpression", expr, property };
      } else {
        break;
      }
    }
    return expr;
  }

  private basePrimary(): AST.Expression {
    if (this.match(TokenType.TRUE)) return { type: "Literal", value: true };
    if (this.match(TokenType.FALSE)) return { type: "Literal", value: false };
    if (this.match(TokenType.UNDEF)) return { type: "Literal", value: undefined };
    if (this.match(TokenType.NUMBER)) return { type: "Literal", value: Number(this.previous().value) };
    if (this.match(TokenType.STRING)) return { type: "Literal", value: this.previous().value };

    if (this.match(TokenType.IDENT)) {
      const name = this.previous().value;
      if (this.match(TokenType.LPAREN)) {
        const args = this.argumentList();
        this.consume(TokenType.RPAREN, "Expect ')' after function arguments.");
        return { type: "FunctionCall", name, arguments: args };
      }
      return { type: "Identifier", name };
    }

    if (this.match(TokenType.LET)) {
      this.consume(TokenType.LPAREN, "Expect '(' after 'let'.");
      const assignments: { name: string; value: AST.Expression }[] = [];
      do {
        const name = this.consume(TokenType.IDENT, "Expect variable name in let.").value;
        this.consume(TokenType.EQUALS, "Expect '=' after variable name in let.");
        const value = this.expression();
        assignments.push({ name, value });
      } while (this.match(TokenType.COMMA));
      this.consume(TokenType.RPAREN, "Expect ')' after let variables.");
      const expr = this.expression();
      return { type: "LetExpression", assignments, expr };
    }

    if (this.match(TokenType.LSQUARE)) {
      if (this.check(TokenType.RSQUARE)) {
        this.advance();
        return { type: "ArrayExpression", elements: [] };
      }
      
      const first = this.arrayElement();
      if (this.match(TokenType.COLON)) {
        const second = this.expression();
        if (this.match(TokenType.COLON)) {
          const third = this.expression();
          this.consume(TokenType.RSQUARE, "Expect ']' after range expression.");
          return { type: "RangeExpression", start: first, step: second, end: third };
        } else {
          this.consume(TokenType.RSQUARE, "Expect ']' after range expression.");
          return { type: "RangeExpression", start: first, end: second };
        }
      }
      
      const elements: AST.Expression[] = [first];
      while (this.match(TokenType.COMMA)) {
        if (this.check(TokenType.RSQUARE)) {
          break;
        }
        elements.push(this.arrayElement());
      }
      this.consume(TokenType.RSQUARE, "Expect ']' after array.");
      return { type: "ArrayExpression", elements };
    }

    if (this.match(TokenType.LPAREN)) {
      const expr = this.expression();
      this.consume(TokenType.RPAREN, "Expect ')' after expression.");
      return expr;
    }

    throw new Error(`Expect expression at line ${this.peek().line}, col ${this.peek().col}. Found ${this.peek().value}`);
  }

  private listComprehensionBody(): AST.Expression {
    if (this.match(TokenType.FOR)) {
      this.consume(TokenType.LPAREN, "Expect '(' after 'for'.");
      const loops: { variable: string; range: AST.Expression }[] = [];
      do {
        const variable = this.consume(TokenType.IDENT, "Expect loop variable.").value;
        this.consume(TokenType.EQUALS, "Expect '=' after loop variable.");
        const range = this.expression();
        loops.push({ variable, range });
      } while (this.match(TokenType.COMMA));
      this.consume(TokenType.RPAREN, "Expect ')' after loop parameters.");

      let expr = this.listComprehensionBody();
      
      // Desugar loops from right to left
      for (let i = loops.length - 1; i >= 0; i--) {
        const loop = loops[i];
        expr = {
          type: "ListComprehension",
          variable: loop.variable,
          range: loop.range,
          expr
        };
      }
      return expr;
    }

    if (this.match(TokenType.LET)) {
      this.consume(TokenType.LPAREN, "Expect '(' after 'let'.");
      const assignments: { name: string; value: AST.Expression }[] = [];
      do {
        const name = this.consume(TokenType.IDENT, "Expect variable name in let.").value;
        this.consume(TokenType.EQUALS, "Expect '=' after variable name in let.");
        const value = this.expression();
        assignments.push({ name, value });
      } while (this.match(TokenType.COMMA));
      this.consume(TokenType.RPAREN, "Expect ')' after let variables.");

      const expr = this.listComprehensionBody();
      return { type: "LetExpression", assignments, expr };
    }

    if (this.match(TokenType.IF)) {
      this.consume(TokenType.LPAREN, "Expect '(' after 'if'.");
      const condition = this.expression();
      this.consume(TokenType.RPAREN, "Expect ')' after condition.");

      const thenBranch = this.listComprehensionBody();
      let elseBranch: AST.Expression | undefined;
      if (this.match(TokenType.ELSE)) {
        elseBranch = this.listComprehensionBody();
      }

      if (elseBranch) {
        return {
          type: "ListComprehension",
          variable: "_is_then",
          range: {
            type: "ArrayExpression",
            elements: [
              { type: "Literal", value: true },
              { type: "Literal", value: false }
            ]
          },
          condition: {
            type: "TernaryExpression",
            condition: { type: "Identifier", name: "_is_then" },
            trueExpr: condition,
            falseExpr: {
              type: "UnaryExpression",
              operator: "!",
              argument: condition
            }
          },
          expr: {
            type: "TernaryExpression",
            condition: { type: "Identifier", name: "_is_then" },
            trueExpr: thenBranch,
            falseExpr: elseBranch
          }
        };
      } else {
        return {
          type: "ListComprehension",
          variable: "_if_dummy",
          range: {
            type: "ArrayExpression",
            elements: [{ type: "Literal", value: 1 }]
          },
          condition,
          expr: thenBranch
        };
      }
    }

    if (this.match(TokenType.EACH)) {
      const expr = this.listComprehensionBody();
      return { type: "EachExpression", expr };
    }

    return this.expression();
  }

  private arrayElement(): AST.Expression {
    return this.listComprehensionBody();
  }

  // Helpers
  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(message + ` Found '${this.peek().value}' at line ${this.peek().line}, col ${this.peek().col}`);
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private peekNext(): Token {
    if (this.current + 1 >= this.tokens.length) return this.tokens[this.tokens.length - 1];
    return this.tokens[this.current + 1];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }
}
