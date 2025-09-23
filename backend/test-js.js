// Test JavaScript version
const fs = require('fs');
const path = require('path');

console.log('🔨 Testing JavaScript version for Render...');

// Check if we're in the right directory
if (!fs.existsSync('package.json')) {
  console.log('❌ package.json not found. Please run from backend directory.');
  process.exit(1);
}

console.log('📦 Checking package.json...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

if (!packageJson.scripts || !packageJson.scripts.start) {
  console.log('❌ Start script not found in package.json');
  process.exit(1);
}

console.log('✅ package.json looks good');
console.log('📁 Checking JavaScript files...');

// Check if main files exist
const requiredFiles = [
  'src/server.js',
  'src/models/Courier.js',
  'src/models/Route.js',
  'src/controllers/CourierController.js',
  'src/middleware/errorHandler.js',
  'src/middleware/notFound.js',
  'src/routes/courierRoutes.js'
];

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

console.log('🚀 JavaScript version looks good!');
console.log('📋 Ready for deployment on Render');
console.log('');
console.log('To deploy:');
console.log('1. Push to GitHub');
console.log('2. Create Web Service on Render');
console.log('3. Set Root Directory to "backend"');
console.log('4. Set Build Command to "npm install"');
console.log('5. Set Start Command to "npm start"');
console.log('');
console.log('No TypeScript compilation needed! 🎉');



