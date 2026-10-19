/**
 * Reachability for the blocking-io rules: is a synchronous call one or two
 * calls away from a request handler?
 *
 * The Blocking I/O story labelled findings by tracing callers up to two levels
 * to an entry point. Seven of its eighteen sampled true positives were low
 * severity because the handler was in a caller, not in the function holding
 * the call. This module runs the same trace.
 *
 * While each file is scanned, `indexFile` records its functions, which of them
 * are handlers, the calls each one makes, and what it imports. After the scan,
 * `findHandlerPath` walks callers from a finding's enclosing function: first
 * within its own file, then through imported bindings into other files. It
 * stops at two levels, as the labelling did.
 *
 * Name matching is deliberately narrow. A call links to a function only by
 * the name it was defined under in the same file, or through an import whose
 * module resolves to a scanned file. No guessing across files by name alone,
 * so an `update()` in one module never links to every `update` in the
 * repository.
 */
import traverse from '@babel/traverse';
import { posix } from 'path';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'use', 'all', 'head', 'options']);
const ROUTER_OBJECTS = new Set(['app', 'router', 'express', 'server', 'api', 'routes', 'fastify']);
const ROUTE_EXPORTS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const IPC_METHODS = new Set(['handle', 'handleOnce', 'on', 'once']);
const RESOLVE_EXT = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js', '/index.mjs'];
const MAX_LEVELS = 2;

export interface FnInfo {
  /** Index within the file. */
  id: number;
  /** Name it can be called by in this file, or null for an anonymous handler. */
  name: string | null;
  line: number;
  handler: string | null;
  /** Calls made directly in this function: `f`, `this.f`, `obj.f`. */
  calls: { obj: string | null; prop: string }[];
  start: number;
  end: number;
}

interface FileIndex {
  fns: FnInfo[];
  /** Local binding -> { module path as written, imported name or 'default' or '*' }. */
  imports: Map<string, { from: string; name: string }>;
  /** Exported name -> local function name. 'default' for the default export. */
  exports: Map<string, string>;
}

const index = new Map<string, FileIndex>();
/** Resolved target file -> the files importing it and the bindings they use. Built on first lookup. */
let importers: Map<string, { file: string; local: string; name: string }[]> | null = null;

export function resetReach(): void {
  index.clear();
  importers = null;
}

function importersOf(file: string): { file: string; local: string; name: string }[] {
  if (!importers) {
    importers = new Map();
    for (const [other, oi] of index) {
      for (const [local, imp] of oi.imports) {
        const target = resolve(other, imp.from);
        if (!target || target === other) continue;
        const list = importers.get(target) ?? [];
        list.push({ file: other, local, name: imp.name });
        importers.set(target, list);
      }
    }
  }
  return importers.get(file) ?? [];
}

/** Why a function is a request handler, or null. */
export function handlerKind(fnPath: any, filePath: string): string | null {
  const node = fnPath.node;
  const params: string[] = (node.params || []).map((p: any) => p?.name ?? p?.left?.name);
  if (params.includes('req') && params.includes('res')) return '(req, res) function';
  // Fastify and plain http naming: (request, reply), (request, response).
  if ((params[0] === 'req' || params[0] === 'request') && ['res', 'reply', 'response'].includes(params[1])) return `(${params[0]}, ${params[1]}) function`;

  const parent = fnPath.parentPath;
  // Passed to app.get(...), router.post(...), ipcMain.handle(...).
  if (parent?.node?.type === 'CallExpression' && parent.node.arguments?.includes(node)) {
    const kind = registrationKind(parent.node, node);
    if (kind) return kind;
  }

  const file = filePath.replace(/\\/g, '/');
  // Next.js API routes: pages/api default export, App Router route handlers.
  if (/(^|\/)pages\/api\//.test(file) && isDefaultExport(fnPath)) return 'Next.js API route';
  if (/(^|\/)app\/(.+\/)?route\.[cm]?[jt]sx?$/.test(file)) {
    const name = exportedName(fnPath);
    if (name && ROUTE_EXPORTS.has(name)) return `Next.js route ${name}`;
  }
  // Koa and Strapi controllers: only under controllers/, after the round-2
  // trial found `ctx` alone also matches CLI task contexts.
  if (/(^|\/)controllers?\//.test(file) && params[0] === 'ctx') return 'controller (ctx)';
  return null;
}

/**
 * Whether a call registers `arg` as a handler: app.get(...), router.post(...),
 * ipcMain.handle(...), http.createServer(...), or any call whose first
 * argument is a URL path (plugins.register('/o/export', fn)). The path
 * string is the signal there, not the object's name.
 */
export function registrationKind(call: any, arg: any): string | null {
  const callee = call.callee;
  const method = callee?.property?.name;
  const objName = callee?.object?.name || callee?.object?.property?.name;
  if (method && HTTP_METHODS.has(method) && objName && ROUTER_OBJECTS.has(objName)) return `${objName}.${method}() callback`;
  if (objName === 'ipcMain' && method && IPC_METHODS.has(method)) return `ipcMain.${method}() handler`;
  if ((callee?.name ?? method) === 'createServer') return 'createServer() handler';
  const first = call.arguments[0];
  if (first !== arg && first?.type === 'StringLiteral' && /^\/[\w:.-]/.test(first.value)) return `callback for '${first.value}'`;
  return null;
}

function isDefaultExport(fnPath: any): boolean {
  let p = fnPath.parentPath;
  if (p?.node?.type === 'ExportDefaultDeclaration') return true;
  // const handler = (req, res) => {}; export default handler
  if (p?.node?.type === 'VariableDeclarator' && p.node.id?.name) {
    const prog = fnPath.findParent((x: any) => x.isProgram());
    const name = p.node.id.name;
    return !!prog?.node.body.some((s: any) => s.type === 'ExportDefaultDeclaration' && s.declaration?.name === name);
  }
  return false;
}

function exportedName(fnPath: any): string | null {
  const node = fnPath.node;
  const p = fnPath.parentPath;
  if (node.type === 'FunctionDeclaration' && p?.node?.type === 'ExportNamedDeclaration') return node.id?.name ?? null;
  if (p?.node?.type === 'VariableDeclarator' && p.parentPath?.parentPath?.node?.type === 'ExportNamedDeclaration') return p.node.id?.name ?? null;
  return null;
}

/** The name a function can be called by: declaration, variable, assignment or method key. */
function nameOf(fnPath: any): string | null {
  const node = fnPath.node;
  if (node.id?.name && node.type === 'FunctionDeclaration') return node.id.name;
  const p = fnPath.parentPath?.node;
  if (!p) return node.id?.name ?? null;
  if (p.type === 'VariableDeclarator' && p.id?.type === 'Identifier') return p.id.name;
  if ((node.type === 'ClassMethod' || node.type === 'ObjectMethod' || node.type === 'ClassPrivateMethod') && node.key) return node.key.name ?? node.key.id?.name ?? node.key.value ?? null;
  if ((p.type === 'ObjectProperty' || p.type === 'ClassProperty') && p.key) return p.key.name ?? p.key.value ?? null;
  // exports.f = function () {}, X.prototype.f = ..., schema.statics.f = ...
  if (p.type === 'AssignmentExpression' && p.left?.type === 'MemberExpression') return p.left.property?.name ?? null;
  return node.id?.name ?? null;
}

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod']);

/** Index one file. Call once per scanned file with its AST. */
export function indexFile(filePath: string, ast: any): void {
  const fns: FnInfo[] = [];
  const imports = new Map<string, { from: string; name: string }>();
  const exports = new Map<string, string>();
  const stack: FnInfo[] = [];
  /** Named functions registered as handlers by reference: createServer(handle). */
  const handlerRefs = new Map<string, string>();
  /** `x = new Imported()`: x's methods are the imported module's functions. */
  const instances: [string, string][] = [];

  const enter = (path: any) => {
    const name = nameOf(path);
    const handler = handlerKind(path, filePath);
    if (!name && !handler) return;
    const info: FnInfo = { id: fns.length, name, line: path.node.loc?.start.line ?? 0, handler, calls: [], start: path.node.start, end: path.node.end };
    fns.push(info);
    stack.push(info);
    path.setData('reachFn', info);
  };
  const exit = (path: any) => {
    if (path.getData('reachFn')) stack.pop();
  };

  try {
    traverse(ast, {
      noScope: true,
      enter(path: any) {
        if (FUNCTION_TYPES.has(path.node.type)) enter(path);
      },
      exit(path: any) {
        if (FUNCTION_TYPES.has(path.node.type)) exit(path);
      },
      CallExpression(path: any) {
        const callee = path.node.callee;
        const top = stack[stack.length - 1];
        // require('./x') bindings
        if (callee?.name === 'require' && path.node.arguments?.[0]?.type === 'StringLiteral') {
          const from = path.node.arguments[0].value;
          const decl = path.parentPath?.node;
          if (decl?.type === 'VariableDeclarator') {
            if (decl.id?.type === 'Identifier') imports.set(decl.id.name, { from, name: '*' });
            else if (decl.id?.type === 'ObjectPattern') {
              for (const prop of decl.id.properties) {
                if (prop.type === 'ObjectProperty' && prop.value?.type === 'Identifier') imports.set(prop.value.name, { from, name: prop.key?.name ?? prop.value.name });
              }
            }
          }
          return;
        }
        for (const arg of path.node.arguments || []) {
          if (arg?.type !== 'Identifier' && !(arg?.type === 'MemberExpression' && arg.object?.type === 'ThisExpression')) continue;
          const kind = registrationKind(path.node, arg);
          const name = arg.type === 'Identifier' ? arg.name : arg.property?.name;
          if (kind && name) handlerRefs.set(name, kind);
        }
        if (!top) return;
        if (callee?.type === 'Identifier') top.calls.push({ obj: null, prop: callee.name });
        else if (callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier') {
          const obj = callee.object?.type === 'ThisExpression' ? 'this' : callee.object?.type === 'Identifier' ? callee.object.name : null;
          top.calls.push({ obj, prop: callee.property.name });
        }
      },
      ImportDeclaration(path: any) {
        const from = path.node.source.value;
        for (const spec of path.node.specifiers) {
          if (spec.type === 'ImportDefaultSpecifier') imports.set(spec.local.name, { from, name: 'default' });
          else if (spec.type === 'ImportNamespaceSpecifier') imports.set(spec.local.name, { from, name: '*' });
          else imports.set(spec.local.name, { from, name: spec.imported?.name ?? spec.imported?.value });
        }
      },
      ExportDefaultDeclaration(path: any) {
        const d = path.node.declaration;
        if (d?.type === 'Identifier') exports.set('default', d.name);
        else if (d?.id?.name) exports.set('default', d.id.name);
      },
      ExportNamedDeclaration(path: any) {
        for (const spec of path.node.specifiers || []) {
          if (spec.local?.name) exports.set(spec.exported?.name ?? spec.local.name, spec.local.name);
        }
      },
      NewExpression(path: any) {
        const c = path.node.callee;
        if (c?.type !== 'Identifier') return;
        const p = path.parentPath?.node;
        if (p?.type === 'VariableDeclarator' && p.id?.type === 'Identifier') instances.push([p.id.name, c.name]);
        else if (p?.type === 'AssignmentExpression' && p.left?.type === 'Identifier') instances.push([p.left.name, c.name]);
      },
      AssignmentExpression(path: any) {
        // module.exports = f
        const l = path.node.left;
        if (l?.type === 'MemberExpression' && l.object?.name === 'module' && l.property?.name === 'exports' && path.node.right?.type === 'Identifier') {
          exports.set('default', path.node.right.name);
        }
      },
    });
  } catch {
    // An unparseable shape leaves the file out of the index: no reach through it.
  }
  for (const fn of fns) if (!fn.handler && fn.name && handlerRefs.has(fn.name)) fn.handler = handlerRefs.get(fn.name)!;
  for (const [local, ctor] of instances) {
    const imp = imports.get(ctor);
    if (imp && !imports.has(local)) imports.set(local, { from: imp.from, name: '*' });
  }
  index.set(filePath.replace(/\\/g, '/'), { fns, imports, exports });
}

/** The innermost indexed function containing a source offset. */
export function enclosingFn(filePath: string, offset: number): FnInfo | null {
  const fi = index.get(filePath.replace(/\\/g, '/'));
  if (!fi) return null;
  let best: FnInfo | null = null;
  for (const f of fi.fns) if (f.start <= offset && offset < f.end && (!best || f.start >= best.start)) best = f;
  return best;
}

function resolve(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = posix.normalize(posix.join(posix.dirname(fromFile), spec)).replace(/\.(js|mjs|cjs)$/, '');
  for (const ext of RESOLVE_EXT) {
    if (index.has(base + ext)) return base + ext;
  }
  if (index.has(posix.normalize(posix.join(posix.dirname(fromFile), spec)))) return posix.normalize(posix.join(posix.dirname(fromFile), spec));
  return null;
}

/** Functions (in any file) that call `target`, defined in `file`. */
function callersOf(file: string, target: FnInfo): { file: string; fn: FnInfo }[] {
  const out: { file: string; fn: FnInfo }[] = [];
  if (!target.name) return out;
  const fi = index.get(file)!;
  // Same file: f(), this.f(), obj.f() where obj is not an import.
  for (const fn of fi.fns) {
    if (fn === target) continue;
    if (fn.calls.some((c) => c.prop === target.name && (c.obj === null || c.obj === 'this' || !fi.imports.has(c.obj)))) out.push({ file, fn });
  }
  // Exported names under which other files may import it.
  const exportedAs = new Set<string>([target.name]);
  for (const [exp, local] of fi.exports) if (local === target.name) exportedAs.add(exp);
  const byFile = new Map<string, { local: string; member: boolean }[]>();
  for (const imp of importersOf(file)) {
    const locals = byFile.get(imp.file) ?? [];
    if (imp.name === '*' || imp.name === 'default') {
      locals.push({ local: imp.local, member: true });
      if (exportedAs.has('default')) locals.push({ local: imp.local, member: false });
    } else if (exportedAs.has(imp.name)) locals.push({ local: imp.local, member: false });
    byFile.set(imp.file, locals);
  }
  for (const [other, locals] of byFile) {
    if (!locals.length) continue;
    for (const fn of index.get(other)!.fns) {
      const hit = fn.calls.some((c) => locals.some((l) => (l.member ? c.obj === l.local && c.prop === target.name : c.obj === null && c.prop === l.local)));
      if (hit) out.push({ file: other, fn });
    }
  }
  return out;
}

export interface HandlerPath {
  handler: string;
  file: string;
  line: number;
  levels: number;
}

/** A handler within two calling levels of `start`, or null. */
export function findHandlerPath(file: string, start: FnInfo): HandlerPath | null {
  const f = file.replace(/\\/g, '/');
  if (start.handler) return { handler: start.handler, file: f, line: start.line, levels: 0 };
  let frontier = [{ file: f, fn: start }];
  const seen = new Set<string>([`${f}#${start.id}`]);
  for (let level = 1; level <= MAX_LEVELS; level++) {
    const next: { file: string; fn: FnInfo }[] = [];
    for (const node of frontier) {
      for (const c of callersOf(node.file, node.fn)) {
        const key = `${c.file}#${c.fn.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (c.fn.handler) return { handler: c.fn.handler, file: c.file, line: c.fn.line, levels: level };
        next.push(c);
      }
    }
    frontier = next;
  }
  return null;
}
