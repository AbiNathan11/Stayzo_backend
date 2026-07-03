import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log('Users:');
  users.forEach(u => console.log(`- ${u.id}: ${u.email} (${u.firstName} ${u.lastName}) | isTenant: ${u.isTenant}, isOwner: ${u.isOwner}, isAdmin: ${u.isAdmin}`));

  const txs = await prisma.transaction.findMany();
  console.log('\nTransactions:');
  txs.forEach(t => console.log(`- ${t.id}: ${t.email} | Amount: ${t.amount} | Status: ${t.status}`));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

