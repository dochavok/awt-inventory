// The test-change rule in CI (TF-6, TF-7): pure functions, used by
// scripts/check-test-changes.ts and tested in tests/meta/test-change-check.test.ts.
//
// Part 1, skipped when the same change edits inventory-requirements.md, fails a
// change that:
//   - changes or removes an existing top-level statement in a test file (a test,
//     a helper, an import), compared as parsed code so formatting and comments
//     don't count; or adds new top-level code that could affect existing tests:
//     a bare statement such as a hook or vi.mock, an import run only for its
//     effects, an import of a file added in the same change, or a declaration
//     that runs code when the file loads (anything but functions, classes,
//     literals and plain data). New tests, helpers with new names, new imports,
//     and new names added to an existing import are allowed;
//   - changes or removes an existing scenario or fixture record in YAML under
//     tests/ (records are matched by id, skill or level). New records are allowed;
//   - changes or deletes any other file under tests/: the harness is every
//     TypeScript file that isn't itself a test (*.test.ts, *.spec.ts), such as
//     tests/support/ and tests/meta/probes/. tests/COVERAGE.md is exempt: it's
//     generated;
//   - changes or deletes anything in scripts/, the test settings
//     (vitest.config.ts, playwright.config.ts, firebase.json, eslint.config.js)
//     or .claude/settings.json;
//   - changes the test scripts in package.json, or adds or changes a script npm
//     runs by itself (its lifecycle scripts such as postinstall and prepare, or
//     pre<name>/post<name> for an existing script), or removes a finished
//     milestone;
//   - changes or deletes a CI workflow, except to update the versions of the
//     actions it uses (as Dependabot does).
// Adding new files is always allowed.
//
// Part 2, always: fails if app code (src/) or the server code (functions/)
// imports the tests, test tools or test data, or if src/, data/ or functions/
// names a made-up test character or user.

import { isDeepStrictEqual } from "node:util";
import ts from "typescript";
import { parse } from "yaml";

export const REQUIREMENTS = "inventory-requirements.md";

export interface Change {
  status: "A" | "M" | "D";
  path: string;
}

/** Reads a file at the base or head of the change; undefined if it doesn't exist there. */
export type Reader = (path: string) => string | undefined;

const PROTECTED_FILES = new Set([
  "vitest.config.ts",
  "playwright.config.ts",
  "firebase.json",
  "eslint.config.js",
  ".claude/settings.json",
]);

const PROTECTED_SCRIPTS = [
  "test",
  "test:access",
  "test:browser",
  "lint",
  "coverage:write",
  "coverage:check",
  "check:test-changes",
];

/** Scripts npm runs by itself on install, publish and the like. */
const NPM_LIFECYCLE = new Set([
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "preprepare",
  "postprepare",
  "prepublish",
  "prepublishOnly",
  "prepack",
  "postpack",
  "dependencies",
]);

const TEST_TOOLS = ["vitest", "fast-check", "@firebase/rules-unit-testing", "@playwright/test"];
const IDENTITY_KEYS = ["id", "skill", "level"] as const;

export const RULE = `\
The test-change rule (TF-6): a failing test means the code is wrong. A test may only
change after Craig confirms it's wrong, and then only in this order:
  1. confirm with Craig that the test is wrong;
  2. fix the requirements document (${REQUIREMENTS});
  3. fix the test to match (commit steps 2 and 3 together, naming the requirement);
  4. fix the code until the test passes.
Adding new tests is always allowed.`;

export function requirementsChanged(changes: Change[]): boolean {
  return changes.some((c) => c.path === REQUIREMENTS);
}

/** Part 1: problems with changes to tests and their settings. Empty when the requirements changed too. */
export function testChangeProblems(changes: Change[], base: Reader, head: Reader): string[] {
  if (requirementsChanged(changes)) return [];
  const added = new Set(changes.filter((c) => c.status === "A").map((c) => c.path));
  return changes.flatMap((c) => changeProblems(c, base, head, added));
}

function changeProblems(change: Change, base: Reader, head: Reader, added: Set<string>): string[] {
  const { path, status } = change;
  if (status === "A") return [];
  if (path === "tests/COVERAGE.md") return [];
  const removed = status === "D";
  if (path === "package.json")
    return removed ? ["package.json was deleted"] : packageProblems(base(path) ?? "{}", head(path) ?? "{}");
  if (path.startsWith(".github/workflows/")) {
    if (removed) return [`${path}: a CI workflow was deleted`];
    return sameApartFromActionVersions(base(path), head(path)) ? [] : [`${path}: a CI workflow was changed`];
  }
  if (PROTECTED_FILES.has(path) || path.startsWith("scripts/"))
    return [`${path}: ${removed ? "deleted" : "changed"} (test settings and check scripts are protected)`];
  if (!path.startsWith("tests/")) return [];
  if (removed) return [`${path}: deleted`];
  if (/\.(test|spec)\.tsx?$/.test(path)) return testFileProblems(path, base(path) ?? "", head(path) ?? "", added);
  if (/\.ya?ml$/.test(path)) return yamlProblems(path, base(path) ?? "", head(path) ?? "");
  const isHarness = /\.[cm]?[jt]sx?$/.test(path);
  return [`${path}: changed (${isHarness ? "the test harness" : "files under tests/"} can't change)`];
}

// ---------------------------------------------------------------- TypeScript test files

interface Statement {
  text: string;
  node: ts.Statement;
}

function statements(path: string, source: string): { file: ts.SourceFile; list: Statement[] } {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const printer = ts.createPrinter({ removeComments: true });
  return {
    file,
    list: file.statements.map((node) => ({ node, text: printer.printNode(ts.EmitHint.Unspecified, node, file) })),
  };
}

function describeStatement(statement: ts.Statement, file: ts.SourceFile): string {
  if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)) {
    const call = statement.expression;
    const callee = call.expression.getText(file);
    const title = call.arguments.find((a) => ts.isStringLiteralLike(a));
    if (title && ts.isStringLiteralLike(title)) return `${callee}(… "${title.text}")`;
    return `${callee}(…)`;
  }
  const line = file.getLineAndCharacterOfPosition(statement.getStart(file)).line + 1;
  return `the statement at line ${line} (${statement.getText(file).split("\n")[0]!.slice(0, 60)})`;
}

const TEST_DECLARATIONS = new Set(["rule", "browserRule", "runScenarios"]);

function isTestDeclaration(statement: ts.Statement): boolean {
  if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return false;
  const callee = statement.expression.expression;
  return ts.isIdentifier(callee) && TEST_DECLARATIONS.has(callee.text);
}

function boundNames(statement: ts.Statement): string[] {
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
    return statement.name ? [statement.name.text] : [];
  }
  if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) return [statement.name.text];
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((d) => (ts.isIdentifier(d.name) ? [d.name.text] : []));
  }
  return [];
}

interface ImportShape {
  module: string;
  default?: string;
  namespace?: string;
  named: Set<string>;
  typeOnly: boolean;
}

function importShape(statement: ts.Statement): ImportShape | undefined {
  if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return undefined;
  const clause = statement.importClause;
  const named = new Set<string>();
  let namespace: string | undefined;
  const bindings = clause?.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) namespace = bindings.name.text;
  if (bindings && ts.isNamedImports(bindings)) {
    for (const e of bindings.elements)
      named.add(`${e.isTypeOnly ? "type " : ""}${e.propertyName?.text ?? e.name.text} as ${e.name.text}`);
  }
  return {
    module: statement.moduleSpecifier.text,
    ...(clause?.name ? { default: clause.name.text } : {}),
    ...(namespace ? { namespace } : {}),
    named,
    typeOnly: clause?.isTypeOnly ?? false,
  };
}

/** An import that only gained names: same module, default and namespace, old names all kept. */
function importOnlyGrew(before: ImportShape, after: ImportShape): boolean {
  return (
    before.module === after.module &&
    before.default === after.default &&
    before.namespace === after.namespace &&
    before.typeOnly === after.typeOnly &&
    [...before.named].every((n) => after.named.has(n))
  );
}

/**
 * The first part of `expr` that would run code when the file loads, if any.
 * Only definitions are inert: functions, classes without static code, literals,
 * names, and objects and arrays of those. Calls, `new`, assignments and the
 * like all run code, whatever they're called, so they're refused.
 */
function loadTimeCode(expr: ts.Expression, file: ts.SourceFile): string | undefined {
  if (ts.isFunctionExpression(expr) || ts.isArrowFunction(expr)) return undefined;
  if (ts.isClassExpression(expr)) return staticCode(expr, file);
  if (
    ts.isStringLiteral(expr) ||
    ts.isNumericLiteral(expr) ||
    ts.isNoSubstitutionTemplateLiteral(expr) ||
    ts.isRegularExpressionLiteral(expr) ||
    ts.isIdentifier(expr) ||
    [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(expr.kind)
  ) {
    return undefined;
  }
  if (ts.isPrefixUnaryExpression(expr) && ts.isNumericLiteral(expr.operand)) return undefined;
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) {
    return loadTimeCode(expr.expression, file);
  }
  if (ts.isArrayLiteralExpression(expr)) {
    for (const element of expr.elements) {
      const found = loadTimeCode(ts.isSpreadElement(element) ? element.expression : element, file);
      if (found) return found;
    }
    return undefined;
  }
  if (ts.isObjectLiteralExpression(expr)) {
    for (const property of expr.properties) {
      if (ts.isPropertyAssignment(property)) {
        if (ts.isComputedPropertyName(property.name)) return property.name.getText(file);
        const found = loadTimeCode(property.initializer, file);
        if (found) return found;
      } else if (ts.isSpreadAssignment(property)) {
        const found = loadTimeCode(property.expression, file);
        if (found) return found;
      } else if (ts.isMethodDeclaration(property) || ts.isGetAccessor(property) || ts.isSetAccessor(property)) {
        // The body runs only when called, but a computed name runs now.
        if (ts.isComputedPropertyName(property.name)) return property.name.getText(file);
      }
      // A shorthand property ({ name }) only reads a name.
    }
    return undefined;
  }
  return expr.getText(file);
}

/** Code a class runs when it's defined: decorators, computed member names, static blocks and static field values. */
function staticCode(node: ts.ClassLikeDeclaration, file: ts.SourceFile): string | undefined {
  const decorated = (n: ts.Node) => ts.canHaveDecorators(n) && (ts.getDecorators(n)?.length ?? 0) > 0;
  if (decorated(node)) return ts.getDecorators(node)![0]!.getText(file);
  for (const member of node.members) {
    if (ts.isClassStaticBlockDeclaration(member)) return member.getText(file);
    if (decorated(member)) return ts.getDecorators(member as ts.HasDecorators)![0]!.getText(file);
    if (member.name && ts.isComputedPropertyName(member.name)) return member.name.getText(file);
    const isStatic =
      ts.canHaveModifiers(member) && ts.getModifiers(member)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
    if (isStatic && ts.isPropertyDeclaration(member) && member.initializer) {
      const found = loadTimeCode(member.initializer, file);
      if (found) return found;
    }
  }
  if (node.heritageClauses?.some((h) => h.types.some((t) => !ts.isIdentifier(t.expression))))
    return "a computed base class";
  return undefined;
}

/** What a new top-level declaration would run at load time, if anything. */
function declarationLoadTimeCode(statement: ts.Statement, file: ts.SourceFile): string | undefined {
  if (ts.isVariableStatement(statement)) {
    for (const d of statement.declarationList.declarations) {
      const found = d.initializer && loadTimeCode(d.initializer, file);
      if (found) return found;
    }
    return undefined;
  }
  if (ts.isClassDeclaration(statement)) return staticCode(statement, file);
  return undefined;
}

/** The repository path a relative import in `path` points to, if it's one of `files`. */
function resolvesTo(path: string, specifier: string, files: Set<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const parts = path.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  // The bundler resolution in tsconfig.json also maps .js, .jsx, .mjs and .cjs to their TypeScript files.
  const target = parts.join("/").replace(/\.([cm]?)js(x?)$/, ".$1ts$2");
  const stem = target.replace(/\.[cm]?tsx?$/, "");
  const candidates = [
    target,
    ...["ts", "tsx", "mts", "cts"].flatMap((ext) => [`${stem}.${ext}`, `${target}/index.${ext}`]),
  ];
  return candidates.find((candidate) => files.has(candidate));
}

export function testFileProblems(
  path: string,
  oldSource: string,
  newSource: string,
  addedFiles: Set<string> = new Set(),
): string[] {
  const before = statements(path, oldSource);
  const after = statements(path, newSource);
  const problems: string[] = [];
  const unmatched = new Map<string, number>();
  for (const s of after.list) unmatched.set(s.text, (unmatched.get(s.text) ?? 0) + 1);
  const grownImports = new Set<Statement>();
  const kept: Statement[] = [];
  const reported = new Set<string>();

  for (const s of before.list) {
    const count = unmatched.get(s.text) ?? 0;
    if (count > 0) {
      unmatched.set(s.text, count - 1);
      kept.push(s);
      continue;
    }
    const oldImport = importShape(s.node);
    const grown =
      oldImport &&
      after.list.find((n) => {
        const shape = importShape(n.node);
        return !grownImports.has(n) && (unmatched.get(n.text) ?? 0) > 0 && shape && importOnlyGrew(oldImport, shape);
      });
    if (grown) {
      grownImports.add(grown);
      unmatched.set(grown.text, unmatched.get(grown.text)! - 1);
      continue;
    }
    problems.push(`${path}: ${describeStatement(s.node, before.file)} was changed or removed`);
    for (const name of boundNames(s.node)) reported.add(name);
  }

  // Only names from unchanged statements: a changed one is reported above already.
  const oldNames = new Set(kept.flatMap((s) => boundNames(s.node)));
  const remaining = new Map(unmatched);
  for (const s of after.list) {
    const count = remaining.get(s.text) ?? 0;
    if (count === 0) continue;
    remaining.set(s.text, count - 1);
    if (isTestDeclaration(s.node)) continue;
    if (ts.isImportDeclaration(s.node)) {
      const shape = importShape(s.node);
      if (!s.node.importClause) {
        problems.push(`${path}: new import run for its effects (${s.text}) could affect existing tests`);
      } else if (shape) {
        const added = resolvesTo(path, shape.module, addedFiles);
        if (added) problems.push(`${path}: imports ${added}, added in this change, which could affect existing tests`);
      }
      continue;
    }
    const names = boundNames(s.node);
    if (names.length > 0) {
      const clash = names.filter((n) => oldNames.has(n));
      if (clash.length) problems.push(`${path}: new code redefines ${clash.join(", ")}, which existing tests may use`);
      // A new version of a statement reported as changed above isn't reported twice.
      const code = names.some((n) => reported.has(n)) ? undefined : declarationLoadTimeCode(s.node, after.file);
      if (code)
        problems.push(`${path}: new code runs when the file loads (${code}), which could affect existing tests`);
      continue;
    }
    problems.push(`${path}: new ${describeStatement(s.node, after.file)} could affect existing tests`);
  }
  return problems;
}

// ---------------------------------------------------------------- YAML scenarios and fixtures

function identityOf(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  for (const key of IDENTITY_KEYS) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "string" || typeof v === "number") return `${key} ${v}`;
  }
  return undefined;
}

/** Old records kept unchanged; new records allowed. Lists of records are matched by id, skill or level. */
function additiveProblems(where: string, before: unknown, after: unknown, depth: number): string[] {
  if (Array.isArray(before) && Array.isArray(after) && before.every((v) => identityOf(v) !== undefined)) {
    const byIdentity = new Map(after.map((v) => [identityOf(v), v]));
    return before.flatMap((v) => {
      const id = identityOf(v)!;
      if (!byIdentity.has(id)) return [`${where}: the record with ${id} was removed`];
      return isDeepStrictEqual(v, byIdentity.get(id)) ? [] : [`${where}: the record with ${id} was changed`];
    });
  }
  const isMap = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v);
  if (depth === 0 && isMap(before) && isMap(after)) {
    const a = after as Record<string, unknown>;
    return Object.entries(before as Record<string, unknown>).flatMap(([key, value]) => {
      if (!(key in a)) return [`${where}: "${key}" was removed`];
      return additiveProblems(`${where} "${key}"`, value, a[key], depth + 1);
    });
  }
  return isDeepStrictEqual(before, after) ? [] : [`${where}: changed`];
}

export function yamlProblems(path: string, oldText: string, newText: string): string[] {
  let before: unknown;
  let after: unknown;
  try {
    before = parse(oldText);
    after = parse(newText);
  } catch (error) {
    return [`${path}: can't be read as YAML (${(error as Error).message.split("\n")[0]})`];
  }
  return additiveProblems(path, before, after, 0);
}

// ---------------------------------------------------------------- package.json and workflows

export function packageProblems(oldText: string, newText: string): string[] {
  type Pkg = { scripts?: Record<string, string>; awt?: { finishedMilestones?: string[] } };
  const before = JSON.parse(oldText) as Pkg;
  const after = JSON.parse(newText) as Pkg;
  const problems: string[] = [];
  // The test scripts, and every script npm runs by itself: its lifecycle
  // scripts, and pre<name>/post<name> for any script <name>.
  const names = new Set([...Object.keys(before.scripts ?? {}), ...Object.keys(after.scripts ?? {})]);
  const automatic = (name: string) =>
    NPM_LIFECYCLE.has(name) || [...names].some((other) => name === `pre${other}` || name === `post${other}`);
  for (const name of [...PROTECTED_SCRIPTS, ...[...names].filter(automatic)]) {
    if (before.scripts?.[name] !== after.scripts?.[name])
      problems.push(`package.json: the "${name}" script was changed`);
  }
  const finished = new Set(after.awt?.finishedMilestones ?? []);
  for (const m of before.awt?.finishedMilestones ?? []) {
    if (!finished.has(m))
      problems.push(`package.json: finished milestone ${m} was removed from awt.finishedMilestones`);
  }
  return problems;
}

function withoutActionVersions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutActionVersions);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        k === "uses" && typeof v === "string" ? v.replace(/@[^@]*$/, "") : withoutActionVersions(v),
      ]),
    );
  }
  return value;
}

export function sameApartFromActionVersions(oldText: string | undefined, newText: string | undefined): boolean {
  if (oldText === undefined || newText === undefined) return false;
  try {
    return isDeepStrictEqual(withoutActionVersions(parse(oldText)), withoutActionVersions(parse(newText)));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- part 2: app code

function moduleSpecifiers(path: string, source: string): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require")) {
        found.push(node.arguments[0].text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/**
 * Whether part 2 reads a repository path: the app (src/), its reference data
 * (data/) and the server code (functions/), but not functions/' packages,
 * lockfile or build output.
 */
export function isAppFile(path: string): boolean {
  if (/^(src|data)\//.test(path)) return true;
  if (!path.startsWith("functions/") || path.includes("/node_modules/")) return false;
  return !SKIPPED_IN_FUNCTIONS.includes(path.split("/")[1]!);
}

/** The entries directly in functions/ that part 2 never reads, so the check doesn't list them either. */
export const SKIPPED_IN_FUNCTIONS = ["node_modules", "lib", "package-lock.json"];

/**
 * Part 2: `files` maps the paths `isAppFile` accepts to their contents;
 * `testNames` are the made-up characters' and users' names from the fixtures.
 */
export function appCodeProblems(files: Map<string, string>, testNames: string[]): string[] {
  const problems: string[] = [];
  const namePatterns = testNames.map((n) => ({
    name: n,
    pattern: new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`),
  }));
  for (const [path, source] of files) {
    if (/^(src|functions)\//.test(path) && /\.[cm]?[jt]sx?$/.test(path)) {
      for (const spec of moduleSpecifiers(path, source)) {
        const tool = TEST_TOOLS.find((t) => spec === t || spec.startsWith(`${t}/`));
        if (tool) problems.push(`${path}: imports ${spec}, a test tool`);
        else if (/(^|\/)tests(\/|$)/.test(spec)) problems.push(`${path}: imports ${spec}, from the tests`);
      }
    }
    for (const { name, pattern } of namePatterns) {
      if (pattern.test(source)) problems.push(`${path}: names "${name}", from the test fixtures`);
    }
  }
  return problems;
}
