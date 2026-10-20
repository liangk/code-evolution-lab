import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { RuleRegistry, analyzeDirectory } from '../engine';
import { blockingIoRules } from '../rules/blocking-io-rules';

function scan(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'reach-'));
  for (const [f, code] of Object.entries(files)) {
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), code);
  }
  const registry = new RuleRegistry();
  registry.registerAll(blockingIoRules);
  const report = analyzeDirectory({ targetPath: root }, registry);
  return report.issues.map(i => `${i.file.replace(/\\/g, '/')}:${i.line}:${i.severity}`).sort();
}

describe('blocking-io reachability (Stage 2, item 1)', () => {
  it('raises a call two levels below a handler in the same file', () => {
    const issues = scan({
      'src/api.js': [
        "const fs = require('fs');",
        'function readCache(p) { return fs.readFileSync(p); }',
        'function load(p) { return readCache(p); }',
        "exports.getTrakt = async (req, res) => { res.send(load('x')); };",
      ].join('\n'),
    });
    expect(issues).toEqual(['src/api.js:2:high']);
  });

  it('follows an imported binding into another file', () => {
    const issues = scan({
      'models/User.js': [
        "const crypto = require('crypto');",
        'userSchema.statics.generateToken = function generateToken() { return crypto.randomBytes(32).toString("hex"); };',
        'module.exports = mongoose.model("User", userSchema);',
      ].join('\n'),
      'controllers/user.js': [
        "const User = require('../models/User');",
        'exports.postForgot = async (req, res) => { const token = await User.generateToken(); res.send(token); };',
      ].join('\n'),
    });
    expect(issues).toEqual(['models/User.js:2:medium']);
  });

  it('follows an instance of an imported constructor', () => {
    const issues = scan({
      'api/helper.js': "const fs = require('fs');\nmodule.exports = function Helper() { this.clean_up = function (p) { fs.unlinkSync(p); }; };",
      'api/api.js': "var Helper = require('./helper.js');\nplugins.register('/i/export/delete', function (ob) { var h; h = new Helper(); h.clean_up(ob.path); });",
    });
    expect(issues).toEqual(['api/helper.js:2:high']);
  });

  it('follows a require cast with `as typeof import(...)`', () => {
    const issues = scan({
      'server/crypto-utils.ts': "import crypto from 'crypto';\nexport function decrypt(secret, data) { return crypto.pbkdf2Sync(secret, data, 100000, 32, 'sha512'); }",
      'server/preview.ts': "export function tryGetPreviewData(req, res) {\n  const { decrypt } = require('./crypto-utils') as typeof import('./crypto-utils');\n  return decrypt(req.secret, req.cookies.data);\n}",
    });
    expect(issues).toEqual(['server/crypto-utils.ts:2:high']);
  });

  it('does not link functions across files by name alone', () => {
    const issues = scan({
      'lib/cache.js': "const fs = require('fs');\nexports.load = function load() { return fs.readFileSync('x'); };",
      'src/routes.js': "const store = require('./store');\napp.get('/x', (req, res) => { res.send(store.load()); });",
      'src/store.js': 'exports.load = () => 1;',
    });
    expect(issues).toEqual(['lib/cache.js:2:low']);
  });

  it('scans .cjs files', () => {
    expect(scan({ 'lib/store.cjs': "const fs = require('fs');\nmodule.exports = () => fs.readFileSync('x');" })).toEqual(['lib/store.cjs:2:low']);
  });

  it('stops at two levels', () => {
    const issues = scan({
      'src/deep.js': [
        "const fs = require('fs');",
        "function a() { return fs.readFileSync('x'); }",
        'function b() { return a(); }',
        'function c() { return b(); }',
        'app.get("/x", (req, res) => { res.send(c()); });',
      ].join('\n'),
    });
    expect(issues).toEqual(['src/deep.js:2:low']);
  });

  it('knows createServer handlers, callbacks under a URL path, and (request, reply)', () => {
    const issues = scan({
      'src/ext.js': "const fs = require('fs');\nfunction handle(q, s) { s.end(fs.readFileSync('a')); }\nhttp.createServer(handle).listen(1);",
      'plugins/export/api.js': "const fs = require('fs');\nplugins.register('/o/export/list', function (ob) { fs.existsSync('b'); });",
      'src/f.js': "const fs = require('fs');\nconst h = async (request, reply) => reply.send(fs.readFileSync('c'));",
      'src/cli.js': "const fs = require('fs');\nprogram.command('build', () => fs.writeFileSync('d', ''));",
    });
    expect(issues).toEqual(['plugins/export/api.js:2:high', 'src/cli.js:2:low', 'src/ext.js:2:high', 'src/f.js:2:high']);
  });

  it('knows Next.js API routes, controllers taking ctx, and ipcMain handlers', () => {
    const issues = scan({
      'src/pages/api/hash.js': "import { readFileSync } from 'fs';\nexport default function handler(request, response) { response.json(readFileSync('c.yaml')); }",
      'src/app/api/config/route.ts': "import { readFileSync } from 'fs';\nexport async function GET() { return Response.json(readFileSync('c')); }",
      'server/src/controllers/ai.ts': "import fs from 'fs';\nexport default { async getUsage(ctx) { ctx.body = fs.readFileSync('license'); } };",
      'packages/cli/src/tasks/setup.ts': "import fs from 'fs';\nexport const task = async (ctx) => { fs.writeFileSync('x', ctx.value); };",
      'app/main.js': "const fs = require('fs');\nipcMain.handle('save', (event, data) => { fs.writeFileSync('s.json', data); });",
    });
    expect(issues).toEqual([
      'app/main.js:2:high',
      'packages/cli/src/tasks/setup.ts:2:low',
      'server/src/controllers/ai.ts:2:high',
      'src/app/api/config/route.ts:2:high',
      'src/pages/api/hash.js:2:high',
    ]);
  });
});
