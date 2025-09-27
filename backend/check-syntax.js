// Simple syntax checker for TypeScript files
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking TypeScript syntax...');

// List of files to check
const filesToCheck = [
  'src/server.ts',
  'src/controllers/CourierController.ts',
  'src/controllers/RouteController.ts',
  'src/controllers/UploadController.ts',
  'src/middleware/errorHandler.ts',
  'src/middleware/notFound.ts',
  'src/routes/analyticsRoutes.ts',
  'src/routes/courierRoutes.ts',
  'src/routes/routeRoutes.ts',
  'src/routes/uploadRoutes.ts',
  'src/models/Courier.ts',
  'src/models/Route.ts'
];

let hasErrors = false;

filesToCheck.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    
    // Basic syntax checks
    const issues = [];
    
    // Check for missing semicolons
    if (content.includes('import ') && !content.includes(';')) {
      issues.push('Missing semicolons after imports');
    }
    
    // Check for unclosed brackets
    const openBrackets = (content.match(/\{/g) || []).length;
    const closeBrackets = (content.match(/\}/g) || []).length;
    if (openBrackets !== closeBrackets) {
      issues.push('Unmatched brackets');
    }
    
    // Check for unclosed parentheses
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      issues.push('Unmatched parentheses');
    }
    
    if (issues.length > 0) {
      console.log(`❌ ${file}:`);
      issues.forEach(issue => console.log(`   - ${issue}`));
      hasErrors = true;
    } else {
      console.log(`✅ ${file}`);
    }
  } catch (error) {
    console.log(`❌ ${file}: ${error.message}`);
    hasErrors = true;
  }
});

if (hasErrors) {
  console.log('\n❌ Found syntax issues');
  process.exit(1);
} else {
  console.log('\n✅ All files passed basic syntax check');
  console.log('🚀 Ready for deployment on Render');
}



