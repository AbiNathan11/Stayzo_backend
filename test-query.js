const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const properties = await prisma.property.findMany({
      where: { status: { equals: 'Available', mode: 'insensitive' } },
      include: {
        owner: { select: { firstName: true, lastName: true, email: true } },
        reviews: {
          where: { status: { not: 'Flagged' } },
          select: { rating: true }
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    console.log('Success:', properties.length);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}
test();
