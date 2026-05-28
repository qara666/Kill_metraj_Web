const fs = require('fs');
const path = require('path');

const files = [
  'backend/simple_server.js',
  'backend/src/routes/proxyRoutes.js',
  'backend/workers/dashboardFetcher.js'
];

for (const file of files) {
  const filePath = path.join(process.cwd(), file);
  if (!fs.existsSync(filePath)) continue;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let newContent = '';
  let lines = content.split('\n');
  
  let state = 'NORMAL'; // NORMAL, IN_UPSTREAM, IN_STASHED
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('<<<<<<< ')) {
      state = 'IN_UPSTREAM';
      continue;
    }
    
    if (line.startsWith('=======')) {
      if (state === 'IN_UPSTREAM') {
        state = 'IN_STASHED';
        continue;
      }
    }
    
    if (line.startsWith('>>>>>>> ')) {
      if (state === 'IN_STASHED') {
        state = 'NORMAL';
        continue;
      }
    }
    
    if (state === 'NORMAL') {
      newContent += line + '\n';
    } else if (state === 'IN_STASHED') {
      newContent += line + '\n';
    }
    // if IN_UPSTREAM, we ignore it
  }
  
  fs.writeFileSync(filePath, newContent);
  console.log(`Resolved: ${file}`);
}
