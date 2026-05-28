export interface PathToken { cmd: string; args: number[] }

const CMD_ARGS: Record<string, number> = {
  M:2, m:2, L:2, l:2, H:1, h:1, V:1, v:1,
  C:6, c:6, S:4, s:4, Q:4, q:4, T:2, t:2,
  A:7, a:7, Z:0, z:0,
}

/**
 * Tokenises an SVG path 'd' attribute string into a list of commands and their arguments.
 * Handles implicit command repetition (e.g., M 10 10 20 20 -> M 10 10, L 20 20).
 */
export function tokenisePath(d: string): PathToken[] {
  const tokens: PathToken[] = []
  
  // Regex to extract commands and numbers (including scientific notation and floats)
  // [a-df-z] matches all SVG commands (excluding 'e' which is part of scientific notation)
  const regex = /([a-df-z])|(-?(\d*\.\d+|\d+\.?)(e[+-]?\d+)?)/gi
  const stream: string[] = []
  let match: RegExpExecArray | null
  
  while ((match = regex.exec(d)) !== null) {
    stream.push(match[0])
  }
  
  let i = 0
  let lastCmd = ''
  
  while (i < stream.length) {
    const token = stream[i]
    let cmd: string
    
    if (/[a-z]/i.test(token)) {
      cmd = token
      lastCmd = token
      i++
    } else {
      // Argument without a command: implicit repetition
      if (lastCmd === 'M') lastCmd = 'L'
      else if (lastCmd === 'm') lastCmd = 'l'
      cmd = lastCmd
    }
    
    const nArgs = CMD_ARGS[cmd] ?? 0
    const args: number[] = []
    
    for (let j = 0; j < nArgs; j++) {
      if (i < stream.length) {
        args.push(parseFloat(stream[i++]))
      }
    }
    
    tokens.push({ cmd, args })
    
    // Support Z/z which might be followed by garbage numbers in some SVGs
    if (nArgs === 0) {
       while (i < stream.length && !/[a-z]/i.test(stream[i])) i++
    }
  }
  
  return tokens
}

/**
 * Helper to read a single number from a string at a given position.
 * Provided for compatibility with instructions.
 */
export function readNumber(d: string, start: number): { value: number; end: number } {
  const sub = d.slice(start)
  const m = sub.match(/^\s*(-?(\d*\.\d+|\d+\.?)(e[+-]?\d+)?)/i)
  if (!m) return { value: NaN, end: start }
  return { value: parseFloat(m[1]), end: start + m[0].length }
}
