import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
const prisma = new PrismaClient();

async function checkBookings() {
  const bookings = await prisma.booking.findMany({
    include: {
      property: true,
      slot: true,
      tenant: true
    }
  });
  fs.writeFileSync('bookings.json', JSON.stringify(bookings, null, 2));
}
checkBookings()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
