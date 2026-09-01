export function add(a, b) {
  return a + b;
}

export async function getUsers() {
  const users = await db.user.findMany({ select: { id: true, name: true }, take: 20 });
  return users;
}
