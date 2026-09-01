async function listAllUsers() {
  const users = await db.user.findMany();
  return users;
}

function getAllOrders() {
  return db.order.findAll();
}
