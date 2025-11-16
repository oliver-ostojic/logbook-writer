import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const names = [
  'Aaron Haverstock',
  'Adam Carey',
  'Adam Levi',
  'Adrian Pena',
  'Alexa Adams',
  'Alice De Simoni',
  'Andrea Canizares',
  'Ashley Andrejko',
  'Ben Stogis',
  'Carissa Butz',
  'Carolyn Shephard',
  'Carter Greenwood',
  'Chase Watts',
  'Cheri Reimann',
  'Cianna Sala',
  'Daniel Leon',
  'Denis Madrid',
  'Di Cannon',
  'Elder De Leon',
  'Emma Boles',
  'Fiona Coffey',
  'Gabby Tejada',
  'Gary Tejada',
  'Hannah Reshel',
  'Jill Sachs',
  'Juan Caceres',
  'Kacey Nakasen',
  'Kameron Hunter',
  'Kayla Girouard',
  'Kelly Mayo',
  'Kenny Brooke',
  'Khadijah Robbins',
  'Kristalie Medina',
  'Leo Kelly',
  'Leonardo Saenz-Marmol',
  'Lindsey Wellington',
  'Marcela Soto',
  'Marcos Reinoso',
  'Maricel Cabal',
  'Matt Connor',
  'Matthew Studebaker',
  'Morgan Bussius',
  'Nikki Lera',
  'Nine Payne',
  'Ofelia Aguirre',
  'Patricia Edgar',
  'Q Mowatt',
  'Rachel Haverstock',
  'Reece Lohrey',
  'Ruth Charles',
  'Randy Guardado',
  'Sammantha Buckley',
  'Sammi Martinez',
  'Savannah Fraijo',
  'Sharon Garcia',
  'Shushan Royer',
  'Stephanie Mitchell',
  'Talye DeMaio',
  'Mati Mayea Ortiz',
  'Taylor Yackulics',
  'Tori Borrowdale',
  'Vaughn Diana',
  'Wade Davis',
  'Yeffer Arestigueta',
];

function generateId(): string {
  const randomDigits = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `128${randomDigits}`;
}

async function main() {
  console.log('Seeding crew members...');
  
  const usedIds = new Set<string>();
  
  for (const name of names) {
    let id = generateId();
    // Ensure unique ID
    while (usedIds.has(id)) {
      id = generateId();
    }
    usedIds.add(id);
    
    try {
      const crew = await prisma.crewMember.create({
        data: {
          id,
          name,
          blockSize: 60,
        },
      });
      console.log(`✓ Created: ${crew.name} (${crew.id})`);
    } catch (error: any) {
      console.error(`✗ Failed to create ${name}:`, error.message);
    }
  }
  
  console.log('\nSeeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
