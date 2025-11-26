import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient();

interface CrewJsonRecord {
  id: string;
  name: string;
  storeId: number;
}

interface CrewJsonFile {
  crews?: CrewJsonRecord[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_JSON_PATH = path.resolve(__dirname, '../../../crew_roles_export.json');

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0) throw new Error('chunk size must be positive');
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const getJsonPathFromArgs = (): string => {
  const fileArg = process.argv.find((arg) => arg.startsWith('--file='));
  if (!fileArg) return DEFAULT_JSON_PATH;
  const [, filePath] = fileArg.split('=');
  if (!filePath) {
    throw new Error('--file argument provided without a path');
  }
  return path.resolve(process.cwd(), filePath);
};

async function loadCrewRecords(jsonPath: string): Promise<CrewJsonRecord[]> {
  const raw = await readFile(jsonPath, 'utf-8');
  const parsed = JSON.parse(raw) as CrewJsonFile;
  if (!Array.isArray(parsed.crews)) {
    throw new Error(`No "crews" array found in ${jsonPath}`);
  }

  const records = parsed.crews
    .map((crew) => ({
      id: crew.id?.trim(),
      name: crew.name?.trim(),
      storeId: crew.storeId,
    }))
    .filter((crew): crew is CrewJsonRecord => Boolean(crew.id && crew.name && crew.storeId));

  if (records.length === 0) {
    throw new Error(`"crews" array in ${jsonPath} did not contain usable entries`);
  }

  return records;
}

async function ensureStoresExist(storeIds: number[]): Promise<void> {
  const missing: number[] = [];
  for (const storeId of storeIds) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      missing.push(storeId);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing stores in database: ${missing.join(', ')}`);
  }
}

async function main() {
  const jsonPath = getJsonPathFromArgs();
  console.log(`Importing crews from ${jsonPath}`);

  const crewRecords = await loadCrewRecords(jsonPath);
  const uniqueStoreIds = [...new Set(crewRecords.map((crew) => crew.storeId))];
  await ensureStoresExist(uniqueStoreIds);

  let processed = 0;
  const chunks = chunkArray(crewRecords, 25);

  for (const chunk of chunks) {
    await prisma.$transaction(
      chunk.map((crew) =>
        prisma.crew.upsert({
          where: { id: crew.id },
          update: {
            name: crew.name,
            storeId: crew.storeId,
          },
          create: {
            id: crew.id,
            name: crew.name,
            storeId: crew.storeId,
          },
        }),
      ),
    );

    processed += chunk.length;
    console.log(`Processed ${processed}/${crewRecords.length}`);
  }

  console.log(`Successfully imported ${crewRecords.length} crew records.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
