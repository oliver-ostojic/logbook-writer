import { PrismaClient, AssignmentModel } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient();

interface RoleJsonRecord {
  id: number;
  storeId: number;
  code: string;
  displayName: string;
  isConsecutive?: boolean;
  minContinuousSlots?: number | null;
  maxContinuousSlots?: number | null;
  assignmentStrategy?: string; // maps to AssignmentModel enum
}

interface RoleJsonFile {
  roles?: RoleJsonRecord[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_JSON_PATH = path.resolve(__dirname, '../../../crew_roles_export.json');

const getJsonPathFromArgs = (): string => {
  const fileArg = process.argv.find((arg) => arg.startsWith('--file='));
  if (!fileArg) return DEFAULT_JSON_PATH;
  const [, filePath] = fileArg.split('=');
  if (!filePath) throw new Error('--file argument provided without a path');
  return path.resolve(process.cwd(), filePath);
};

async function loadRoleRecords(jsonPath: string): Promise<RoleJsonRecord[]> {
  const raw = await readFile(jsonPath, 'utf-8');
  let parsed: RoleJsonFile;
  try {
    parsed = JSON.parse(raw) as RoleJsonFile;
  } catch (err) {
    throw new Error(`Failed to parse JSON at ${jsonPath}: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed.roles)) {
    throw new Error(`No "roles" array found in ${jsonPath}`);
  }
  return parsed.roles.filter(r => r && r.code && r.displayName && typeof r.storeId === 'number');
}

function toAssignmentModel(value?: string): AssignmentModel {
  const key = (value || 'UNIVERSAL').toUpperCase();
  if (Object.values(AssignmentModel).includes(key as AssignmentModel)) {
    return key as AssignmentModel;
  }
  return AssignmentModel.UNIVERSAL;
}

async function ensureStoresExist(storeIds: number[]): Promise<void> {
  const missing: number[] = [];
  for (const storeId of storeIds) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) missing.push(storeId);
  }
  if (missing.length) {
    throw new Error(`Missing stores for role import: ${missing.join(', ')}`);
  }
}

async function main() {
  const jsonPath = getJsonPathFromArgs();
  console.log(`Importing roles from ${jsonPath}`);

  const roleRecords = await loadRoleRecords(jsonPath);
  if (!roleRecords.length) {
    console.log('No roles to import.');
    return;
  }
  const uniqueStoreIds = [...new Set(roleRecords.map(r => r.storeId))];
  await ensureStoresExist(uniqueStoreIds);

  let processed = 0;
  for (const role of roleRecords) {
    const minSlots = role.minContinuousSlots ?? 1;
    const maxSlots = role.maxContinuousSlots ?? minSlots;
    const assignmentModel = toAssignmentModel(role.assignmentStrategy);
    try {
      await prisma.role.upsert({
        where: { code: role.code },
        update: {
          displayName: role.displayName,
          storeId: role.storeId,
          assignmentModel,
          slotsMustBeConsecutive: !!role.isConsecutive,
          minSlots,
          maxSlots,
        },
        create: {
          id: role.id, // maintain legacy id if available
          displayName: role.displayName,
          code: role.code,
          storeId: role.storeId,
          assignmentModel,
          slotsMustBeConsecutive: !!role.isConsecutive,
          minSlots,
          maxSlots,
        },
      });
      processed++;
    } catch (err) {
      console.error(`Failed upsert for role code=${role.code}: ${(err as Error).message}`);
    }
  }

  console.log(`Successfully processed ${processed}/${roleRecords.length} roles.`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
