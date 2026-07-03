import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

async function main() {
  console.log('Seeding reviews and transactions...');

  // 1. Seed Reviews if empty
  const reviewCount = await prisma.review.count();
  if (reviewCount === 0) {
    await prisma.review.createMany({
      data: [
        {
          authorName: "Sarah Connor",
          authorEmail: "sarah@connor.com",
          rating: 5,
          sentiment: "Positive",
          comment: "Absolutely breathtaking property. The Villa Tropical Cana has everything one could ask for. Spotless, quiet, and extremely modern. Highly recommended!",
          targetName: "Villa Tropical Cana",
          status: "Approved",
          likes: 24
        },
        {
          authorName: "John Connor",
          authorEmail: "john.c@cyberdyne.com",
          rating: 2,
          sentiment: "Negative",
          comment: "The place at 3940 N 16th St was highly unresponsive. We had to wait three hours in the rain for check-in. The water pressure in the shower was non-existent. Terrible experience.",
          targetName: "3940 N 16th St",
          status: "Flagged",
          likes: 8
        },
        {
          authorName: "Elena Rostova",
          authorEmail: "elena@rostov.io",
          rating: 4,
          sentiment: "Positive",
          comment: "Lovely stay at Colombo Heights Suite. Great view from the terrace and very convenient location. The apartment was clean and polite layout, though checkout was slightly rushed.",
          targetName: "Colombo Heights Suite",
          status: "Approved",
          likes: 15
        },
        {
          authorName: "Arthur Dent",
          authorEmail: "arthur@guide.galaxy",
          rating: 3,
          sentiment: "Neutral",
          comment: "The place at 46 Haunting St is mostly fine, but the instructions in the manual for the electrical panel were impossible to understand. Satisfactory but could use major clarity.",
          targetName: "46 Haunting St, Somerville",
          status: "Pending",
          likes: 3
        },
        {
          authorName: "Nimal Siri",
          authorEmail: "nimal@colombo.com",
          rating: 5,
          sentiment: "Positive",
          comment: "Absolutely stunning villa at Kandy Lakeview Mansion. Clean, peaceful, and surrounded by beautiful trees. Will definitely book again!",
          targetName: "Kandy Lakeview Mansion",
          status: "Approved",
          likes: 19
        },
        {
          authorName: "Lana Del",
          authorEmail: "lana@coast.com",
          rating: 2,
          sentiment: "Negative",
          comment: "Beautiful villa but the listing claimed it has a heated pool. It was freezing cold and the heating unit was broken. Felt highly deceptive.",
          targetName: "Ahlers & Ogletree Villa",
          status: "Flagged",
          likes: 11
        }
      ]
    });
    console.log('Reviews seeded successfully.');
  } else {
    console.log('Reviews already exist. Skipping review seed.');
  }

  // Transactions are managed dynamically, skipping mock seed.
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); // End of seed script
