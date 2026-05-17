export enum TokenType {
  NUMBER, STRING, IDENT,
  TRUE, FALSE, UNDEF,
  IF, ELSE, FOR, LET, MODULE, FUNCTION, INCLUDE, USE,
  LBRACE, RBRACE, LPAREN, RPAREN, LSQUARE, RSQUARE,
  SEMICOLON, COMMA, EQUALS, PLUS, MINUS, STAR, SLASH, PERCENT, CARET,
  BANG, AMP_AMP, PIPE_PIPE, LT, GT, LE, GE, EQ, NEQ,
  QUESTION, COLON,
  EOF
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

const KEYWORDS: Record<string, TokenType> = {
  "if": TokenType.IF,
  "else": TokenType.ELSE,
  "for": TokenType.FOR,
  "let": TokenType.LET,
  "module": TokenType.MODULE,
  "function": TokenType.FUNCTION,
  "include": TokenType.INCLUDE,
  "use": TokenType.USE,
  "true": TokenType.TRUE,
  "false": TokenType.FALSE,
  "undef": TokenType.UNDEF,
};

const SYMBOLS: Record<string, TokenType> = {
  "{": TokenType.LBRACE, "}": TokenType.RBRACE,
  "(": TokenType.LPAREN, ")": TokenType.RPAREN,
  "[": TokenType.LSQUARE, "]": TokenType.RSQUARE,
  ";": TokenType.SEMICOLON, ",": TokenType.COMMA,
  "=": TokenType.EQUALS, "+": TokenType.PLUS,
  "-": TokenType.MINUS, "*": TokenType.STAR,
  "/": TokenType.SLASH, "%": TokenType.PERCENT,
  "^": TokenType.CARET, "!": TokenType.BANG,
  "<": TokenType.LT, ">": TokenType.GT,
  "?": TokenType.QUESTION, ":": TokenType.COLON,
};

const MULTI_SYMBOLS: [string, TokenType][] = [
  ["&&", TokenType.AMP_AMP],
  ["||", TokenType.PIPE_PIPE],
  ["<=", TokenType.LE],
  [">=", TokenType.GE],
  ["==", TokenType.EQ],
  ["!=", TokenType.NEQ],
];

export class ScadLexer {
  private src: string = "";
  private pos: number = 0;
  private line: number = 1;
  private col: number = 1;

  tokenize(src: string): Token[] {
    this.src = src;
    this.pos = 0;
    this.line = 1;
    this.col = 1;
    const tokens: Token[] = [];

    while (this.pos < this.src.length) {
      const char = this.src[this.pos];

      // Skip whitespace
      if (/\s/.test(char)) {
        if (char === '\n') { this.line++; this.col = 1; }
        else { this.col++; }
        this.pos++;
        continue;
      }

      // Skip comments
      if (char === '/' && this.src[this.pos + 1] === '/') {
        while (this.pos < this.src.length && this.src[this.pos] !== '\n') this.pos++;
        continue;
      }
      if (char === '/' && this.src[this.pos + 1] === '*') {
        this.pos += 2;
        while (this.pos < this.src.length && !(this.src[this.pos] === '*' && this.src[this.pos + 1] === '/')) {
          if (this.src[this.pos] === '\n') { this.line++; this.col = 1; }
          this.pos++;
        }
        this.pos += 2;
        continue;
      }

      // Multi-char symbols
      let matchedMulti = false;
      for (const [str, type] of MULTI_SYMBOLS) {
        if (this.src.startsWith(str, this.pos)) {
          tokens.push({ type, value: str, line: this.line, col: this.col });
          this.pos += str.length;
          this.col += str.length;
          matchedMulti = true;
          break;
        }
      }
      if (matchedMulti) continue;

      // Numbers
      if (/[0-9.]/.test(char)) {
        // Handle leading dot or digit
        const match = this.src.slice(this.pos).match(/^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/);
        if (match) {
          tokens.push({ type: TokenType.NUMBER, value: match[0], line: this.line, col: this.col });
          this.pos += match[0].length;
          this.col += match[0].length;
          continue;
        }
      }

      // Identifiers and Keywords
      if (/[a-zA-Z_$]/.test(char)) {
        const match = this.src.slice(this.pos).match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
        if (match) {
          const value = match[0];
          const type = KEYWORDS[value] || TokenType.IDENT;
          tokens.push({ type, value, line: this.line, col: this.col });
          this.pos += value.length;
          this.col += value.length;
          continue;
        }
      }

      // Strings
      if (char === '"') {
        let value = "";
        const startCol = this.col;
        this.pos++; this.col++;
        while (this.pos < this.src.length && this.src[this.pos] !== '"') {
          if (this.src[this.pos] === '\\') {
            value += this.src[this.pos + 1];
            this.pos += 2; this.col += 2;
          } else {
            if (this.src[this.pos] === '\n') { this.line++; this.col = 1; }
            value += this.src[this.pos];
            this.pos++; this.col++;
          }
        }
        this.pos++; this.col++;
        tokens.push({ type: TokenType.STRING, value, line: this.line, col: startCol });
        continue;
      }

      // Single-char symbols
      const type = SYMBOLS[char];
      if (type !== undefined) {
        tokens.push({ type, value: char, line: this.line, col: this.col });
        this.pos++;
        this.col++;
        continue;
      }

      throw new Error(`Unexpected character '${char}' at line ${this.line}, col ${this.col}`);
    }

    tokens.push({ type: TokenType.EOF, value: "", line: this.line, col: this.col });
    return tokens;
  }
}
