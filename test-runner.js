#!/usr/bin/env node

console.log('🧪 Testing VeloReady Backend Integration Tests...\n');

// Test 1: Check if Vitest is installed
try {
  const vitest = require('vitest');
  console.log('✅ Vitest is installed');
} catch (error) {
  console.log('❌ Vitest is not installed:', error.message);
}

// Test 2: Check if test files exist
const fs = require('fs');
const path = require('path');

const testFiles = [
  'tests/simple.test.ts',
  'tests/integration/api.activities.test.ts',
  'tests/integration/api.streams.test.ts',
  'tests/integration/api.ai-brief.test.ts',
  'tests/integration/oauth.strava.test.ts',
  'tests/integration/api.intervals.test.ts',
  'tests/integration/api.wellness.test.ts'
];

console.log('\n📁 Checking test files:');
testFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file} exists`);
  } else {
    console.log(`❌ ${file} missing`);
  }
});

// Test 3: Check if API files exist
const apiFiles = [
  'netlify/functions/api-activities.ts',
  'netlify/functions/api-streams.ts',
  'netlify/functions/ai-brief.ts',
  'netlify/functions/oauth-strava-start.ts',
  'netlify/functions/oauth-strava-token-exchange.ts'
];

console.log('\n🔌 Checking API files:');
apiFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file} exists`);
  } else {
    console.log(`❌ ${file} missing`);
  }
});

// Test 4: Check package.json scripts
console.log('\n📦 Checking package.json scripts:');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const scripts = packageJson.scripts || {};
  
  if (scripts.test) {
    console.log('✅ test script exists');
  } else {
    console.log('❌ test script missing');
  }
  
  if (scripts['test:integration']) {
    console.log('✅ test:integration script exists');
  } else {
    console.log('❌ test:integration script missing');
  }
} catch (error) {
  console.log('❌ Error reading package.json:', error.message);
}

console.log('\n🎯 Test setup verification complete!');
