const fs = require('fs');
const path = require('path');

const dir = 'C:/dev/webcad/src/core/commands';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'types.ts');

files.forEach(file => {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Update onInput signature
    // Match onInput(text: string, id: string, units: UnitsConfig) or variations
    
    // Pattern 1: (text: string, id: string, units: UnitsConfig)
    const pattern1 = /onInput\s*\(\s*((?:_text|text)\s*:\s*string)\s*,\s*((?:_id|id)\s*:\s*string)\s*,\s*(units\s*:\s*UnitsConfig)\s*\)/g;
    
    // Pattern 2: (text: string, units: UnitsConfig) - seen in UnitsCommand.ts
    const pattern2 = /onInput\s*\(\s*((?:_text|text)\s*:\s*string)\s*,\s*(units\s*:\s*UnitsConfig)\s*\)/g;

    if (pattern1.test(content)) {
        content = content.replace(pattern1, 'onInput($1, $2, $3, pickPt?: { x: number, y: number })');
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${file} (Pattern 1)`);
    } else if (pattern2.test(content)) {
        content = content.replace(pattern2, 'onInput($1, id: string, $2, pickPt?: { x: number, y: number })');
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${file} (Pattern 2)`);
    } else {
        // Try a more flexible match if the exact one above fails
        const flexibleSignature = /onInput\s*\(\s*text\s*:\s*string\s*,\s*id\s*:\s*string\s*,\s*units\s*:\s*UnitsConfig\s*,\s*pickPt\?\s*:\s*\{\s*x\s*:\s*number\s*,\s*y\s*:\s*number\s*\}\s*\)/g;
        if (flexibleSignature.test(content)) {
             console.log(`Skipping ${file} - already updated`);
        } else {
             console.log(`Warning: Could not find matching onInput signature in ${file}`);
        }
    }
});
