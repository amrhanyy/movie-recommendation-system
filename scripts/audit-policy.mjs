/**
 * Audit-policy evaluator for the approved, narrowly scoped, time-limited
 * exception to the currently unpatched `braces` advisory.
 *
 * Phase 14 — DEP-AUDIT-003 / BUG-BRACES-UNPATCHED-STACK-EXHAUSTION
 *
 * Two layers:
 *   - Layer A: `evaluateAuditPolicy` — a pure, deterministic function. No process
 *     execution, no filesystem, no network, no environment reads. Unit tests call
 *     this directly (with an injected `now`).
 *   - Layer B: the CLI wrapper, which runs `npm audit --omit=dev --json` and
 *     `npm audit --json`, feeds each result to Layer A, and exits
 *     0 (both scopes accepted), 1 (policy rejection), or 2 (configuration or
 *     internal error).
 *
 * Fail-closed by construction: the only audit state this script ever converts
 * into a zero exit is (a) a genuinely clean audit, or (b) an audit whose
 * vulnerabilities are exactly the single approved advisory, propagating to
 * exactly the approved package inventory, under an unexpired exception.
 * Everything else — extra packages, missing packages, a second advisory,
 * changed severity/CVSS/source/URL, changed installed version, malformed JSON,
 * empty output, an unexpected npm exit code, a registry/network failure, an
 * expired or invalid exception — rejects.
 */

import { spawn } from 'node:child_process';
import { readdirSync as fsReaddirSync, readFileSync, realpathSync as fsRealpathSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const EXIT_POLICY_REJECT = 1;
const EXIT_CONFIG_OR_INTERNAL = 2;

/**
 * @typedef {Object} AuditPolicyObserved
 * @property {'production'|'bare'} scope
 * @property {number|null} npmExitCode
 * @property {number|null} totalVulnerabilities
 * @property {string[]} vulnerabilityPackages
 * @property {object[]} advisoryObjects
 * @property {string|null} installedBracesVersion
 * @property {string|null} exceptionId
 * @property {string|null} exceptionExpiryDate
 * @property {boolean|null} expired
 */

/**
 * @typedef {Object} AuditPolicyResult
 * @property {boolean} accepted
 * @property {string} reasonCode
 * @property {string} summary
 * @property {AuditPolicyObserved} observed
 */

/**
 * Layer A — pure policy evaluator.
 *
 * @param {Object} input
 * @param {Record<string, unknown>|string} input.auditJson parsed or raw npm audit JSON
 * @param {number} input.npmExitCode the npm process exit code
 * @param {'production'|'bare'} input.scope which audit view is being evaluated
 * @param {object} input.exception the approved exception record
 * @param {string|number|Date} input.now the injected current time
 * @param {object|null} [input.installedVersions] resolved package versions
 * @returns {AuditPolicyResult} a structured accept/reject result
 */
export function evaluateAuditPolicy({ auditJson, npmExitCode, scope, exception, now, installedVersions }) {
  const observed = {
    scope,
    npmExitCode,
    totalVulnerabilities: null,
    vulnerabilityPackages: [],
    advisoryObjects: [],
    installedBracesVersion: null,
    exceptionId: null,
    exceptionExpiryDate: null,
    expired: null,
  };

  // --- 0. Exception schema validation (a malformed exception is a hard reject). ---
  const schemaError = validateExceptionSchema(exception);
  if (schemaError) {
    return reject('EXCEPTION_SCHEMA_INVALID', exception, observed, {
      summary: `Audit policy rejected: the exception record is invalid — ${schemaError}`,
    });
  }
  observed.exceptionId = exception.id;
  observed.exceptionExpiryDate = exception.expiryDate;

  // --- 1. Normalise and validate the audit payload. ---
  const parsed = parseAuditJson(auditJson);
  if (!parsed.ok) {
    return reject('AUDIT_JSON_MALFORMED', exception, observed, {
      summary: `Audit policy rejected (${scope} scope): the npm audit output is not usable — ${parsed.error}`,
    });
  }
  const audit = parsed.value;

  // --- 2. npm exit-code contract. ---
  if (npmExitCode !== 0 && npmExitCode !== 1) {
    return reject('NPM_UNEXPECTED_EXIT_CODE', exception, observed, {
      summary: `Audit policy rejected (${scope} scope): npm audit exited with ${npmExitCode}, which is neither a clean result (0) nor an expected vulnerabilities-found result (1).`,
    });
  }

  // --- 3. Infrastructure failure detection. A nonzero audit must be a real
  //         vulnerability result, not a registry/network/auth failure; this runs
  //         before the metadata requirement so an npm error body is classified
  //         as an infrastructure failure rather than a malformed audit. ---
  const infraError = detectInfrastructureFailure({ audit, npmExitCode });
  if (infraError) {
    return reject(infraError.code, exception, observed, {
      summary: `Audit policy rejected (${scope} scope): npm reported an infrastructure failure rather than a vulnerability result — ${infraError.detail}`,
    });
  }

  // --- 4. Required metadata must be present. ---
  const metadata = audit.metadata;
  if (!metadata || !metadata.vulnerabilities) {
    return reject('AUDIT_METADATA_MISSING', exception, observed, {
      summary: `Audit policy rejected (${scope} scope): the audit result lacks the required metadata.vulnerabilities block.`,
    });
  }

  const vulns = objectValue(audit, 'vulnerabilities') || {};
  const vulnEntries = objectEntries(vulns);
  const severityTotals = metadata.vulnerabilities;

  observed.totalVulnerabilities =
    typeof severityTotals.total === 'number' ? severityTotals.total : vulnEntries.length;

  // --- 5. Clean audit: accept without using the exception. ---
  if (
    observed.totalVulnerabilities === 0 &&
    vulnEntries.length === 0 &&
    npmExitCode === 0
  ) {
    return {
      accepted: true,
      reasonCode: 'CLEAN_AUDIT',
      summary: `Audit clean (${scope} scope): 0 vulnerabilities reported. No exception required.`,
      observed,
    };
  }

  // --- 6. Collect every concrete advisory object across all `via` arrays. ---
  const advisoryObjects = [];
  for (const [packageName, entry] of vulnEntries) {
    const via = arrayValue(entry, 'via');
    if (!Array.isArray(via)) {
      return reject('VIA_MALFORMED', exception, observed, {
        summary: `Audit policy rejected (${scope} scope): the "${packageName}" entry has a malformed "via" field (expected an array).`,
      });
    }
    for (const ref of via) {
      if (isPlainObject(ref)) {
        advisoryObjects.push(ref);
      } else if (typeof ref !== 'string') {
        return reject('VIA_MALFORMED', exception, observed, {
          summary: `Audit policy rejected (${scope} scope): the "${packageName}" entry contains a "via" reference of an unsupported type (${typeof ref}).`,
        });
      }
    }
  }
  observed.advisoryObjects = advisoryObjects;

  // --- 7. Exactly one unique concrete advisory object. ---
  const uniqueAdvisories = uniqueAdvisoryObjects(advisoryObjects);
  if (uniqueAdvisories.length === 0) {
    return reject('NO_CONCRETE_ADVISORY', exception, observed, {
      summary: `Audit policy rejected (${scope} scope): vulnerabilities are reported but no concrete advisory object was found in any "via" array.`,
    });
  }
  if (uniqueAdvisories.length > 1) {
    return reject('MULTIPLE_ADVISORY_OBJECTS', exception, observed, {
      summary: `Audit policy rejected (${scope} scope): ${uniqueAdvisories.length} distinct advisory objects were found across the "via" arrays; the approved exception covers exactly one.`,
    });
  }
  const advisory = uniqueAdvisories[0];

  // --- 8. CVE conflict detection (absence is allowed; conflict is not). ---
  const cveError = checkCveConsistency(advisory, exception);
  if (cveError) {
    return reject(cveError.code, exception, observed, { summary: cveError.detail });
  }

  // --- 9. Advisory identity, severity, and CVSS must match the exception exactly. ---
  const advisoryError = checkAdvisoryIdentity(advisory, exception);
  if (advisoryError) {
    return reject(advisoryError.code, exception, observed, { summary: advisoryError.detail });
  }

  // --- 10. The affected package's installed version must be exactly the recorded one. ---
  const resolvedVersions = resolveInstalledVersions(installedVersions, audit);
  const versionError = checkInstalledVersion(advisory, vulnEntries, exception, resolvedVersions);
  if (versionError) {
    return reject(versionError.code, exception, observed, { summary: versionError.detail });
  }

  // --- 11. Every vulnerability package entry must be in the approved set. ---
  const scopeKey = scope === 'production' ? 'allowedProductionPackages' : 'allowedBarePackages';
  const allowed = arrayValue(exception, scopeKey);
  if (!Array.isArray(allowed) || allowed.length === 0) {
    return reject('EXCEPTION_SCHEMA_INVALID', exception, observed, {
      summary: `Audit policy rejected: the exception record has no "${scopeKey}" array for the "${scope}" scope.`,
    });
  }
  const allowedSet = new Set(allowed);
  const observedPackages = vulnEntries.map(([name]) => name);
  observed.vulnerabilityPackages = observedPackages;

  const unexpected = observedPackages.filter((name) => !allowedSet.has(name));
  if (unexpected.length > 0) {
    return reject('UNEXPECTED_VULNERABLE_PACKAGE', exception, observed, {
      summary: `Audit policy rejected (${scope} scope): additional vulnerable package entries are present that the exception does not cover: ${sortedList(unexpected)}.`,
    });
  }
  const observedSet = new Set(observedPackages);
  const expectedMissing = allowed.filter((name) => !observedSet.has(name));
  if (expectedMissing.length > 0) {
    return reject('MISSING_EXPECTED_PACKAGE', exception, observed, {
      summary: `Audit policy rejected (${scope} scope): expected package entries are absent from the audit: ${sortedList(expectedMissing)}.`,
    });
  }

  // --- 12. Every severity on every entry must equal the recorded severity. ---
  for (const [packageName, entry] of vulnEntries) {
    const sev = entry && typeof entry.severity === 'string' ? entry.severity : null;
    if (sev !== exception.severity) {
      return reject('SEVERITY_MISMATCH', exception, observed, {
        summary: `Audit policy rejected (${scope} scope): the "${packageName}" entry has severity "${sev}"; the exception covers only "${exception.severity}".`,
      });
    }
  }

  // --- 13. Every non-object `via` reference must resolve to a package inside the approved set. ---
  for (const [packageName, entry] of vulnEntries) {
    const via = arrayValue(entry, 'via');
    for (const ref of via) {
      if (typeof ref === 'string' && !allowedSet.has(ref)) {
        return reject('VIA_PACKAGE_NOT_ALLOWED', exception, observed, {
          summary: `Audit policy rejected (${scope} scope): the "${packageName}" entry references "${ref}" via a package name; that package is not in the approved set for this scope.`,
        });
      }
    }
  }

  // --- 14. Metadata severity totals must be exactly the expected composition. ---
  const totalsError = checkSeverityTotals(severityTotals, vulnEntries.length, scope, exception);
  if (totalsError) {
    return reject(totalsError.code, exception, observed, { summary: totalsError.detail });
  }

  // --- 15. Expiry: reject strictly after the recorded timestamp. ---
  const nowMs = normaliseTime(now);
  const expiryMs = normaliseTime(exception.expiryDate);
  if (!Number.isFinite(expiryMs)) {
    return reject('EXCEPTION_SCHEMA_INVALID', exception, observed, {
      summary: 'Audit policy rejected: the exception record has an unparseable expiryDate.',
    });
  }
  observed.expired = nowMs > expiryMs;
  if (observed.expired) {
    return reject('EXCEPTION_EXPIRED', exception, observed, {
      summary: `Audit policy rejected: the exception expired on ${exception.expiryDate}. Human review is required. The gate will remain red until the advisory is remediated or a new exception is authorized with fresh evidence.`,
    });
  }

  // --- 16. All checks passed: the audit is exactly the approved accepted risk. ---
  return {
    accepted: true,
    reasonCode: 'EXCEPTION_APPLIED',
    summary: [
      `Accepted risk (${scope} scope): the audit reports exactly one approved advisory — ${exception.advisory} (${exception.cve}) on ${exception.package}@${exception.affectedVersion}, severity ${exception.severity}, CVSS ${exception.cvssScore}.`,
      `Expiry: ${exception.expiryDate}. Review cadence: every ${exception.reviewCadenceDays} days. This exception does not declare the package safe; the vulnerability is real and remains unpatched.`,
    ].join(' '),
    observed,
  };
}

/* -------------------------------------------------------------------------
 * Layer B — CLI wrapper.
 * ------------------------------------------------------------------------- */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const EXCEPTION_PATH = path.join(REPO_ROOT, 'config', 'audit-exceptions.json');

const SCOPES = [
  { name: 'production', args: ['audit', '--omit=dev', '--json'] },
  { name: 'bare', args: ['audit', '--json'] },
];

/**
 * Run one `npm audit` invocation without a shell and return a captured result.
 * No user-controlled value is interpolated into the command. When the resolved
 * npm entry point is a JavaScript file it is executed through the current Node
 * executable, because `child_process.spawn` cannot launch a `.js` file directly
 * on Windows.
 *
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string, exitCode: number|null, error: string|null }>}
 */
export function runNpmAudit({ npmPath, args, cwd }) {
  return new Promise((resolve) => {
    const command = resolveNpmCommand(npmPath, args);
    let child;
    try {
      child = spawn(command.executable, command.arguments, { cwd, shell: false, encoding: 'utf8' });
    } catch (err) {
      resolve({ ok: false, stdout: '', stderr: String(err && err.message ? err.message : err), exitCode: null, error: 'spawn-failed' });
      return;
    }
    if (!child || typeof child.stdout !== 'object') {
      resolve({ ok: false, stdout: '', stderr: '', exitCode: null, error: 'spawn-failed' });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (err) => {
      resolve({ ok: false, stdout, stderr: appendError(stderr, err), exitCode: null, error: 'process-error' });
    });
    child.on('close', (code, signal) => {
      if (signal) {
        resolve({ ok: false, stdout, stderr: appendError(stderr, new Error(`npm process terminated by signal ${signal}`)), exitCode: null, error: 'signal' });
        return;
      }
      resolve({ ok: true, stdout, stderr, exitCode: code === null ? null : code, error: null });
    });
  });
}

function resolveNpmCommand(npmPath, args) {
  if (typeof npmPath === 'string' && npmPath.toLowerCase().endsWith('.js')) {
    return { executable: process.execPath, arguments: [npmPath, ...args] };
  }
  return { executable: npmPath, arguments: args };
}

async function main() {
  let exception;
  try {
    exception = JSON.parse(readFileSync(EXCEPTION_PATH, 'utf8'));
  } catch (err) {
    console.error(`Audit policy: the exception record at ${EXCEPTION_PATH} could not be read or parsed: ${describeError(err)}`);
    process.exitCode = EXIT_CONFIG_OR_INTERNAL;
    return;
  }

  const schemaError = validateExceptionSchema(exception);
  if (schemaError) {
    console.error(`Audit policy: the exception record at ${EXCEPTION_PATH} is invalid: ${schemaError}`);
    process.exitCode = EXIT_CONFIG_OR_INTERNAL;
    return;
  }

  const npmPath = resolveNpmPath();
  if (!npmPath) {
    console.error('Audit policy: no npm executable could be resolved for this platform.');
    process.exitCode = EXIT_CONFIG_OR_INTERNAL;
    return;
  }

  // Installed versions are resolved from the committed dependency tree, not from
  // the advisory metadata (npm audit does not report per-node versions).
  const lockfilePath = path.join(REPO_ROOT, 'package-lock.json');
  let installedVersions = null;
  try {
    installedVersions = readInstalledVersions(lockfilePath);
  } catch (err) {
    console.error(`Audit policy: the dependency tree at ${lockfilePath} could not be read: ${describeError(err)}`);
    process.exitCode = EXIT_CONFIG_OR_INTERNAL;
    return;
  }

  const now = new Date();
  let failures = 0;

  for (const scope of SCOPES) {
    const result = await runNpmAudit({ npmPath, args: scope.args, cwd: REPO_ROOT });

    if (!result.ok) {
      // Spawn/process failure: the CLI boundary reports the rejection.
      console.error(`Audit policy (${scope.name} scope): the npm audit command could not run — ${result.error}.`);
      console.error(indentStderr(result.stderr));
      failures += 1;
      continue;
    }

    if (result.stdout.length === 0) {
      console.error(`Audit policy (${scope.name} scope): npm audit produced no output.`);
      console.error(indentStderr(result.stderr));
      failures += 1;
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (err) {
      console.error(`Audit policy (${scope.name} scope): npm audit output is not valid JSON: ${describeError(err)}`);
      failures += 1;
      continue;
    }

    const evaluation = evaluateAuditPolicy({
      auditJson: parsed,
      npmExitCode: result.exitCode,
      scope: scope.name,
      exception,
      now,
      installedVersions,
    });

    if (evaluation.accepted) {
      if (evaluation.reasonCode === 'EXCEPTION_APPLIED') {
        const version = installedVersions[exception.package];
        console.warn(`Warning: ${evaluation.summary}`);
        console.warn(
          `Warning: ${exception.package} installed version resolved from the dependency tree: ${version}. Expiry: ${exception.expiryDate}. Owner: ${exception.owner}.`,
        );
      } else {
        console.log(`Audit policy (${scope.name} scope): ${evaluation.summary}`);
      }
    } else {
      console.error(`Audit policy (${scope.name} scope): ${evaluation.summary}`);
      if (result.stderr && result.stderr.trim().length > 0) {
        console.error(indentStderr(result.stderr));
      }
      failures += 1;
    }
  }

  if (failures > 0) {
    console.error(`Audit policy: ${failures} of ${SCOPES.length} scope(s) rejected. This gate fails closed.`);
    process.exitCode = EXIT_POLICY_REJECT;
    return;
  }
  console.log('Audit policy: all scopes accepted.');
}

/**
 * Resolve the npm executable/CLI entry point for the current platform. Pure
 * with respect to the audit policy itself (used only by the CLI wrapper);
 * exported for diagnostics and tests.
 */
export function resolveNpmPath() {
  // Prefer an explicit override only when it is a path to an executable; no
  // unvalidated value is ever interpolated into a command.
  const candidate = process.env && process.env.NPM_PATH ? process.env.NPM_PATH : null;
  if (candidate && candidate.length > 0 && !candidate.includes(' ')) {
    return candidate;
  }
  if (process.platform !== 'win32') {
    return 'npm';
  }
  // Windows: the `npm.cmd` shim cannot be spawned without a shell, so resolve
  // the CLI entry point the shim would execute. `npm_execpath` is correct when
  // npm launched this process; otherwise search the standard install layouts.
  const execPath = process.env && process.env.npm_execpath;
  if (typeof execPath === 'string' && execPath.length > 0 && fileExists(execPath)) {
    return execPath;
  }
  // Prefer the running Node's own directory first (where npm lives in a normal
  // install), then the standard Windows install roots, then the tool-tree
  // siblings of the runtime directory (for bundled runtimes that ship without
  // npm — e.g. a Playwright-Go Node 22 next to a node-26 tree that has npm).
  const nodeDir = path.dirname(process.execPath);
  const found = findNpmCli(nodeDir);
  if (found) return found;
  for (const root of windowsSearchRoots()) {
    const located = findNpmCli(root);
    if (located) return located;
  }
  return path.join(nodeDir, NPM_CLI_RELATIVE);
}

function windowsSearchRoots() {
  const roots = [];
  const nodeDir = path.dirname(process.execPath);
  // Sibling tool distributions can ship npm in a *different* directory than the
  // running Node executable, so search the runtime's parent directory and its
  // siblings before falling back to the system roots.
  roots.push(path.dirname(nodeDir));
  for (const name of ['LOCALAPPDATA', 'APPDATA', 'ProgramFiles', 'ProgramFiles(x86)']) {
    const value = process.env ? process.env[name] : null;
    if (typeof value === 'string' && value.length > 0 && !roots.includes(value)) roots.push(value);
  }
  return roots;
}

const NPM_CLI_RELATIVE = path.join('node_modules', 'npm', 'bin', 'npm-cli.js');
const NPM_VERSION_CLI_RELATIVE = path.join('bin', 'npm-cli.js');
// Never descend into these trees: they contain no npm CLI and are large.
const SEARCH_SKIP_DIRS = new Set([
  '.git',
  '.next',
  'coverage',
  'Temp',
  'Packages',
  'Microsoft',
  'browsers',
  'browser_patches',
  'ffmpeg',
  'chromium',
  'chromium-1208',
  'agent-browser-0.26.0-win32-x64',
  'cua-driver-0.21.0-win32-x64',
  'git-2.53.0+3-win32-x64',
  'npm-12.0.2-win32-x64',
]);

/**
 * Locate an npm CLI entry point with a bounded, read-only walk. Needed because
 * some bundled Node runtimes (e.g. the Playwright-Go distribution used here for
 * Node 22 validation) ship without npm, while a sibling tool tree on the same
 * machine does. The walk is capped so it cannot scan the whole filesystem and
 * skips known irrelevant trees, but it does descend into `node_modules`
 * directories, because some distributions ship npm one or two levels below the
 * tool root (e.g. `<tools>/node-26.7.0-win32-x64/node_modules/npm/bin/npm-cli.js`).
 */
function findNpmCli(root) {
  let rootPath = root;
  try {
    rootPath = fsRealpathSync(root);
  } catch {
    return null;
  }
  const stack = [rootPath];
  let visited = 0;
  while (stack.length > 0 && visited < 1000) {
    const dir = stack.pop();
    visited += 1;
    const candidates = [
      path.join(dir, NPM_CLI_RELATIVE),
      path.join(dir, NPM_VERSION_CLI_RELATIVE),
    ];
    for (const candidate of candidates) {
      if (fileExists(candidate)) return candidate;
    }
    let entries = [];
    try {
      entries = fsReaddirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || SEARCH_SKIP_DIRS.has(entry.name)) continue;
      stack.push(path.join(dir, entry.name));
    }
  }
  return null;
}

/* -------------------------------------------------------------------------
 * Shared validation helpers (used by both layers; all pure).
 * ------------------------------------------------------------------------- */

const REQUIRED_EXCEPTION_FIELDS = [
  'schemaVersion',
  'id',
  'advisory',
  'cve',
  'npmAuditSource',
  'package',
  'affectedVersion',
  'severity',
  'cvssScore',
  'cvssVector',
  'allowedProductionPackages',
  'allowedBarePackages',
  'owner',
  'rationale',
  'approvalDate',
  'expiryDate',
  'reviewCadenceDays',
  'reviewInstructions',
  'upstreamLinks',
];

function validateExceptionSchema(exception) {
  if (!isPlainObject(exception)) {
    return 'the record must be a JSON object';
  }
  for (const field of REQUIRED_EXCEPTION_FIELDS) {
    if (!(field in exception) || exception[field] === null || exception[field] === undefined) {
      return `the required field "${field}" is missing`;
    }
  }
  const str = (name) =>
    typeof exception[name] !== 'string' || exception[name].trim().length === 0
      ? `the field "${name}" must be a non-empty string`
      : null;
  for (const name of ['id', 'advisory', 'cve', 'package', 'affectedVersion', 'severity', 'owner', 'approvalDate', 'expiryDate', 'cvssVector']) {
    const err = str(name);
    if (err) return err;
  }
  if (!Number.isFinite(exception.npmAuditSource)) {
    return 'the field "npmAuditSource" must be a number';
  }
  if (!Number.isFinite(exception.cvssScore)) {
    return 'the field "cvssScore" must be a number';
  }
  if (!Array.isArray(exception.allowedProductionPackages) || exception.allowedProductionPackages.length === 0) {
    return 'the field "allowedProductionPackages" must be a non-empty array';
  }
  if (!Array.isArray(exception.allowedBarePackages) || exception.allowedBarePackages.length === 0) {
    return 'the field "allowedBarePackages" must be a non-empty array';
  }
  if (!Number.isFinite(exception.reviewCadenceDays)) {
    return 'the field "reviewCadenceDays" must be a number';
  }
  if (!Array.isArray(exception.upstreamLinks) || exception.upstreamLinks.length === 0) {
    return 'the field "upstreamLinks" must be a non-empty array';
  }
  if (Number.isFinite(normaliseTime(exception.expiryDate)) === false) {
    return 'the field "expiryDate" is not a parseable date';
  }
  return null;
}

function checkAdvisoryIdentity(advisory, exception) {
  if (advisory.source !== exception.npmAuditSource) {
    return {
      code: 'ADVISORY_SOURCE_MISMATCH',
      detail: `The advisory's npm audit source is ${JSON.stringify(advisory.source)}; the exception records ${JSON.stringify(exception.npmAuditSource)}.`,
    };
  }
  const advisoryName = typeof advisory.dependency === 'string' ? advisory.dependency : advisory.name;
  if (advisoryName !== exception.package) {
    return {
      code: 'ADVISORY_PACKAGE_MISMATCH',
      detail: `The advisory's resolved package is "${advisoryName}"; the exception records "${exception.package}".`,
    };
  }
  if (typeof advisory.url !== 'string' || !advisory.url.endsWith(exception.advisory)) {
    return {
      code: 'ADVISORY_URL_MISMATCH',
      detail: `The advisory URL is ${JSON.stringify(advisory.url)}; the exception covers ${exception.advisory}.`,
    };
  }
  if (advisory.severity !== exception.severity) {
    return {
      code: 'ADVISORY_SEVERITY_MISMATCH',
      detail: `The advisory severity is "${advisory.severity}"; the exception covers "${exception.severity}".`,
    };
  }
  const score = extractCvssScore(advisory);
  if (!sameNumber(score, exception.cvssScore)) {
    return {
      code: 'CVSS_SCORE_MISMATCH',
      detail: `The advisory CVSS score is ${JSON.stringify(score)}; the exception records ${exception.cvssScore}.`,
    };
  }
  const vector = extractCvssVector(advisory);
  if (vector !== exception.cvssVector) {
    return {
      code: 'CVSS_VECTOR_MISMATCH',
      detail: `The advisory CVSS vector is ${JSON.stringify(vector)}; the exception records ${JSON.stringify(exception.cvssVector)}.`,
    };
  }
  if (!rangeIncludes(advisory.range, exception.affectedVersion)) {
    return {
      code: 'AFFECTED_VERSION_OUT_OF_RANGE',
      detail: `The advisory's vulnerable range is ${JSON.stringify(advisory.range)} and does not include the recorded affected version ${exception.affectedVersion}.`,
    };
  }
  return null;
}

/**
 * Resolve installed package versions, in this priority order:
 *   1. an explicit `installedVersions` map (injected by unit tests or by a caller
 *      that has already read the lockfile);
 *   2. a `lockfile` object carried inside the audit payload (an injected fixture);
 *   3. `audit.packages` (npm audit v3 shape) — the dependency tree npm itself
 *      resolved, which is the production CLI's source of truth.
 */
function resolveInstalledVersions(installedVersions, audit) {
  if (isPlainObject(installedVersions)) {
    return installedVersions;
  }
  if (isPlainObject(audit) && isPlainObject(audit.lockfile)) {
    const fromLockfile = collectLockfileVersions(audit.lockfile);
    if (Object.keys(fromLockfile).length > 0) return fromLockfile;
  }
  if (isPlainObject(audit) && isPlainObject(audit.packages)) {
    return collectAuditPackagesVersions(audit.packages);
  }
  return {};
}

function collectLockfileVersions(lockfile) {
  const versions = {};
  const packages = objectValue(lockfile, 'packages');
  if (isPlainObject(packages)) {
    for (const [key, entry] of Object.entries(packages)) {
      if (key === '') continue; // the root project entry
      const name = lockfilePackageName(key);
      if (name && entry && typeof entry.version === 'string') {
        versions[name] = entry.version;
      }
    }
  }
  // Lockfile v2 (`dependencies`) nested tree: record the hoisted top-level copy
  // for each name, plus any nested copy so nothing is missed.
  const dependencies = objectValue(lockfile, 'dependencies');
  if (isPlainObject(dependencies)) {
    collectLockfileV2Dependencies(dependencies, versions);
  }
  return versions;
}

function collectLockfileV2Dependencies(dependencies, versions) {
  for (const [name, entry] of Object.entries(dependencies)) {
    if (!isPlainObject(entry)) continue;
    if (typeof entry.version === 'string' && !(name in versions)) {
      versions[name] = entry.version;
    }
    const nested = objectValue(entry, 'dependencies');
    if (isPlainObject(nested)) {
      collectLockfileV2Dependencies(nested, versions);
    }
  }
}

function collectAuditPackagesVersions(packages) {
  const versions = {};
  for (const [key, entry] of Object.entries(packages)) {
    const name = lockfilePackageName(key);
    if (name && entry && typeof entry.version === 'string') {
      versions[name] = entry.version;
    }
  }
  return versions;
}

/**
 * npm lockfile v3 keys are `node_modules/<name>` (or bare `node_modules/<nested
 * path>/node_modules/<name>`); the package name is the final path segment.
 */
function lockfilePackageName(key) {
  if (typeof key !== 'string') return null;
  if (key === '') return null;
  const normalized = key.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index === -1 ? normalized : normalized.slice(index + 1);
}

function checkInstalledVersion(advisory, vulnEntries, exception, resolvedVersions) {
  const entry = vulnEntries.find(([, candidate]) => candidate && candidate.name === exception.package);
  if (!entry) {
    return {
      code: 'INSTALLED_VERSION_UNRESOLVED',
      detail: `The package "${exception.package}" was expected in the vulnerability map but is absent.`,
    };
  }
  // The single hoisted physical copy is reported at node_modules/<package>.
  const nodes = arrayValue(entry[1], 'nodes');
  const physical = nodes.filter((node) => node === `node_modules/${exception.package}`);
  if (physical.length === 0) {
    return {
      code: 'INSTALLED_VERSION_UNRESOLVED',
      detail: `No physical copy of "${exception.package}" was found at node_modules/${exception.package}; reported nodes: ${sortedList(nodes)}.`,
    };
  }
  // The version resolved from the dependency tree must be exactly the recorded
  // one. A different flagged version is version drift, not an accepted state.
  const version = isPlainObject(resolvedVersions) ? resolvedVersions[exception.package] : undefined;
  if (typeof version !== 'string' || version.length === 0) {
    return {
      code: 'INSTALLED_VERSION_UNRESOLVED',
      detail: `The installed version of "${exception.package}" could not be resolved from the dependency tree.`,
    };
  }
  if (version !== exception.affectedVersion) {
    return {
      code: 'INSTALLED_VERSION_DRIFT',
      detail: `The dependency tree resolves "${exception.package}" to ${JSON.stringify(version)}; the exception records ${exception.affectedVersion}.`,
    };
  }
  return null;
}

function checkCveConsistency(advisory, exception) {
  const candidates = [
    advisory.cve,
    advisory.cwe && advisory.cwe.cve,
    advisory.cvss && advisory.cvss.cve,
  ].filter((value) => typeof value === 'string' && value.trim().length > 0);
  const aliases = arrayValue(advisory, 'aliases')
    .concat(arrayValue(advisory, 'identifiers'))
    .filter((value) => typeof value === 'string' && value.trim().length > 0);
  const present = new Set([...candidates, ...aliases].map((value) => value.trim()));
  for (const value of present) {
    if (looksLikeCve(value) && value !== exception.cve) {
      return {
        code: 'CVE_CONFLICT',
        detail: `The audit result explicitly references ${value}, which conflicts with the exception's recorded CVE ${exception.cve}.`,
      };
    }
  }
  return null;
}

function checkSeverityTotals(severityTotals, entryCount, scope, exception) {
  const expected = severityTotals.total;
  if (typeof expected !== 'number' || expected !== entryCount) {
    return {
      code: 'METADATA_TOTAL_MISMATCH',
      detail: `The metadata reports a total of ${JSON.stringify(expected)} vulnerabilities while ${entryCount} package entries are present (${scope} scope).`,
    };
  }
  const forbidden = ['info', 'low', 'moderate', 'critical'];
  const found = forbidden.filter((level) => severityTotals[level] !== 0 && severityTotals[level] !== undefined && severityTotals[level] !== null);
  if (found.length > 0) {
    return {
      code: 'SEVERITY_TOTALS_NONHIGH',
      detail: `The metadata reports non-high severity counts: ${found.map((level) => `${level} = ${severityTotals[level]}`).join(', ')} (${scope} scope).`,
    };
  }
  if (severityTotals.high !== expected) {
    return {
      code: 'SEVERITY_TOTALS_MISMATCH',
      detail: `The metadata reports high = ${severityTotals.high} while total = ${expected} (${scope} scope); every finding must be ${exception.severity}.`,
    };
  }
  return null;
}

/**
 * Distinguish a genuine vulnerability result from an npm/registry failure.
 * npm prints a JSON error body (with `error.code`) or an E* message to stderr
 * when the registry is unreachable or authentication fails; a real audit result
 * has `auditReportVersion` and a `metadata` block.
 */
function detectInfrastructureFailure({ audit, npmExitCode }) {
  if (npmExitCode === 0) {
    return null; // A clean result is never an infrastructure failure.
  }
  if (isPlainObject(audit.error) || audit.errorCode) {
    return {
      code: 'NPM_INFRASTRUCTURE_FAILURE',
      detail: `npm reported an error result (code ${JSON.stringify((audit.error && audit.error.code) || audit.errorCode)}).`,
    };
  }
  if (audit.auditReportVersion === undefined && !audit.metadata) {
    return {
      code: 'NPM_INFRASTRUCTURE_FAILURE',
      detail: 'the result has neither an audit report version nor metadata, so it is not a vulnerability result.',
    };
  }
  return null;
}

function parseAuditJson(auditJson) {
  if (isPlainObject(auditJson)) {
    return { ok: true, value: auditJson };
  }
  if (typeof auditJson !== 'string') {
    return { ok: false, error: 'the audit payload is neither parsed JSON nor a JSON string' };
  }
  if (auditJson.trim().length === 0) {
    return { ok: false, error: 'the audit output is empty' };
  }
  try {
    const value = JSON.parse(auditJson);
    if (!isPlainObject(value)) {
      return { ok: false, error: 'the parsed audit JSON is not an object' };
    }
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

/* -------------------------------------------------------------------------
 * Small utilities (pure, dependency-free).
 * ------------------------------------------------------------------------- */

/**
 * Read a lockfile and return a package-name → version map for the hoisted
 * (top-level `node_modules/<name>`) physical copies. Lockfile v3 keys are used
 * as-is; lockfile v2 `dependencies` are walked collecting the hoisted copies.
 * Exported for unit tests.
 */
export function readInstalledVersions(lockfilePath) {
  const text = readFileSync(lockfilePath, 'utf8');
  const lockfile = JSON.parse(text);
  return resolveInstalledVersions(null, { lockfile });
}

function fileExists(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function reject(reasonCode, exception, observed, detail) {
  return {
    accepted: false,
    reasonCode,
    summary: detail.summary,
    observed,
  };
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayValue(object, key) {
  if (!isPlainObject(object)) return [];
  const value = object[key];
  return Array.isArray(value) ? value : [];
}

function objectValue(object, key) {
  if (!isPlainObject(object)) return undefined;
  return object[key];
}

function objectEntries(value) {
  if (!isPlainObject(value)) return [];
  return Object.entries(value);
}

function extractCvssScore(advisory) {
  if (isPlainObject(advisory.cvss) && Number.isFinite(advisory.cvss.score)) {
    return advisory.cvss.score;
  }
  if (Number.isFinite(advisory.cvss)) {
    return advisory.cvss;
  }
  if (Number.isFinite(advisory.cvssScore)) {
    return advisory.cvssScore;
  }
  return null;
}

function extractCvssVector(advisory) {
  if (isPlainObject(advisory.cvss) && typeof advisory.cvss.vectorString === 'string') {
    return advisory.cvss.vectorString;
  }
  if (typeof advisory.vectorString === 'string') {
    return advisory.vectorString;
  }
  if (typeof advisory.cvssVector === 'string') {
    return advisory.cvssVector;
  }
  return null;
}

function sameNumber(a, b) {
  return Number(a) === Number(b);
}

/**
 * The audit reports the vulnerable range as an npm semver range (e.g. `<=3.0.3`).
 * Accept only the exact recorded version, and require it to be included in the
 * range. A different flagged version is version drift, not an accepted state.
 */
function rangeIncludes(range, version) {
  if (typeof range !== 'string' || typeof version !== 'string') return false;
  const text = range.trim();
  if (text.length === 0) return false;
  const comparators = text.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
  if (comparators.length === 0) return false;
  return comparators.every((comparator) => satisfiesComparator(comparator, version));
}

function satisfiesComparator(comparator, version) {
  const match = /^(<=|>=|<|>|=)?\s*(.+)$/.exec(comparator);
  if (!match) return false;
  const operator = match[1] || '=';
  const bound = match[2].trim();
  const comparison = compareVersions(version, bound);
  switch (operator) {
    case '<=':
      return comparison <= 0;
    case '>=':
      return comparison >= 0;
    case '<':
      return comparison < 0;
    case '>':
      return comparison > 0;
    default:
      return comparison === 0;
  }
}

function compareVersions(a, b) {
  const partsA = String(a).split('.');
  const partsB = String(b).split('.');
  const length = Math.max(partsA.length, partsB.length);
  for (let index = 0; index < length; index += 1) {
    const left = partsA[index] !== undefined ? String(partsA[index]) : '0';
    const right = partsB[index] !== undefined ? String(partsB[index]) : '0';
    const leftNum = Number(left);
    const rightNum = Number(right);
    if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
      if (leftNum < rightNum) return -1;
      if (leftNum > rightNum) return 1;
    } else {
      if (left < right) return -1;
      if (left > right) return 1;
    }
  }
  return 0;
}

function looksLikeCve(value) {
  return /^CVE-\d{4}-\d+$/i.test(String(value).trim());
}

function uniqueAdvisoryObjects(advisories) {
  const seen = new Set();
  const unique = [];
  for (const advisory of advisories) {
    const key = JSON.stringify(advisory);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(advisory);
    }
  }
  return unique;
}

function normaliseTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.NaN : parsed;
  }
  return Number.NaN;
}

function sortedList(items) {
  return Array.from(items)
    .map((item) => String(item))
    .sort()
    .join(', ');
}

function describeError(err) {
  if (!err) return 'unknown error';
  if (err instanceof Error) return err.message;
  return String(err);
}

function appendError(stderr, err) {
  const message = describeError(err);
  return stderr && stderr.length > 0 ? `${stderr}\n${message}` : message;
}

function indentStderr(stderr) {
  if (!stderr || stderr.trim().length === 0) return '';
  return stderr
    .split(/\r?\n/)
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join('\n');
}

/* -------------------------------------------------------------------------
 * Entry point.
 * ------------------------------------------------------------------------- */

main().catch((err) => {
  console.error(`Audit policy: an internal error occurred: ${describeError(err)}`);
  process.exitCode = EXIT_CONFIG_OR_INTERNAL;
});
