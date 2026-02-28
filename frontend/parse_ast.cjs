const fs = require('fs');

const code = fs.readFileSync('/Users/msun/Desktop/Project apps/Kill_metraj_Web/frontend/src/components/route/RouteManagement.tsx', 'utf-8');
const { parse } = require('@babel/parser');

try {
  parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript']
  });
  console.log('SUCCESS');
} catch (e) {
  console.log(e.message);
}
