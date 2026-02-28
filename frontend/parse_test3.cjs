const fs = require('fs');
const { parse } = require('@babel/parser');

const code = fs.readFileSync('/Users/msun/Desktop/Project apps/Kill_metraj_Web/frontend/src/components/route/RouteManagement.tsx', 'utf-8');

try {
    parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript']
    });
    console.log('SUCCESS');
} catch (e) {
    console.log('Error:', e.message);
    console.log('Line:', e.loc.line);
    console.log('Col:', e.loc.column);
}
