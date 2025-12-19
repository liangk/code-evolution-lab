// Example 1: Inefficient array method chaining
function processUsers(users) {
  return users
    .filter(user => user.active)
    .map(user => user.name);
}

// Example 2: Nested array methods (O(n²))
function getUserOrders(users, orders) {
  return users.map(user => {
    return {
      ...user,
      orders: orders.filter(order => order.userId === user.id)
    };
  });
}

// Example 3: Array.push() in loop
function doubleNumbers(numbers) {
  const result = [];
  for (let i = 0; i < numbers.length; i++) {
    result.push(numbers[i] * 2);
  }
  return result;
}

// Example 4: DOM manipulation in loop
function renderItems(items) {
  for (const item of items) {
    const div = document.createElement('div');
    div.textContent = item.name;
    document.body.appendChild(div);
  }
}

// Example 5: Multiple filter/map chains
function complexProcessing(data) {
  return data
    .filter(item => item.status === 'active')
    .map(item => item.value)
    .filter(value => value > 0)
    .map(value => value * 2);
}
