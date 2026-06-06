const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const slots = await prisma.availabilitySlot.findMany();
  console.log(JSON.stringify(slots, null, 2));
}
main();
