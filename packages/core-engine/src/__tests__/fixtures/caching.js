function handleRequest(req, res) {
  const a = fetch('/api/config');
  const b = fetch('/api/config');
  res.send([a, b]);
}
