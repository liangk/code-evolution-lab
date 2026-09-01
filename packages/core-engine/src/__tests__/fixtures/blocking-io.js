const fs = require('fs');
const { execSync } = require('child_process');

app.get('/report', (req, res) => {
  const data = fs.readFileSync('/tmp/report.txt', 'utf-8');
  const rev = execSync('git rev-parse HEAD');
  res.send(data + rev);
});
