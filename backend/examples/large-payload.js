// Large Payload Example
// This code demonstrates inefficient data fetching patterns
// that return unnecessarily large payloads

const express = require('express');
const router = express.Router();

// Inefficient: Returns all fields for all users
router.get('/api/users', async (req, res) => {
  const users = await db.user.findMany({
    include: {
      posts: {
        include: {
          comments: {
            include: {
              author: true,
              likes: true
            }
          },
          likes: true,
          tags: true
        }
      },
      followers: true,
      following: true,
      profile: true,
      settings: true
    }
  });
  
  res.json(users);
});

// Inefficient: No pagination
router.get('/api/products', async (req, res) => {
  const products = await db.product.findMany({
    include: {
      reviews: true,
      images: true,
      variants: true,
      categories: true
    }
  });
  
  res.json(products);
});

// Expected issues:
// - SELECT * anti-pattern
// - Deep nested includes
// - No pagination
// - No field selection
// - Large response size
// - Should use cursor-based pagination
// - Should allow field filtering

module.exports = router;
