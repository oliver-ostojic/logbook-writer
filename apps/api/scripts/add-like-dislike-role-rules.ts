import { PrismaClient, RoleRuleType, ConstraintType } from '@prisma/client';

const prisma = new PrismaClient();

// All roles for store 768
const ROLE_IDS = [29, 30, 33, 34, 35, 36, 37, 38];

async function createRoleRule(roleId: number, type: RoleRuleType) {
  try {
    const rule = await prisma.roleRule.create({
      data: {
        roleId,
        type,
        constraintType: ConstraintType.SOFT,
      },
    });
    console.log(`✅ Created ${type} for role ${roleId} (id: ${rule.id})`);
  } catch (error: any) {
    if (error.code === 'P2002') {
      console.log(`⏭️  ${type} for role ${roleId} already exists`);
    } else {
      console.error(`❌ Failed to create ${type} for role ${roleId}:`, error.message);
    }
  }
}

async function main() {
  console.log('Creating LIKE_ROLE_FOR_HOUR_X and DISLIKE_ROLE_FOR_HOUR_X rules for all roles in store 768...\n');

  for (const roleId of ROLE_IDS) {
    await createRoleRule(roleId, RoleRuleType.LIKE_ROLE_FOR_HOUR_X);
    await createRoleRule(roleId, RoleRuleType.DISLIKE_ROLE_FOR_HOUR_X);
  }

  console.log('\nDone!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
