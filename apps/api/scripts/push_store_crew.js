// Script to push all crew for store 768 to the database
// Usage: node scripts/push_store_crew.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Example crew data for store 768
function randomId() {
  return String(1280000 + Math.floor(Math.random() * 10000)).slice(0, 7).padStart(7, '0');
}
const crewNames = [
  'Cheri Reimann','Dan Smith','Denise Madrid','Juan Caceres','Justin Bennett','Kaylyn Pipitone','Lindsey Wellington','Patricia Edgar','Q Mowatt','Roger Gomez','Tracy Hopkins','Xander Faber','Alice De Simoni','David Hauser','Esteban Espinosa','Jill Sachs','Marcela Soto','Nigel Pitts','Reece Lohrey','Smith Jean Jacques','Thalia Brauner','Kacey Nakasen','Lesley Rosado','Ofelia Aguirre','Stephanie Meyer','Taylor Yackulics','Shushan Royer','Leo Kelly','Marcos Reinoso','Mily Gordon','Daniel Leon','Randy Guardado','Stephanie Mitchell','Adam Levi','Carter Greenwood','Gabby Tejada','Garet Reimann','Kayla Girouard','Kevin Hauser','Luki Ahmad','Matthew Studebaker','Rodney Colon','Tati Mayea Ortiz','Tori Borrowdale','Wade Davis','Yeffer Arestigueta','Di Cannon','Fiona Coffey','Adam Carey','Adam Levi','Adrian Pena','Alexa Adams','Andrea Canizares','Ashley Andrejko','Ben Stogis','Carissa Butz','Carolyn Shephard','Carter Greenwood','Chase Watts','Cianna Sala','Elder de Leon','Emma Boles','Gary Medina','Hannah Reshel','Kelly Mayo','Khadijah Robbins','Leonardo Saenz-Marmol','Maricel Cabal','Matt Connor','Morgan Bussius','Nikki Lera','Nine Payne','Rachel Haverstock','Ruth Charles','Samantha Buckley','Savannah Fraijo','Sharon Garcia','Talye DeMaio','Vaughn Diana','Abby Stapleton','Alyssa Jenkins','Andre Chance','Crystal Rosa','Gabriella Cammarata','Jodie Cortado','Kenny Brooke','Kit Riffel','Roger Gomez','Sharon Dytrych'
];
const crewList = crewNames.map(name => ({ id: randomId(), name, storeId: 768 }));

async function main() {
  for (const crew of crewList) {
    try {
  await prisma.crewMember.create({ data: crew });
      console.log(`Created crew: ${crew.name} (ID: ${crew.id})`);
    } catch (e) {
      if (e.code === 'P2002') {
        console.log(`Crew with ID ${crew.id} already exists.`);
      } else {
        console.error(`Error creating crew ${crew.id}:`, e);
      }
    }
  }
  await prisma.$disconnect();
}

main();
