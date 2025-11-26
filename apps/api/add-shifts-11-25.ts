import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ShiftData {
  name: string;
  startTime: string;
  endTime: string;
}

// Map ambiguous names to exact crew full names for unique matching
const NAME_OVERRIDES: Record<string, string> = {
  'Roger Gomez': 'Roger Gomez',
  'Smith': 'Smith Jean Jacques',
  'Andre': 'Andre Chance',
  'Abby': 'Abby Stapleton',
  'Adam Levi': 'Adam Levi',
  'Carter': 'Carter Greenwood',
  'Kelly': 'Kelly Mayo',
  'Di': 'Di Cannon',
  'Luki': 'Luki Ahmad',
};

// Use exactly the names provided by the user; do NOT invent or alter names.
const SHIFTS_11_25: ShiftData[] = [
  // 5am - 1pm
  { name: 'Cheri Reimann', startTime: '5:00', endTime: '13:00' },
  { name: 'Dan Smith', startTime: '5:00', endTime: '13:00' },
  { name: 'Denise Madrid', startTime: '5:00', endTime: '13:00' },
  { name: 'Elder De Leon', startTime: '5:00', endTime: '13:00' },
  { name: 'Gary', startTime: '5:00', endTime: '13:00' },
  { name: 'Juan', startTime: '5:00', endTime: '13:00' },
  { name: 'Kenny', startTime: '5:00', endTime: '13:00' },
  { name: 'Maricel', startTime: '5:00', endTime: '13:00' },
  { name: 'Matt Connor', startTime: '5:00', endTime: '13:00' },
  { name: 'Rachel Haverstock', startTime: '5:00', endTime: '13:00' },
  { name: 'Savannah', startTime: '5:00', endTime: '13:00' },
  { name: 'Tracy', startTime: '5:00', endTime: '13:00' },
  { name: 'Xander', startTime: '5:00', endTime: '13:00' },
  
  // 6am - 2pm
  { name: 'Alice', startTime: '6:00', endTime: '14:00' },
  { name: 'Alyssa', startTime: '6:00', endTime: '14:00' },
  { name: 'Carolyn', startTime: '6:00', endTime: '14:00' },
  { name: 'Esteban', startTime: '6:00', endTime: '14:00' },
  { name: 'Justin', startTime: '6:00', endTime: '14:00' },
  { name: 'Marcela', startTime: '6:00', endTime: '14:00' },
  { name: 'Nigel', startTime: '6:00', endTime: '14:00' },
  { name: 'Roger Gomez', startTime: '6:00', endTime: '14:00' },
  { name: 'Smith', startTime: '6:00', endTime: '14:00' },
  { name: 'Thalia', startTime: '6:00', endTime: '14:00' },
  
  // 10am - 6pm
  { name: 'Ashley', startTime: '10:00', endTime: '18:00' },
  { name: 'Crystal', startTime: '10:00', endTime: '18:00' },
  { name: 'Garet', startTime: '10:00', endTime: '18:00' },
  { name: 'Kacey', startTime: '10:00', endTime: '18:00' },
  { name: 'Kayla', startTime: '10:00', endTime: '18:00' },
  { name: 'Kaylyn', startTime: '10:00', endTime: '18:00' },
  { name: 'Lesley', startTime: '10:00', endTime: '18:00' },
  { name: 'Wade', startTime: '10:00', endTime: '18:00' },
  
  // 11am - 7pm
  { name: 'Alexa', startTime: '11:00', endTime: '19:00' },
  { name: 'Andre', startTime: '11:00', endTime: '19:00' },
  { name: 'Sharon Garcia', startTime: '11:00', endTime: '19:00' },
  { name: 'Talye', startTime: '11:00', endTime: '19:00' },
  
  // 12pm - 8pm
  { name: 'Marcos', startTime: '12:00', endTime: '20:00' },
  { name: 'Nine', startTime: '12:00', endTime: '20:00' },
  { name: 'Shushan', startTime: '12:00', endTime: '20:00' },
  { name: 'Taylor', startTime: '12:00', endTime: '20:00' },
  { name: 'Stephanie Meyer', startTime: '12:00', endTime: '20:00' },
  
  // 12pm - 7pm
  { name: 'Ruth', startTime: '12:00', endTime: '19:00' },
  
  // 2pm - 10pm
  { name: 'Abby', startTime: '14:00', endTime: '22:00' },
  { name: 'Adam Carey', startTime: '14:00', endTime: '22:00' },
  { name: 'Adam Levi', startTime: '14:00', endTime: '22:00' },
  { name: 'Carter', startTime: '14:00', endTime: '22:00' },
  { name: 'Daniel', startTime: '14:00', endTime: '22:00' },
  { name: 'David', startTime: '14:00', endTime: '22:00' },
  { name: 'Emma', startTime: '14:00', endTime: '22:00' },
  { name: 'Fiona', startTime: '14:00', endTime: '22:00' },
  { name: 'Gabby', startTime: '14:00', endTime: '22:00' },
  { name: 'Gabriella', startTime: '14:00', endTime: '22:00' },
  { name: 'Kelly', startTime: '14:00', endTime: '22:00' },
  { name: 'Kevin', startTime: '14:00', endTime: '22:00' },
  { name: 'Luki', startTime: '14:00', endTime: '22:00' },
  { name: 'Matthew Studebaker', startTime: '14:00', endTime: '22:00' },
  { name: 'Mily', startTime: '14:00', endTime: '22:00' },
  { name: 'Ofelia', startTime: '14:00', endTime: '22:00' },
  { name: 'Oliver', startTime: '14:00', endTime: '22:00' },
  { name: 'Randy', startTime: '14:00', endTime: '22:00' },
  { name: 'Stephanie Mitchell', startTime: '14:00', endTime: '22:00' },
  { name: 'Tati', startTime: '14:00', endTime: '22:00' },
  { name: 'Tori', startTime: '14:00', endTime: '22:00' },
  { name: 'Yeffer', startTime: '14:00', endTime: '22:00' },
  
  // 2:30pm - 10pm
  { name: 'Di', startTime: '14:30', endTime: '22:00' },
  
  // 3pm - 10pm
  { name: 'Jodie', startTime: '15:00', endTime: '22:00' },
];

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

async function main() {
  const shiftDate = new Date('2025-11-25');
  const storeId = 768;
  
  console.log(`\n🔍 Adding shifts for ${shiftDate.toISOString().split('T')[0]}...`);
  console.log(`   Store: ${storeId}`);
  console.log(`   Total shifts to add: ${SHIFTS_11_25.length}\n`);
  
  // For each provided name, try to find a unique crew match using a contains search (case-insensitive)
  
  let created = 0;
  let notFound: string[] = [];
  
  for (const shiftData of SHIFTS_11_25) {
    // Check if we have an explicit override for this name
    const lookupName = NAME_OVERRIDES[shiftData.name] || shiftData.name;
    
    const matches = await prisma.crew.findMany({
      where: {
        storeId,
        name: { contains: lookupName, mode: 'insensitive' }
      },
      select: { id: true, name: true }
    });
    const crew = matches.length === 1 ? matches[0] : null;
    
    if (!crew) {
      // If multiple matches, list them to help disambiguate; if none, report missing
      if (matches.length > 1) {
        notFound.push(`${shiftData.name} (ambiguous: ${matches.map(m => m.name).join(', ')})`);
      } else {
        notFound.push(shiftData.name);
      }
      continue;
    }
    
    const shiftStartMin = timeToMinutes(shiftData.startTime);
    const shiftEndMin = timeToMinutes(shiftData.endTime);
    
      await prisma.$executeRaw`
        INSERT INTO "Shift" ("crewId", "storeId", "date", "startMin", "endMin", "updatedAt")
        VALUES (${crew.id}, ${storeId}, ${shiftDate}, ${shiftStartMin}, ${shiftEndMin}, NOW())
        ON CONFLICT ("storeId", "crewId", date) DO UPDATE
          SET "startMin" = EXCLUDED."startMin",
              "endMin" = EXCLUDED."endMin",
              "updatedAt" = NOW()
      `;
    
    created++;
  }
  
  console.log(`\n✅ Created ${created} shifts`);
  
  if (notFound.length > 0) {
    console.log(`\n⚠️  Could not find ${notFound.length} crew members in database:`);
    notFound.forEach(name => console.log(`   - ${name}`));
  }
  
  console.log('\n✅ Done!\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
