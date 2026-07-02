import { PrismaClient } from '@prisma/client';

const directUrl = 'postgresql://neondb_owner:npg_ErgKQHq1A7Cd@ep-delicate-snow-ap05mbc7.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: directUrl
    }
  }
});

async function main() {
  console.log('Profiling queries...');
  
  // Find a tenant and slot
  const tenant = await prisma.user.findFirst({ where: { isTenant: true } });
  const slot = await prisma.availabilitySlot.findFirst({ where: { isBlocked: false } });
  
  if (!tenant || !slot) {
    console.error('Tenant or Slot not found');
    return;
  }
  
  console.log('Starting profile...');
  const t0 = Date.now();
  
  try {
    const res = await prisma.$transaction(async (tx) => {
      const t1 = Date.now();
      const s = await tx.availabilitySlot.findUnique({
        where: { id: slot.id },
        include: {
          property: { select: { title: true, ownerId: true } },
          bookings: { where: { status: { in: ['PENDING', 'CONFIRMED'] } } }
        }
      });
      console.log(`Query 1 (findUnique slot) took: ${Date.now() - t1}ms`);
      
      const t2 = Date.now();
      const owner = await tx.user.findUnique({
        where: { id: s!.property.ownerId },
        select: { autoApprove: true }
      });
      console.log(`Query 2 (findUnique owner) took: ${Date.now() - t2}ms`);
      
      const t3 = Date.now();
      const booking = await tx.booking.findFirst({
        where: { slotId: slot.id, tenantId: tenant.id, status: { in: ['PENDING', 'CONFIRMED'] } }
      });
      console.log(`Query 3 (findFirst booking) took: ${Date.now() - t3}ms`);
      
      return { s, owner, booking };
    }, {
      timeout: 15000 // Increase timeout to 15s to allow profiling to complete
    });
    
    console.log(`Transaction completed successfully in ${Date.now() - t0}ms`);
  } catch (err) {
    console.error('Transaction failed during profiling:', err);
  }
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
