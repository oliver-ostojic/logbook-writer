#!/usr/bin/env tsx
/**
 * Manual cleanup script to remove test stores and data from database
 * 
 * Usage:
 *   pnpm db:cleanup-tests
 *   tsx test/cleanup-test-stores.ts
 */

import { cleanupTestStores, cleanupTestCrew, disconnectPrisma } from './test-cleanup';

async function main() {
  console.log('🧹 Starting manual test data cleanup...\n');
  
  // Clean up test crew with common prefixes
  console.log('Cleaning up test crew members...');
  await cleanupTestCrew(); // Cleans TUN, TST, TEST prefixes
  
  // Clean up test stores and all related data
  console.log('\nCleaning up test stores...');
  await cleanupTestStores();
  
  console.log('🎉 Manual cleanup complete!');
  await disconnectPrisma();
}

main().catch((error) => {
  console.error('💥 Cleanup failed:', error);
  process.exit(1);
});
