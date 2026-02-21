// N+1 Query Problem Example
// This code demonstrates a classic N+1 query issue where
// we fetch users and then make separate queries for each user's posts

const prisma = require('@prisma/client').PrismaClient;
const db = new prisma();

async function getUsersWithPosts() {
  // First query: Get all users
  const users = await db.user.findMany();
  
  // N additional queries: Get posts for each user (N+1 problem!)
  for (const user of users) {
    const posts = await db.post.findMany({
      where: { userId: user.id }
    });
    user.posts = posts;
  }
  
  return users;
}

// Expected issues:
// - N+1 query detected
// - Performance degradation with large datasets
// - Database connection overhead

module.exports = { getUsersWithPosts };
