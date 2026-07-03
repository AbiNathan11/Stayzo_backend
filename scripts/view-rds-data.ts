import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('\n========================================');
  console.log('  STAYZO — AWS RDS Data Viewer');
  console.log('========================================\n');

  // ── Users ───────────────────────────────────────────────
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, firstName: true, lastName: true, isOwner: true, isTenant: true, isAdmin: true, status: true, verified: true, createdAt: true }
  });
  console.log(`👤 USERS  (${users.length} total)`);
  console.table(users.map(u => ({
    id: u.id.slice(0, 8) + '...',
    email: u.email,
    name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
    roles: [u.isAdmin && 'admin', u.isOwner && 'owner', u.isTenant && 'tenant'].filter(Boolean).join(', '),
    status: u.status,
    verified: u.verified,
  })));

  // ── Properties ──────────────────────────────────────────
  const properties = await prisma.property.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, city: true, price: true, type: true, status: true, isBoosted: true, images: true, panoramaImage: true, waterBillImage: true, createdAt: true }
  });
  console.log(`\n🏠 PROPERTIES  (${properties.length} total)`);
  console.table(properties.map(p => ({
    id: p.id.slice(0, 8) + '...',
    title: p.title.slice(0, 35),
    city: p.city,
    price: `LKR ${p.price}`,
    type: p.type,
    status: p.status,
    boosted: p.isBoosted,
    images: p.images.length,
    hasPanorama: !!p.panoramaImage,
    hasWaterBill: !!p.waterBillImage,
  })));

  // Check if images are on S3 or Cloudinary
  const allImgUrls = properties.flatMap(p => [...p.images, p.panoramaImage, p.waterBillImage].filter(Boolean) as string[]);
  const s3Count = allImgUrls.filter(u => u.includes('amazonaws.com')).length;
  const cloudinaryCount = allImgUrls.filter(u => u.includes('cloudinary.com')).length;
  const otherCount = allImgUrls.length - s3Count - cloudinaryCount;
  console.log(`\n📦 IMAGE STORAGE BREAKDOWN:`);
  console.log(`   ✅ AWS S3          : ${s3Count} images`);
  console.log(`   ⚠️  Cloudinary      : ${cloudinaryCount} images  ${cloudinaryCount > 0 ? '← old data, still readable' : ''}`);
  console.log(`   ❓ Other/base64    : ${otherCount} images`);

  // ── Transactions ─────────────────────────────────────────
  const transactions = await prisma.transaction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log(`\n💳 TRANSACTIONS  (last ${transactions.length})`);
  console.table(transactions.map(t => ({
    id: t.id.slice(0, 8) + '...',
    type: t.type,
    amount: `LKR ${t.amount}`,
    status: t.status,
    method: t.paymentMethod,
    listing: t.targetListing.slice(0, 30),
  })));

  // ── Bookings ─────────────────────────────────────────────
  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { property: { select: { title: true } } }
  });
  console.log(`\n📅 BOOKINGS  (last ${bookings.length})`);
  console.table(bookings.map(b => ({
    id: b.id.slice(0, 8) + '...',
    property: b.property.title.slice(0, 30),
    tenantId: b.tenantId.slice(0, 8) + '...',
    status: b.status,
    created: b.createdAt.toISOString().slice(0, 10),
  })));

  // ── Summary counts ───────────────────────────────────────
  const [uCount, pCount, bCount, tCount, chatCount] = await Promise.all([
    prisma.user.count(),
    prisma.property.count(),
    prisma.booking.count(),
    prisma.transaction.count(),
    prisma.chatThread.count(),
  ]);
  console.log('\n📊 SUMMARY');
  console.log(`   Users         : ${uCount}`);
  console.log(`   Properties    : ${pCount}`);
  console.log(`   Bookings      : ${bCount}`);
  console.log(`   Transactions  : ${tCount}`);
  console.log(`   Chat Threads  : ${chatCount}`);
  console.log('\n========================================\n');
}

main()
  .catch((e) => { console.error('❌ Error:', e.message); })
  .finally(() => prisma.$disconnect());
