/**
 * Create the first ADMIN user directly in the database.
 * Run with: npx ts-node scripts/create-admin.ts
 *
 * Usage:
 *   npx ts-node scripts/create-admin.ts <username> <password> <name>
 *
 * Example:
 *   npx ts-node scripts/create-admin.ts admin secretpass123 "Admin User"
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const [, , username, password, name] = process.argv;

  if (!username || !password || !name) {
    console.error('Usage: npx ts-node scripts/create-admin.ts <username> <password> <name>');
    console.error('Example: npx ts-node scripts/create-admin.ts admin secretpass123 "Admin User"');
    process.exit(1);
  }

  // Check if username already exists
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.error(`Error: Username "${username}" already exists.`);
    process.exit(1);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Create admin user
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      name,
      role: 'ADMIN',
      storeId: null, // ADMIN has global access
      crewId: null,
    },
  });

  console.log('✓ Admin user created successfully!');
  console.log(`  ID: ${user.id}`);
  console.log(`  Username: ${user.username}`);
  console.log(`  Name: ${user.name}`);
  console.log(`  Role: ${user.role}`);
}

main()
  .catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
