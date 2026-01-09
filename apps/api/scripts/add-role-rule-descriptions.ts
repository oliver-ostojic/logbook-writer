import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const role_rule_descriptions: Record<number, string> = {
  1: "The crew member prefers not to work register after parking helms.",
  2: "A crew member cannot work break after register.",
  5: "A crew member cannot work register for less than the required hours.",
  6: "The crew member prefers not to work register consecutively beyond a certain time.",
  7: "A crew member cannot work product for less than the required hours.",
  8: "The crew member prefers not to work product consecutively beyond a certain time.",
  9: "A crew member cannot be assigned to parking helms.",
  10: "The crew member prefers parking helms to be assigned at specific times.",
  11: "The crew member prefers break to be assigned at specific times.",
  12: "A crew member cannot take a break unless their shift meets the minimum length.",
  13: "A crew member cannot take a break until after a minimum time into their shift.",
  14: "A crew member cannot take a break within a minimum time before their shift ends.",
  15: "No more than 'n' crew members can work section leader at a time.",
  16: "A crew member cannot have product assignments in half block sizes.",
  17: "A crew member cannot have section leader assignments in half block sizes.",
  18: "A crew member cannot have art assignments in half block sizes.",
  19: "The crew member prefers a balanced distribution between register and product.",
  20: "The crew member prefers to work parking helms during a specific hour.",
  21: "The crew member prefers not to work parking helms during a specific hour.",
  22: "The crew member prefers to work register during a specific hour.",
  23: "The crew member prefers not to work register during a specific hour.",
  24: "The crew member prefers to work product during a specific hour.",
  25: "The crew member prefers not to work product during a specific hour.",
  26: "The crew member prefers to work art during a specific hour.",
  27: "The crew member prefers not to work art during a specific hour.",
  28: "The crew member prefers to work section leader during a specific hour.",
  29: "The crew member prefers not to work section leader during a specific hour.",
  30: "The crew member prefers to take a break during a specific hour.",
  31: "The crew member prefers not to take a break during a specific hour.",
  32: "The crew member prefers to work wine demo during a specific hour.",
  33: "The crew member prefers not to work wine demo during a specific hour.",
  34: "The crew member prefers to work food demo during a specific hour.",
  35: "The crew member prefers not to work food demo during a specific hour.",
  37: "A crew member cannot work section leader during a specific store hour.",
  38: "A crew member cannot work art during a specific store hour.",
  39: "A crew member cannot have food demo assignments in half block sizes."
};

async function main() {
  console.log('Starting to update role rule descriptions...');

  let updated = 0;
  let notFound = 0;

  for (const [roleRuleIdStr, description] of Object.entries(role_rule_descriptions)) {
    const roleRuleId = parseInt(roleRuleIdStr, 10);

    try {
      const result = await prisma.roleRule.update({
        where: { id: roleRuleId },
        data: { description },
      });

      console.log(`✓ Updated role rule ${roleRuleId}: "${description.substring(0, 50)}..."`);
      updated++;
    } catch (error) {
      console.error(`✗ Failed to update role rule ${roleRuleId}:`, error instanceof Error ? error.message : error);
      notFound++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total descriptions: ${Object.keys(role_rule_descriptions).length}`);
  console.log(`Successfully updated: ${updated}`);
  console.log(`Not found/failed: ${notFound}`);

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error('Error running script:', e);
    process.exit(1);
  });
