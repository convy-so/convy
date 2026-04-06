const fs = require('fs');

const input = fs.readFileSync('lints.txt', 'utf8');
const lines = input.split('\n');

let currentFile = '';
const rulesToContext = [];

for (const line of lines) {
  if (line.trim() === '') continue;
  
  if (line.match(/^C:\\Users/)) {
    currentFile = line.trim();
  } else if (line.match(/^\s+\d+:/)) {
    const match = line.match(/^\s+(\d+):/);
    if (!match) continue;
    const lineNum = parseInt(match[1]);
    const isError = line.includes('error');
    const ruleMatch = line.match(/@typescript-eslint\S+|react\S+|@next\S+/);
    const rule = ruleMatch ? ruleMatch[0] : 'unknown';
    
    // determine symbol
    let symbol = 'unknown';
    const symbolMatch = line.match(/'([^']+)'/);
    if (symbolMatch) {
      symbol = symbolMatch[1];
    } else if (line.includes('Unexpected any.')) {
      symbol = 'any';
    } else if (rule === 'react/no-unescaped-entities') {
      symbol = 'unescaped-quotes';
    } else if (rule === 'react-hooks/set-state-in-effect') {
      symbol = 'setSelectedStudyLanguage';
    } else if (rule === 'react-hooks/exhaustive-deps') {
      symbol = 't';
    } else if (rule === '@next/next/no-img-element') {
      symbol = '<img>';
    }

    rulesToContext.push({
      file: currentFile,
      line: lineNum,
      rule,
      symbol,
      raw: line.trim()
    });
  }
}

// deduplicate files and get symbols for `rg`
const filesToAnalyze = [...new Set(rulesToContext.map(r => r.file))];

for (const request of rulesToContext) {
  try {
    const content = fs.readFileSync(request.file, 'utf8').split('\n');
    const start = Math.max(0, request.line - 5);
    const end = Math.min(content.length, request.line + 5);
    
    console.log(`\n\n=== FILE: ${request.file.replace('C:\\\\Users\\\\pc\\\\convy\\\\', '')} L:${request.line} SYMBOL: ${request.symbol} RULE: ${request.rule}`);
    console.log(content.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n'));
    
  } catch (e) {
    console.error(`Could not read ${request.file}`);
  }
}

