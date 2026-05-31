import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log('Users:');
  users.forEach(u => console.log(`- ${u.id}: ${u.email} (${u.firstName} ${u.lastName})`));
  
  const props = await prisma.property.findMany();
  console.log('\nProperties:');
  props.forEach(p => console.log(`- ${p.id}: ${p.title} (Owner: ${p.ownerId})`));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
