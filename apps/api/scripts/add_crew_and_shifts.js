const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const crewData = [
  { name: "Cheri Reimann", start: "05:00", end: "13:00" },
  { name: "Dan Smith", start: "05:00", end: "13:00" },
  { name: "Denise Madrid", start: "05:00", end: "13:00" },
  { name: "Elder De Leon", start: "05:00", end: "13:00" },
  { name: "Gary Medina", start: "05:00", end: "13:00" },
  { name: "Juan Caceres", start: "05:00", end: "13:00" },
  { name: "Kenny Brooke", start: "05:00", end: "13:00" },
  { name: "Maricel Cabal", start: "05:00", end: "13:00" },
  { name: "Matt Connor", start: "05:00", end: "13:00" },
  { name: "Rachel Haverstock", start: "05:00", end: "13:00" },
  { name: "Savannah Fraijo", start: "05:00", end: "13:00" },
  { name: "Tracy Hopkins", start: "05:00", end: "13:00" },
  { name: "Xander Faber", start: "05:00", end: "13:00" },
  { name: "Alice De Simoni", start: "06:00", end: "14:00" },
  { name: "Alyssa Jenkins", start: "06:00", end: "14:00" },
  { name: "Carolyn Shephard", start: "06:00", end: "14:00" },
  { name: "Esteban Espinosa", start: "06:00", end: "14:00" },
  { name: "Justin Bennett", start: "06:00", end: "14:00" },
  { name: "Marcela Soto", start: "06:00", end: "14:00" },
  { name: "Nigel Pitts", start: "06:00", end: "14:00" },
  { name: "Roger Gomez", start: "06:00", end: "14:00" },
  { name: "Smith Jean Jacques", start: "06:00", end: "14:00" },
  { name: "Thalia Brauner", start: "06:00", end: "14:00" },
  { name: "Ashley Andrejko", start: "10:00", end: "18:00" },
  { name: "Crystal Rosa", start: "10:00", end: "18:00" },
  { name: "Garet Reimann", start: "10:00", end: "18:00" },
  { name: "Kacey Nakasen", start: "10:00", end: "18:00" },
  { name: "Kayla Girouard", start: "10:00", end: "18:00" },
  { name: "Kaylyn Pipitone", start: "10:00", end: "18:00" },
  { name: "Lesley Rosado", start: "10:00", end: "18:00" },
  { name: "Wade Davis", start: "10:00", end: "18:00" },
  { name: "Alexa Adams", start: "11:00", end: "19:00" },
  { name: "Andre Chance", start: "11:00", end: "19:00" },
  { name: "Sharon Garcia", start: "11:00", end: "19:00" },
  { name: "Talye DeMaio", start: "11:00", end: "19:00" },
  { name: "Marcos Reinoso", start: "12:00", end: "20:00" },
  { name: "Nine Payne", start: "12:00", end: "20:00" },
  { name: "Shushan Royer", start: "12:00", end: "20:00" },
  { name: "Taylor Yackulics", start: "12:00", end: "20:00" },
  { name: "Ruth Charles", start: "13:00", end: "19:00" },
  { name: "Abby Stapleton", start: "14:00", end: "22:00" },
  { name: "Adam Carey", start: "14:00", end: "22:00" },
  { name: "Adam Levi", start: "14:00", end: "22:00" },
  { name: "Carter Greenwood", start: "14:00", end: "22:00" },
  { name: "Daniel Leon", start: "14:00", end: "22:00" },
  { name: "David Hauser", start: "14:00", end: "22:00" },
  { name: "Emma Boles", start: "14:00", end: "22:00" },
  { name: "Fiona Coffey", start: "14:00", end: "22:00" },
  { name: "Gabby Tejada", start: "14:00", end: "22:00" },
  { name: "Gabriella Cammarata", start: "14:00", end: "22:00" },
  { name: "Kelly Mayo", start: "14:00", end: "22:00" },
  { name: "Kevin Hauser", start: "14:00", end: "22:00" },
  { name: "Luki Ahmad", start: "14:00", end: "22:00" },
  { name: "Matthew Studebaker", start: "14:00", end: "22:00" },
  { name: "Mily Gordon", start: "14:00", end: "22:00" },
  { name: "Ofelia Aguirre", start: "14:00", end: "22:00" },
  { name: "Randy Guardado", start: "14:00", end: "22:00" },
  { name: "Stephanie Mitchell", start: "14:00", end: "22:00" },
  { name: "Tati Mayea Ortiz", start: "14:00", end: "22:00" },
  { name: "Tori Borrowdale", start: "14:00", end: "22:00" },
  { name: "Yeffer Arestigueta", start: "14:00", end: "22:00" },
  { name: "Di Cannon", start: "14:30", end: "22:00" },
  { name: "Jodie Cordato", start: "15:00", end: "22:00" },
  { name: "Stephanie Meyer", start: "15:00", end: "22:00" },
];

const storeId = 768;
const shiftDate = new Date("2025-11-25");

function randomId() {
  return 1280000 + Math.floor(Math.random() * 100000);
}

(async () => {
  try {
    // Add crew only if not present
    const crewRecords = [];
    for (const c of crewData) {
      let crew = await p.crew.findFirst({ where: { name: c.name, storeId } });
      let id;
      if (!crew) {
        id = String(randomId());
        crew = await p.crew.create({
          data: {
            id,
            name: c.name,
            storeId,
          },
        });
        console.log(`Added crew: ${c.name} (${id})`);
      } else {
        id = crew.id;
        console.log(`Crew already exists: ${c.name} (${id})`);
      }
      crewRecords.push({ ...c, id });
    }
    // Add shifts only if not present
    function hhmmToMin(hhmm) {
      const [h, m] = hhmm.split(":").map(Number);
      return h * 60 + m;
    }
    for (const c of crewRecords) {
      const exists = await p.shift.findFirst({
        where: {
          crewId: c.id,
          storeId,
          date: shiftDate,
        },
      });
      if (!exists) {
        await p.shift.create({
          data: {
            crewId: c.id,
            storeId,
            date: shiftDate,
            startMin: hhmmToMin(c.start),
            endMin: hhmmToMin(c.end),
          },
        });
        console.log(`Added shift for ${c.name} on ${shiftDate}: ${c.start} - ${c.end}`);
      } else {
        console.log(`Shift already exists for ${c.name} on ${shiftDate}`);
      }
    }
  } catch (e) {
    console.error('Error adding crew or shifts', e);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
