import { PrismaClient, TaskType } from '@prisma/client';

const prisma = new PrismaClient();

type CrewSeed = {
  id?: string;
  name: string;
  shiftStartMin: number;
  shiftEndMin: number;
  roles: string[];
  prefTask?: string;
  prefTaskWeight?: number;
  consecutiveProdWeight?: number;
  consecutiveRegWeight?: number;
};

function generateCrewId(name: string): string {
  const base = name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `${base}${rand}`.slice(0, 7);
}

const normalizeTask = (value?: string): TaskType | undefined => {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  return Object.values(TaskType).includes(upper as TaskType) ? (upper as TaskType) : undefined;
};

async function addCrew() {
  // Helper to find or create roles
  const getRole = async (code: string) => {
    const role = await prisma.role.findUnique({ where: { code } });
    if (!role) {
      console.log(`⚠️  Role '${code}' not found in database. Please seed roles first.`);
      process.exit(1);
    }
    return role;
  };

  console.log('📋 Adding crew members to store 768...\n');

  const store = await prisma.store.findUnique({ where: { id: 768 } });
  if (!store) {
    console.error('❌ Store 768 not found. Please run seed script first.');
    process.exit(1);
  }

  // Example crew data - modify as needed
  const crewData: CrewSeed[] = [
    {
      id: 'ABP1234',
      name: 'Abigail Perez',
      shiftStartMin: 9 * 60,  // 9:00 AM
      shiftEndMin: 17 * 60,   // 5:00 PM
      roles: ['ORDER_WRITER'],
      prefTask: 'REGISTER',
      prefTaskWeight: 100,
    },
    {
      id: 'OLO5678',
      name: 'Oliver Ostojic',
      shiftStartMin: 8 * 60,  // 8:00 AM
      shiftEndMin: 16 * 60,   // 4:00 PM
      roles: ['DEMO'],
      prefTask: 'PRODUCT',
      prefTaskWeight: 100,
    },
    {
      id: 'SAR2468',
      name: 'Sarah Johnson',
      shiftStartMin: 10 * 60,  // 10:00 AM
      shiftEndMin: 18 * 60,    // 6:00 PM
      roles: [],
      prefTask: 'PRODUCT',
      prefTaskWeight: 80,
      consecutiveProdWeight: 50,
    },
    {
      id: 'MIC1357',
      name: 'Mike Chen',
      shiftStartMin: 7 * 60,   // 7:00 AM
      shiftEndMin: 15 * 60,    // 3:00 PM
      roles: [],
      prefTask: 'REGISTER',
      prefTaskWeight: 90,
      consecutiveRegWeight: 40,
    },
  ];

  for (const data of crewData) {
    const { roles: roleCodes, id: providedId, prefTask: rawPrefTask, ...crewFields } = data;
    
    // Get role IDs
    const roleIds = [];
    for (const code of roleCodes) {
      const role = await getRole(code);
      roleIds.push(role.id);
    }

    try {
      const crew = await prisma.crewMember.create({
        data: {
          id: providedId ?? generateCrewId(crewFields.name),
          ...crewFields,
          prefTask: normalizeTask(rawPrefTask),
          storeId: store.id,
          roles: {
            create: roleIds.map(roleId => ({ roleId })),
          },
        },
        include: {
          roles: {
            include: { role: true },
          },
        },
      });

      console.log(`✅ ${crew.name} (ID: ${crew.id})`);
      console.log(`   Shift: ${(crew.shiftStartMin / 60).toFixed(0)}:00 - ${(crew.shiftEndMin / 60).toFixed(0)}:00`);
      if (crew.roles.length > 0) {
  console.log(`   Roles: ${crew.roles.map(r => r.role.name).join(', ')}`);
      }
      if (crew.prefTask) {
        console.log(`   Preference: ${crew.prefTask} (weight: ${crew.prefTaskWeight})`);
      }
      console.log('');
    } catch (e: any) {
      console.error(`❌ Failed to add ${data.name}:`, e.message);
    }
  }

  console.log('✅ Crew population completed!');
}

addCrew()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
