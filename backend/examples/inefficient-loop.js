// Inefficient Loop Example
// This code demonstrates multiple loop inefficiencies including
// array lookups, nested loops, and repeated operations

async function processUserOrders(users, orders) {
  const results = [];
  
  // Inefficient: Array.includes() in loop - O(n*m)
  for (const user of users) {
    const userOrders = [];
    for (const order of orders) {
      if (order.userId === user.id) {
        userOrders.push(order);
      }
    }
    
    // Inefficient: Repeated database queries in loop
    for (const order of userOrders) {
      const product = await db.product.findUnique({
        where: { id: order.productId }
      });
      order.productDetails = product;
    }
    
    results.push({
      user,
      orders: userOrders
    });
  }
  
  return results;
}

// Expected issues:
// - Nested loops with O(n²) complexity
// - Array lookups in loop
// - Await in loop (sequential database queries)
// - Should use Map/Set for lookups
// - Should batch database queries

module.exports = { processUserOrders };
