import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'adminstayzo@gmail.com';

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      firstName: 'Admin',
      lastName: 'Stayzo',
      isAdmin: true,
      isOwner: false,
      isTenant: false,
    },
    create: {
      email: adminEmail,
      firstName: 'Admin',
      lastName: 'Stayzo',
      isAdmin: true,
      isOwner: false,
      isTenant: false,
    },
  });

  console.log(`✅ Admin user seeded successfully: ${user.email} (Admin: ${user.isAdmin})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
