const fs = require('fs');
const parser = require('@babel/parser');

const code = fs.readFileSync('/Users/msun/Desktop/Project apps/Kill_metraj_Web/frontend/src/components/route/RouteManagement.tsx', 'utf-8');

try {
  let ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript']
  });
  console.log("Parsed successfully!");
} catch (e) {
  console.log("Parse error at line", e.loc.line, "column", e.loc.column);
  console.log("Message:", e.message);
}
