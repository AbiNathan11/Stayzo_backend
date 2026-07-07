import { prisma } from './src/config/db';

async function test() {
  try {
    console.log("Querying reviews by propertyId...");
    const reviews = await (prisma.review as any).findMany({
      where: { propertyId: "33058576-3e68-46ad-85a7-af26b6587244" }
    });
    console.log("Reviews found:", reviews);
  } catch (err: any) {
    console.error("Prisma database query failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
