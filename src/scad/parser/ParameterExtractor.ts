export interface ScadParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  defaultValue: any;
  value: any;
  description?: string;
  group?: string;
  options?: any[]; // For enums
  min?: number;
  max?: number;
  step?: number;
}

export class ParameterExtractor {
  extract(source: string): ScadParameter[] {
    const params: ScadParameter[] = [];
    const lines = source.split('\n');
    let currentGroup = "Parameters";
    let currentDescription = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Group marker: /* [Group Name] */
      const groupMatch = line.match(/\/\*\s*\[(.*)\]\s*\*\//);
      if (groupMatch) {
        currentGroup = groupMatch[1];
        continue;
      }

      // Description marker or Group header: // Description or // Core Dimensions
      const descMatch = line.match(/^\/\/\s*(.*)/);
      if (descMatch && !line.includes('=')) {
        const commentText = descMatch[1].trim();
        // Heuristic: Standalone comment of 1-4 words (<= 35 chars) with no period is a Group header.
        const isLikelyGroup = commentText.length <= 35 &&
                              /^[A-Za-z0-9]/.test(commentText) &&
                              !/[.!?]$/.test(commentText);
        if (isLikelyGroup) {
          currentGroup = commentText;
          currentDescription = "";
        } else {
          currentDescription = commentText;
        }
        continue;
      }

      // Assignment: name = value; // metadata
      const assignMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^;]+);?(.*)/);
      if (assignMatch) {
        const name = assignMatch[1];
        const rawValue = assignMatch[2].trim();
        const metadata = assignMatch[3].trim();

        if (!this.isSimpleLiteral(rawValue)) {
          continue; // Skip calculated/complex expressions
        }

        const defaultValue = this.parseValue(rawValue);
        const type: ScadParameter['type'] = typeof defaultValue === 'boolean' ? 'boolean' : (typeof defaultValue === 'number' ? 'number' : 'string');
        
        const param: ScadParameter = {
          name,
          type,
          defaultValue,
          value: defaultValue,
          description: currentDescription,
          group: currentGroup
        };

        // Parse metadata: // [0:1:100] or // [a, b, c] or // Help text
        if (metadata.startsWith('//')) {
          const metaContent = metadata.substring(2).trim();
          const rangeMatch = metaContent.match(/^\[([-0-9.]+):([-0-9.]+):([-0-9.]+)\]/);
          if (rangeMatch) {
            param.min = parseFloat(rangeMatch[1]);
            param.step = parseFloat(rangeMatch[2]);
            param.max = parseFloat(rangeMatch[3]);
            param.type = 'number';
          } else {
            const enumMatch = metaContent.match(/^\[(.*)\]/);
            if (enumMatch) {
              param.options = enumMatch[1].split(',').map(s => this.parseValue(s.trim()));
              param.type = 'enum';
            } else {
              // Custom help text/description on the right side of the parameter
              param.description = metaContent;
            }
          }
        }

        params.push(param);
        currentDescription = ""; // Reset for next
      }
    }

    return params;
  }

  private parseValue(val: string): any {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (!isNaN(parseFloat(val)) && isFinite(Number(val))) return parseFloat(val);
    if (val.startsWith('"') && val.endsWith('"')) return val.substring(1, val.length - 1);
    return val;
  }

  private isSimpleLiteral(val: string): boolean {
    val = val.trim();
    if (val === 'true' || val === 'false') return true;
    if (val.startsWith('"') && val.endsWith('"')) return true;
    if (val.startsWith('0x')) {
      const hexVal = val.substring(2);
      return /^[0-9a-fA-F]+$/.test(hexVal);
    }
    return /^-?[0-9.]+$/.test(val) && !isNaN(Number(val));
  }
}
