#!/usr/bin/env node

/**
 * Script to update the build version in index.html during build process
 * This helps with cache invalidation and version detection
 */

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '../dist/index.html');

// Generate a version string using timestamp
const buildVersion = `v${Date.now()}`;

try {
  if (fs.existsSync(indexPath)) {
    let content = fs.readFileSync(indexPath, 'utf8');
    
    // Replace the placeholder with actual build version
    content = content.replace(
      'BUILD_VERSION_PLACEHOLDER',
      buildVersion
    );
    
    fs.writeFileSync(indexPath, content, 'utf8');
    console.log(`✅ Build version updated to: ${buildVersion}`);
  } else {
    console.warn(`⚠️  index.html not found at ${indexPath}`);
  }
} catch (error) {
  console.error('❌ Error updating build version:', error);
  process.exit(1);
}