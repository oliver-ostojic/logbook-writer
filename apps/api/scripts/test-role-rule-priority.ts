import { PrismaClient, RoleRuleType, ConstraintType } from '@prisma/client';
import { buildSolverInputV2 } from '../src/solver2/builder';

const prisma = new PrismaClient();

const STORE_ID = 768;
const TEST_DATE = new Date('2025-12-13');

async function getSolverInput() {
  return buildSolverInputV2({ storeId: STORE_ID, date: TEST_DATE });
}

async function main() {
  console.log('='.repeat(60));
  console.log('TESTING ROLE RULE PRIORITY LOGIC');
  console.log('='.repeat(60));

  // Get some crew to test with
  const crew = await prisma.crew.findMany({
    where: { storeId: STORE_ID },
    take: 3,
  });
  
  if (crew.length < 2) {
    console.error('Need at least 2 crew members for this test');
    return;
  }

  const [crew1, crew2] = crew;
  console.log(`\nTest crew: ${crew1.name} (${crew1.id}), ${crew2.name} (${crew2.id})`);

  // Find a LIKE_ROLE_FOR_HOUR_X rule for REG (roleId 30)
  const regLikeRule = await prisma.roleRule.findFirst({
    where: { roleId: 30, type: RoleRuleType.LIKE_ROLE_FOR_HOUR_X },
  });

  if (!regLikeRule) {
    console.error('No LIKE_ROLE_FOR_HOUR_X rule found for REG');
    return;
  }

  console.log(`\nUsing RoleRule id=${regLikeRule.id} (LIKE_ROLE_FOR_HOUR_X for REG)`);

  // Clean up any existing test data
  await prisma.storeRoleRule.deleteMany({
    where: { storeId: STORE_ID, roleRuleId: regLikeRule.id },
  });
  await prisma.crewRoleRule.deleteMany({
    where: { crewId: { in: [crew1.id, crew2.id] }, roleRuleId: regLikeRule.id },
  });

  // ============================================
  // TEST 1: Store rule only (should apply to all crew)
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: StoreRoleRule only (valueInt=540 = 9:00 AM)');
  console.log('='.repeat(60));

  await prisma.storeRoleRule.create({
    data: {
      storeId: STORE_ID,
      roleRuleId: regLikeRule.id,
      valueInt: 540, // 9:00 AM
      isPriority: false,
    },
  });

  let solverInput = await getSolverInput();
  
  // Find rules for our test crew
  const test1Rules = solverInput.roleRules.filter(
    r => r.type === 'LIKE_ROLE_FOR_HOUR_X' && r.roleId === 30 && 
         (r.crewId === crew1.id || r.crewId === crew2.id)
  );
  
  console.log(`Rules for ${crew1.name}: valueInt=${test1Rules.find(r => r.crewId === crew1.id)?.valueInt}`);
  console.log(`Rules for ${crew2.name}: valueInt=${test1Rules.find(r => r.crewId === crew2.id)?.valueInt}`);
  console.log(`Expected: Both should be 540 (from store rule)`);
  console.log(test1Rules.every(r => r.valueInt === 540) ? '✅ PASS' : '❌ FAIL');

  // ============================================
  // TEST 2: Crew1 has override (no priority flags)
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: Crew1 has CrewRoleRule (valueInt=600 = 10:00 AM), no priority flags');
  console.log('='.repeat(60));

  await prisma.crewRoleRule.create({
    data: {
      crewId: crew1.id,
      roleRuleId: regLikeRule.id,
      valueInt: 600, // 10:00 AM
      isPriority: false,
    },
  });

  solverInput = await getSolverInput();
  
  const test2Rules = solverInput.roleRules.filter(
    r => r.type === 'LIKE_ROLE_FOR_HOUR_X' && r.roleId === 30 && 
         (r.crewId === crew1.id || r.crewId === crew2.id)
  );
  
  const crew1Rule2 = test2Rules.find(r => r.crewId === crew1.id);
  const crew2Rule2 = test2Rules.find(r => r.crewId === crew2.id);
  
  console.log(`Rules for ${crew1.name}: valueInt=${crew1Rule2?.valueInt}`);
  console.log(`Rules for ${crew2.name}: valueInt=${crew2Rule2?.valueInt}`);
  console.log(`Expected: ${crew1.name}=600 (crew override), ${crew2.name}=540 (store fallback)`);
  console.log(crew1Rule2?.valueInt === 600 && crew2Rule2?.valueInt === 540 ? '✅ PASS' : '❌ FAIL');

  // ============================================
  // TEST 3: Store has isPriority=true (overrides crew's non-priority rule)
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Store isPriority=true, Crew1 isPriority=false');
  console.log('='.repeat(60));

  await prisma.storeRoleRule.update({
    where: { storeId_roleRuleId: { storeId: STORE_ID, roleRuleId: regLikeRule.id } },
    data: { isPriority: true },
  });

  solverInput = await getSolverInput();
  
  const test3Rules = solverInput.roleRules.filter(
    r => r.type === 'LIKE_ROLE_FOR_HOUR_X' && r.roleId === 30 && 
         (r.crewId === crew1.id || r.crewId === crew2.id)
  );
  
  const crew1Rule3 = test3Rules.find(r => r.crewId === crew1.id);
  const crew2Rule3 = test3Rules.find(r => r.crewId === crew2.id);
  
  console.log(`Rules for ${crew1.name}: valueInt=${crew1Rule3?.valueInt}`);
  console.log(`Rules for ${crew2.name}: valueInt=${crew2Rule3?.valueInt}`);
  console.log(`Expected: Both=540 (store priority wins over crew non-priority)`);
  console.log(crew1Rule3?.valueInt === 540 && crew2Rule3?.valueInt === 540 ? '✅ PASS' : '❌ FAIL');

  // ============================================
  // TEST 4: Crew1 has isPriority=true (overrides store priority)
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: Store isPriority=true, Crew1 isPriority=true');
  console.log('='.repeat(60));

  await prisma.crewRoleRule.update({
    where: { crewId_roleRuleId: { crewId: crew1.id, roleRuleId: regLikeRule.id } },
    data: { isPriority: true },
  });

  solverInput = await getSolverInput();
  
  const test4Rules = solverInput.roleRules.filter(
    r => r.type === 'LIKE_ROLE_FOR_HOUR_X' && r.roleId === 30 && 
         (r.crewId === crew1.id || r.crewId === crew2.id)
  );
  
  const crew1Rule4 = test4Rules.find(r => r.crewId === crew1.id);
  const crew2Rule4 = test4Rules.find(r => r.crewId === crew2.id);
  
  console.log(`Rules for ${crew1.name}: valueInt=${crew1Rule4?.valueInt}`);
  console.log(`Rules for ${crew2.name}: valueInt=${crew2Rule4?.valueInt}`);
  console.log(`Expected: ${crew1.name}=600 (crew priority wins), ${crew2.name}=540 (store priority)`);
  console.log(crew1Rule4?.valueInt === 600 && crew2Rule4?.valueInt === 540 ? '✅ PASS' : '❌ FAIL');

  // ============================================
  // Cleanup
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('CLEANUP');
  console.log('='.repeat(60));

  await prisma.storeRoleRule.deleteMany({
    where: { storeId: STORE_ID, roleRuleId: regLikeRule.id },
  });
  await prisma.crewRoleRule.deleteMany({
    where: { crewId: { in: [crew1.id, crew2.id] }, roleRuleId: regLikeRule.id },
  });

  console.log('Test data cleaned up.');
  console.log('\n✅ All tests complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
