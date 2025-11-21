/**
 * Assign specific roles to crew members
 * 
 * Roles to assign:
 * - DEMO: Denise, Di, Drea, Tori
 * - ORDER_WRITER: Luki (Frozen), Kelly (HABA), Ashley (HABA), Ashley (Coffee/Tea), 
 *                 Ofelia (HABA), Denise (Grocery), Matthew (Beverage), Morgan (DFN), Vaughn (Frozen)
 * - ART_TEAM: Abby (Signs), Andrea (Decor), Nikki (Decor), Alexa (Decor)
 * - WINE_DEMO: Kacey, Alice
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RoleAssignment {
  crewName: string;
  roleName: string;
  info?: string; // Optional detail/variant for the role
}

// Define all role assignments
const roleAssignments: RoleAssignment[] = [
  // DEMO roles (info optional)
  { crewName: 'Denise Madrid', roleName: 'DEMO' },
  { crewName: 'Di Cannon', roleName: 'DEMO' },
  { crewName: 'Andrea Canizares', roleName: 'DEMO' }, // "Drea"
  { crewName: 'Tori Borrowdale', roleName: 'DEMO' },

  // ORDER_WRITER roles (with info/detail)
  // Note: Luki not found in database - skipping
  { crewName: 'Kelly Mayo', roleName: 'ORDER_WRITER', info: 'HABA' },
  { crewName: 'Ashley Andrejko', roleName: 'ORDER_WRITER', info: 'HABA' },
  { crewName: 'Ashley Andrejko', roleName: 'ORDER_WRITER', info: 'Coffee/Tea' },
  { crewName: 'Ofelia Aguirre', roleName: 'ORDER_WRITER', info: 'HABA' },
  { crewName: 'Denise Madrid', roleName: 'ORDER_WRITER', info: 'Grocery' },
  { crewName: 'Matthew Studebaker', roleName: 'ORDER_WRITER', info: 'Beverage' },
  { crewName: 'Morgan Bussius', roleName: 'ORDER_WRITER', info: 'DFN' },
  { crewName: 'Vaughn Diana', roleName: 'ORDER_WRITER', info: 'Frozen' },

  // ART roles (with info/detail)
  // Note: Abby not found in database - skipping (matched Gabby incorrectly)
  { crewName: 'Andrea Canizares', roleName: 'ART', info: 'Decor' },
  { crewName: 'Nikki Lera', roleName: 'ART', info: 'Decor' },
  { crewName: 'Alexa Adams', roleName: 'ART', info: 'Decor' },

  // WINE_DEMO roles (info optional)
  { crewName: 'Kacey Nakasen', roleName: 'WINE_DEMO' },
  { crewName: 'Alice De Simoni', roleName: 'WINE_DEMO' },
];

async function main() {
  console.log('Assigning roles to crew members...\n');

  // First, ensure all roles exist
  const roleNames = ['DEMO', 'ORDER_WRITER', 'ART', 'WINE_DEMO'];
  const roles = await prisma.role.findMany({
    where: { name: { in: roleNames } },
  });

  const existingRoleNames = roles.map(r => r.name);
  const missingRoles = roleNames.filter(name => !existingRoleNames.includes(name));

  if (missingRoles.length > 0) {
    console.log(`⚠️  Creating missing roles: ${missingRoles.join(', ')}\n`);
    for (const roleName of missingRoles) {
      const assignmentMode = (roleName === 'DEMO' || roleName === 'WINE_DEMO') 
        ? 'TEAM_WINDOW' 
        : 'INDIVIDUAL_HOURS';
      const isConsecutive = (roleName === 'ORDER_WRITER' || roleName === 'ART');
      
      await prisma.role.create({
        data: {
          name: roleName,
          assignmentMode,
          isConsecutive,
        },
      });
      console.log(`  ✓ Created role: ${roleName}`);
    }
    console.log();
  }

  // Reload roles after potential creation
  const allRoles = await prisma.role.findMany({
    where: { name: { in: roleNames } },
  });
  const roleMap = new Map(allRoles.map(r => [r.name, r]));

  // Process each assignment
  let successCount = 0;
  let errorCount = 0;

  for (const assignment of roleAssignments) {
    const { crewName, roleName, info } = assignment;

    // Find crew member (partial name match)
    const crew = await prisma.crewMember.findFirst({
      where: {
        name: {
          contains: crewName,
          mode: 'insensitive',
        },
      },
    });

    if (!crew) {
      console.error(`✗ Crew not found: ${crewName}`);
      errorCount++;
      continue;
    }

    const role = roleMap.get(roleName);
    if (!role) {
      console.error(`✗ Role not found: ${roleName}`);
      errorCount++;
      continue;
    }

    try {
      // Check if this crew-role combination already exists
      const existing = await prisma.crewMemberRole.findUnique({
        where: {
          crewMemberId_roleId: {
            crewMemberId: crew.id,
            roleId: role.id,
          },
        },
      }) as any; // Type assertion needed due to Prisma client cache

      if (existing) {
        // Update info if it's different
        if (info && existing.info !== info) {
          await prisma.crewMemberRole.update({
            where: {
              crewMemberId_roleId: {
                crewMemberId: crew.id,
                roleId: role.id,
              },
            },
            data: { info } as any,
          });
          console.log(`  ↻ Updated: ${crew.name} → ${roleName} (${info})`);
        } else {
          console.log(`  ⊙ Already assigned: ${crew.name} → ${roleName}${info ? ` (${info})` : ''}`);
        }
        successCount++;
      } else {
        await prisma.crewMemberRole.create({
          data: {
            crewMemberId: crew.id,
            roleId: role.id,
            info: info || null,
          } as any,
        });
        console.log(`  ✓ Assigned: ${crew.name} → ${roleName}${info ? ` (${info})` : ''}`);
        successCount++;
      }

    } catch (error: any) {
      console.error(`✗ Failed to assign ${roleName} to ${crew.name}:`, error.message);
      errorCount++;
    }
  }

  console.log(`\n✓ Complete! ${successCount} successful, ${errorCount} errors.`);
  
  if (errorCount === 0) {
    console.log('\nSummary by role:');
    const summary = await prisma.crewMemberRole.findMany({
      where: {
        role: {
          name: { in: roleNames },
        },
      },
      include: {
        crewMember: true,
        role: true,
      },
    });

    const byRole = new Map<string, string[]>();
    summary.forEach(cmr => {
      const roleName = cmr.role.name;
      if (!byRole.has(roleName)) {
        byRole.set(roleName, []);
      }
      byRole.get(roleName)!.push(cmr.crewMember.name);
    });

    byRole.forEach((crew, role) => {
      console.log(`  ${role}: ${crew.length} crew members`);
      crew.forEach(name => console.log(`    - ${name}`));
    });
  }
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
