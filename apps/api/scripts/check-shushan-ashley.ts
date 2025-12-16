import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Get their crew IDs for store 768
  const crew = await prisma.crew.findMany({
    where: {
      name: { in: ["Shushan Royer", "Ashley Andrejko"] },
      storeId: 768
    }
  });
  
  console.log("=== CREW ===");
  console.log(crew.map(c => ({ id: c.id, name: c.name })));
  
  const crewIds = crew.map(c => c.id);
  
  // Get their CrewRoleRules
  const rules = await prisma.crewRoleRule.findMany({
    where: { crewId: { in: crewIds } },
    include: { 
      RoleRule: { include: { Role: true, TargetRole: true } },
      Crew: { select: { name: true } }
    }
  });
  
  console.log("\n=== THEIR CREW ROLE RULES ===");
  for (const r of rules) {
    const target = r.RoleRule.TargetRole ? ` -> ${r.RoleRule.TargetRole.code}` : "";
    console.log(`${r.Crew.name} | Rule ${r.roleRuleId} (${r.RoleRule.type}) for ${r.RoleRule.Role.code}${target} | valueInt: ${r.valueInt} | constraintType: ${r.RoleRule.constraintType}`);
  }
  
  // Get latest logbook
  const logbook = await prisma.logbook.findFirst({
    where: { storeId: 768 },
    orderBy: { createdAt: "desc" }
  });
  
  if (!logbook) {
    console.log("\nNo logbook found");
    return;
  }
  
  console.log(`\n=== LATEST LOGBOOK: ${logbook.date} ===`);
  
  // Get their assignments
  const assignments = await prisma.assignment.findMany({
    where: {
      logbookId: logbook.id,
      crewId: { in: crewIds }
    },
    include: { Role: true, Crew: { select: { name: true } } },
    orderBy: [{ crewId: "asc" }, { startTime: "asc" }]
  });
  
  console.log("\n=== THEIR ASSIGNMENTS ===");
  let currentCrew = "";
  for (const a of assignments) {
    if (a.Crew.name !== currentCrew) {
      currentCrew = a.Crew.name;
      console.log(`\n${currentCrew}:`);
    }
    const start = new Date(a.startTime);
    const end = new Date(a.endTime);
    const duration = (end.getTime() - start.getTime()) / 60000;
    const startStr = start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    const endStr = end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    console.log(`  ${a.Role.code}: ${startStr} - ${endStr} (${duration} min)`);
  }
  
  // Summarize by role
  console.log("\n=== SUMMARY BY ROLE ===");
  const summary: Record<string, Record<string, number>> = {};
  for (const a of assignments) {
    const name = a.Crew.name;
    const role = a.Role.code;
    const duration = (new Date(a.endTime).getTime() - new Date(a.startTime).getTime()) / 60000;
    if (!summary[name]) summary[name] = {};
    summary[name][role] = (summary[name][role] || 0) + duration;
  }
  
  for (const [name, roles] of Object.entries(summary)) {
    console.log(`\n${name}:`);
    const total = Object.values(roles).reduce((a, b) => a + b, 0);
    for (const [role, mins] of Object.entries(roles)) {
      const pct = ((mins / total) * 100).toFixed(1);
      console.log(`  ${role}: ${mins} min (${pct}%)`);
    }
  }
  
  // Check what the solver input looked like
  console.log("\n=== ANALYSIS ===");
  console.log("Expected behavior based on their rules:");
  console.log("  - RoleRule 6 (MAX_CONSECUTIVE_MINUTES REG): valueInt=180 means they prefer up to 3hr REG blocks");
  console.log("  - RoleRule 19 (DISTRIBUTION REG->PROD): valueInt=1 means they prefer REG over PROD");
  console.log("\nIf they're not getting more REG:");
  console.log("  1. Check if DISTRIBUTION_BETWEEN_ROLE_X is implemented in solver");
  console.log("  2. Check if the reward is high enough");
  console.log("  3. Check if there's enough REG coverage windows for them");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
