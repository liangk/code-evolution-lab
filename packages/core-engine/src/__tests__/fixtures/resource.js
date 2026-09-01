function queryDb() {
  const conn = mysql.createConnection(config);
  conn.query('SELECT 1', () => {});
}

function readStream() {
  const stream = fs.createReadStream('/tmp/big.log');
  stream.on('data', (chunk) => process.stdout.write(chunk));
}
