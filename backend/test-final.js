// Final test for JavaScript deployment
const fs = require('fs');
const path = require('path');

console.log('🚀 FINAL TEST - JavaScript Backend for Render');
console.log('==============================================');

// Check if we're in the right directory
if (!fs.existsSync('package.json')) {
  console.log('❌ package.json not found. Please run from backend directory.');
  process.exit(1);
}

console.log('📦 Checking package.json...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

if (packageJson.main !== 'src/server.js') {
  console.log('❌ Main entry point should be src/server.js');
  process.exit(1);
}

if (packageJson.scripts.start !== 'node src/server.js') {
  console.log('❌ Start script should be "node src/server.js"');
  process.exit(1);
}

console.log('✅ package.json configuration is correct');

// Check if all required JavaScript files exist
const requiredFiles = [
  'src/server.js',
  'src/models/Courier.js',
  'src/models/Route.js',
  'src/controllers/CourierController.js',
  'src/controllers/RouteController.js',
  'src/controllers/UploadController.js',
  'src/middleware/errorHandler.js',
  'src/middleware/notFound.js',
  'src/routes/courierRoutes.js',
  'src/routes/routeRoutes.js',
  'src/routes/uploadRoutes.js',
  'src/routes/analyticsRoutes.js',
  'src/services/GoogleMapsService.js'
];

console.log('📁 Checking JavaScript files...');
let allFilesExist = true;
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} not found`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  console.log('❌ Some required files are missing');
  process.exit(1);
}

// Check if TypeScript files are removed
console.log('🧹 Checking for TypeScript files...');
const tsFiles = [];
function findTsFiles(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      findTsFiles(filePath);
    } else if (file.endsWith('.ts')) {
      tsFiles.push(filePath);
    }
  });
}

findTsFiles('src');
if (tsFiles.length > 0) {
  console.log('❌ TypeScript files still exist:');
  tsFiles.forEach(file => console.log(`   ${file}`));
  process.exit(1);
}

console.log('✅ No TypeScript files found');

// Check dependencies
console.log('📋 Checking dependencies...');
const dependencies = Object.keys(packageJson.dependencies || {});
const devDependencies = Object.keys(packageJson.devDependencies || {});

console.log(`Dependencies: ${dependencies.length}`);
console.log(`Dev Dependencies: ${devDependencies.length}`);

// Check for TypeScript dependencies
const tsDeps = devDependencies.filter(dep => dep.startsWith('@types/') || dep === 'typescript' || dep === 'ts-node');
if (tsDeps.length > 0) {
  console.log('❌ TypeScript dependencies still present:');
  tsDeps.forEach(dep => console.log(`   ${dep}`));
  process.exit(1);
}

console.log('✅ No TypeScript dependencies found');

console.log('');
console.log('🎉 BACKEND IS READY FOR RENDER DEPLOYMENT!');
console.log('');
console.log('📋 DEPLOYMENT CHECKLIST:');
console.log('1. ✅ All TypeScript files removed');
console.log('2. ✅ All JavaScript files created');
console.log('3. ✅ package.json configured for JavaScript');
console.log('4. ✅ No TypeScript dependencies');
console.log('5. ✅ Main entry point: src/server.js');
console.log('6. ✅ Start command: npm start');
console.log('');
console.log('🚀 RENDER SETTINGS:');
console.log('   Root Directory: backend');
console.log('   Build Command: npm install');
console.log('   Start Command: npm start');
console.log('');
console.log('🌐 API ENDPOINTS:');
console.log('   GET  /health - Health check');
console.log('   GET  /api/couriers - Get all couriers');
console.log('   POST /api/couriers - Create courier');
console.log('   GET  /api/routes - Get all routes');
console.log('   POST /api/routes - Create route');
console.log('   POST /api/upload/excel - Upload Excel file');
console.log('   GET  /api/analytics/dashboard - Dashboard analytics');
console.log('');
console.log('✅ READY TO DEPLOY! 🎉');


