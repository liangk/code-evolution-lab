async function getUsersWithOrders(req, res) {
  const users = await User.findAll({
    include: [{ model: Order }]
  });
  
  res.json(users);
}

async function getPostsWithComments() {
  const posts = await Post.findAll({
    include: [{ model: Comment }]
  });
  
  return posts;
}

async function complexOptimizedExample() {
  const products = await Product.findAll({
    include: [
      { model: Review },
      { model: Inventory },
      { model: Supplier }
    ]
  });
  
  return products;
}
