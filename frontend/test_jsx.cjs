const fs = require('fs');
const content = fs.readFileSync('src/components/modals/MileageModal.tsx', 'utf8');
const lines = content.split('\n');

let openCount = 0;
for (let i = 812; i < lines.length; i++) {
  const line = lines[i];
  const opens = (line.match(/<div(\s|>)/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  openCount += opens - closes;
  if (opens !== closes) {
    console.log(`Line ${i + 1}: opens=${opens}, closes=${closes}, totalOpen=${openCount}`);
  }
}
console.log('Final open count:', openCount);
