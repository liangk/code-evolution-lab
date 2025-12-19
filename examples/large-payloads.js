// Example 1: API endpoint without pagination
async function getAllUsers(req, res) {
  const users = await User.findAll();
  res.json(users);
}

// Example 2: SELECT * without field selection
async function getProducts() {
  const products = await Product.findAll();
  return products;
}

// Example 3: No limit on query
async function searchOrders(req, res) {
  const orders = await Order.findAll({
    where: { status: 'pending' }
  });
  res.json(orders);
}

// Example 4: Returning all fields
async function getUserProfile(userId) {
  return await User.findByPk(userId);
}

// Example 5: Large dataset without streaming
async function exportData(req, res) {
  const allData = await Data.findAll();
  res.json(allData);
}
