async function getUsersWithOrders(req, res) {
  const users = await User.findAll();
  
  for (const user of users) {
    user.orders = await Order.findAll({
      where: { userId: user.id }
    });
  }
  
  res.json(users);
}

async function getPostsWithComments() {
  const posts = await Post.findAll();
  
  posts.forEach(async (post) => {
    post.comments = await Comment.findMany({
      where: { postId: post.id }
    });
  });
  
  return posts;
}

async function complexN1Example() {
  const products = await Product.findAll();
  
  for (const product of products) {
    product.reviews = await Review.findAll({ where: { productId: product.id } });
    product.inventory = await Inventory.findOne({ where: { productId: product.id } });
    product.supplier = await Supplier.findByPk(product.supplierId);
  }
  
  return products;
}
