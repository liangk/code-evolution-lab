// Removes dist/ before every build. Plain `tsc` does not clean its output
// directory — if a file is later excluded from compilation (e.g. src/__tests__
// via tsconfig's "exclude"), its previously-emitted output in dist/ is left
// behind indefinitely and gets published in every future tarball until
// something explicitly deletes it. This runs before every build so dist/
// always reflects exactly the current source, nothing stale.
const fs = require('fs');
const path = require('path');

fs.rmSync(path.join(__dirname, '..', 'dist'), { recursive: true, force: true });
