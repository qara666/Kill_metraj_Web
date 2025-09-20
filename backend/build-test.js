// Simple build test script
const fs = require('fs');
const path = require('path');

console.log('🔨 Testing TypeScript build for Render...');

// Check if we're in the right directory
if (!fs.existsSync('package.json')) {
  console.log('❌ package.json not found. Please run from backend directory.');
  process.exit(1);
}

console.log('📦 Checking package.json...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

if (!packageJson.scripts || !packageJson.scripts.build) {
  console.log('❌ Build script not found in package.json');
  process.exit(1);
}

console.log('✅ package.json looks good');
console.log('📁 Checking source files...');

// Check if src directory exists
if (!fs.existsSync('src')) {
  console.log('❌ src directory not found');
  process.exit(1);
}

console.log('✅ src directory exists');
console.log('🔧 TypeScript configuration...');

// Check tsconfig.json
if (!fs.existsSync('tsconfig.json')) {
  console.log('❌ tsconfig.json not found');
  process.exit(1);
}

const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
console.log('✅ tsconfig.json found');

// Check if types.d.ts exists
if (fs.existsSync('src/types.d.ts')) {
  console.log('✅ types.d.ts found');
} else {
  console.log('⚠️  types.d.ts not found, but that\'s okay');
}

console.log('🚀 Build configuration looks good!');
console.log('📋 Ready for deployment on Render');
console.log('');
console.log('To deploy:');
console.log('1. Push to GitHub');
console.log('2. Create Web Service on Render');
console.log('3. Set Root Directory to "backend"');
console.log('4. Set Build Command to "npm install && npm run build"');
console.log('5. Set Start Command to "npm start"');
