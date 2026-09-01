async function getUsersWithPosts(userIds) {
  const results = [];
  for (const id of userIds) {
    const user = await db.user.findUnique({ where: { id } });
    results.push(user);
  }
  return results;
}
