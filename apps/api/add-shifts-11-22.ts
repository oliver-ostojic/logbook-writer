/**
 * Add real shift data for 2025-11-22
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ShiftData {
  name: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
}

const shifts: ShiftData[] = [
  // 5 am - 12 pm
  { name: 'Aaron', startHour: 5, startMin: 0, endHour: 12, endMin: 0 },
  
  // 5 am - 1 pm
  { name: 'Adam Carey', startHour: 5, startMin: 0, endHour: 13, endMin: 0 },
  { name: 'Adrian', startHour: 5, startMin: 0, endHour: 13, endMin: 0 },
  { name: 'Alice', startHour: 5, startMin: 0, endHour: 13, endMin: 0 },
  { name: 'Elder', startHour: 5, startMin: 0, endHour: 13, endMin: 0 },
  { name: 'Gary', startHour: 5, startMin: 0, endHour: 13, endMin: 0 },
  { name: 'Juan', startHour: 5, startMin: 0, endHour: 13, endMin: 0 },
  { name: 'Marcela', startHour: 5, startMin: 0, endHour: 13, endMin: 0 },
  { name: 'Maricel', startHour: 5, startMin: 0, endHour: 13, endMin: 0 },
  { name: 'Matt Connor', startHour: 5, startMin: 0, endHour: 13, endMin: 0 },
  { name: 'Patricia', startHour: 5, startMin: 0, endHour: 13, endMin: 0 },
  
  // 5 am - 10 am
  { name: 'Cianna', startHour: 5, startMin: 0, endHour: 10, endMin: 0 },
  
  // 5 am - 11 am
  { name: 'Kenny', startHour: 5, startMin: 0, endHour: 11, endMin: 0 },
  
  // 6 am - 2 pm
  { name: 'Ben', startHour: 6, startMin: 0, endHour: 14, endMin: 0 },
  { name: 'Carolyn', startHour: 6, startMin: 0, endHour: 14, endMin: 0 },
  { name: 'Chase', startHour: 6, startMin: 0, endHour: 14, endMin: 0 },
  { name: 'Cheri', startHour: 6, startMin: 0, endHour: 14, endMin: 0 },
  { name: 'Fiona', startHour: 6, startMin: 0, endHour: 14, endMin: 0 },
  { name: 'Hannah', startHour: 6, startMin: 0, endHour: 14, endMin: 0 },
  { name: 'Khadijah', startHour: 6, startMin: 0, endHour: 14, endMin: 0 },
  { name: 'Lindsey', startHour: 6, startMin: 0, endHour: 14, endMin: 0 },
  { name: 'Q', startHour: 6, startMin: 0, endHour: 14, endMin: 0 },
  { name: 'Sharon Garcia', startHour: 6, startMin: 0, endHour: 14, endMin: 0 },
  
  // 8 am - 4 pm
  { name: 'Ashley', startHour: 8, startMin: 0, endHour: 16, endMin: 0 },
  
  // 9 am - 5 pm
  { name: 'Leo Kelly', startHour: 9, startMin: 0, endHour: 17, endMin: 0 },
  { name: 'Marcos', startHour: 9, startMin: 0, endHour: 17, endMin: 0 },
  
  // 10 am - 6 pm
  { name: 'Carissa', startHour: 10, startMin: 0, endHour: 18, endMin: 0 },
  { name: 'Kacey', startHour: 10, startMin: 0, endHour: 18, endMin: 0 },
  { name: 'Sammi', startHour: 10, startMin: 0, endHour: 18, endMin: 0 },
  { name: 'Shushan', startHour: 10, startMin: 0, endHour: 18, endMin: 0 },
  
  // 10 am - 4 pm
  { name: 'Ruth', startHour: 10, startMin: 0, endHour: 16, endMin: 0 },
  
  // 11 am - 7 pm
  { name: 'Denise', startHour: 11, startMin: 0, endHour: 19, endMin: 0 },
  { name: 'Jill', startHour: 11, startMin: 0, endHour: 19, endMin: 0 },
  { name: 'Reece', startHour: 11, startMin: 0, endHour: 19, endMin: 0 },
  { name: 'Talye', startHour: 11, startMin: 0, endHour: 19, endMin: 0 },
  
  // 12 pm - 8 pm
  { name: 'Emma', startHour: 12, startMin: 0, endHour: 20, endMin: 0 },
  { name: 'Leonardo', startHour: 12, startMin: 0, endHour: 20, endMin: 0 },
  { name: 'Matthew Studebaker', startHour: 12, startMin: 0, endHour: 20, endMin: 0 },
  { name: 'Rachel', startHour: 12, startMin: 0, endHour: 20, endMin: 0 },
  { name: 'Randy', startHour: 12, startMin: 0, endHour: 20, endMin: 0 },
  
  // 1 pm - 9 pm
  { name: 'Andrea', startHour: 13, startMin: 0, endHour: 21, endMin: 0 },
  { name: 'Gabby', startHour: 13, startMin: 0, endHour: 21, endMin: 0 },
  { name: 'Kelly', startHour: 13, startMin: 0, endHour: 21, endMin: 0 },
  { name: 'Tori', startHour: 13, startMin: 0, endHour: 21, endMin: 0 },
  { name: 'Yeffer', startHour: 13, startMin: 0, endHour: 21, endMin: 0 },
  
  // 2 pm - 10 pm
  { name: 'Adam', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Alexa', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Carter', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Daniel', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Kayla', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Morgan', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Nikki', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Nine', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Ofelia', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Oliver', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Samantha', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Savannah', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Stephanie Mitchell', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Tati', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Taylor', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Vaughn', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Wade', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
  { name: 'Di', startHour: 14, startMin: 0, endHour: 22, endMin: 0 },
];

async function main() {
  const testDate = new Date('2025-11-22');
  const storeId = 768;

  console.log('📅 Adding shifts for 11/22/25');
  console.log(`📊 Total shifts to add: ${shifts.length}\n`);

  let created = 0;
  let errors = 0;
  let notFound: string[] = [];

  for (const shift of shifts) {
    try {
      // Find crew by name
      const crew = await prisma.crew.findFirst({
        where: {
          storeId,
          name: {
            contains: shift.name,
            mode: 'insensitive',
          },
        },
      });

      if (!crew) {
        notFound.push(shift.name);
        continue;
      }

      // Convert hours to minutes from midnight
      const startMin = shift.startHour * 60 + shift.startMin;
      const endMin = shift.endHour * 60 + shift.endMin;

      await prisma.shift.create({
        data: {
          date: testDate,
          crewId: crew.id,
          storeId,
          startMin,
          endMin,
        },
      });

      created++;
      console.log(`✅ ${crew.name}: ${shift.startHour}:${shift.startMin.toString().padStart(2, '0')} - ${shift.endHour}:${shift.endMin.toString().padStart(2, '0')}`);
    } catch (error: any) {
      if (error.code === 'P2002') {
        console.log(`⚠️  Shift already exists for ${shift.name}`);
      } else {
        console.error(`❌ Error creating shift for ${shift.name}:`, error.message);
        errors++;
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Created: ${created}`);
  console.log(`   ❌ Errors: ${errors}`);
  
  if (notFound.length > 0) {
    console.log(`   ⚠️  Crew not found (${notFound.length}):`);
    notFound.forEach(name => console.log(`      - ${name}`));
  }

  // Verify
  const totalShifts = await prisma.shift.count({
    where: {
      storeId,
      date: testDate,
    },
  });

  console.log(`\n✅ Total shifts in database for 11/22/25: ${totalShifts}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
