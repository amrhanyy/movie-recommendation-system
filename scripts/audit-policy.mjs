#!/usr/bin/env node
/**
 * Phase 16B audit policy gate (DEP-AUDIT-005).
 *
 * Policy: PRODUCTION CLEAN + ONE DEV-ONLY TEMPORARY EXCEPTION.
 *
 * - The production scope must be completely clean. A clean production audit is
 *   accepted as CLEAN_AUDIT without ever consulting the exception. A bare
 *   exception can never accept production findings (scope gate).
 * - The bare scope may accept exactly the approved dev-only exception record.
 *   Any other advisory, package, version, scope, or vulnerable inventory
 *   rejects fail-closed.
 *
 * Evaluator (pure):
 *   - scope-aware evaluation (J1)
 *   - severity parameterized by the exception's recorded severity (J2)
 *   - nullable CVSS vector, exact match, never a wildcard (J3)
 *   - exact npm-feed CVSS score comparison (J4)
 *   - clean-audit path without an exception (J5)
 *   - fail-closed on every mutation listed in J6
 *   - multi-copy version resolution keyed by the exact install node path
 *     the audit flagged (F2), so a hoisted vulnerable copy is never confused
 *     with a patched nested copy of the same package name.
 *
 * CLI infrastructure (K):
 *   - resolveNpmPath accepts NPM_PATH values containing spaces, never uses
 *     shell interpolation (spawn argument array, no shell), validates that
 *     the candidate is an existing file, and falls back in the fixed order:
 *     validated NPM_PATH -> validated npm_execpath -> npm adjacent to
 *     process.execPath -> common direct prefix candidates -> bounded
 *     breadth-first filesystem search. No local-machine hard-coded path.
 *   - Infrastructure failures (npm cannot run, no output, unexpected exit
 *     code, registry error body) exit with EXIT_CONFIG_OR_INTERNAL = 2.
 *   - Policy rejection exits with 1. Success exits with 0.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const NPM_AUDIT_TIMEOUT_MS = 180000;
const NPM_STDOUT_LIMIT_BYTES = 10 * 1024 * 1024;
const NPM_CLI_FILENAME = 'npm-cli.js';
const NPM_CLI_RELATIVE = path.join('node_modules', 'npm', 'bin', NPM_CLI_FILENAME);
export const NPM_SEARCH_VISIT_CAP = 1000;

export const SCOPES = Object.freeze(['production', 'bare']);
const NPM_AUDIT_ARGS = Object.freeze({
  production: ['audit', '--omit=dev', '--json'],
  bare: ['audit', '--json'],
});

const EXIT_SUCCESS = 0;
const EXIT_POLICY_REJECTED = 1;
const EXIT_CONFIG_OR_INTERNAL = 2;

const SEVERITY_LEVELS = Object.freeze(['info', 'low', 'moderate', 'high', 'critical']);
const SCOPE_VALUES = Object.freeze(['production', 'bare']);

const REQUIRED_EXCEPTION_FIELDS = Object.freeze([
  'id',
  'scope',
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
  'approvalDate',
  'expiryDate',
  'reviewCadenceDays',
  'owner',
  'rationale',
  'reviewInstructions',
  'upstreamLinks',
]);

/**
 * Directories never enqueued by the bounded BFS fallback. Only the git
 * object database is skipped: npm-cli.js can only live under a node install
 * (including node_modules trees), so node_modules itself must be traversed.
 */
const BFS_SKIP_DIRS = new Set(['.git']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function objectValue(object, key) {
  return isPlainObject(object) && isPlainObject(object[key]) ? object[key] : null;
}

function arrayValue(object, key) {
  return isPlainObject(object) && Array.isArray(object[key]) ? object[key] : null;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidHttpUrl(value) {
  if (!nonEmptyString(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Phase 16B exception schema (J3):
 * - `scope` must be exactly 'production' or 'bare'.
 * - `cvssVector` must be null or a non-empty string (never an empty string).
 * - both allowed-package lists must be arrays of unique non-empty strings;
 *   the list for the exception's own scope must be non-empty (an exception
 *   that authorizes nothing in its governed scope is meaningless), while the
 *   other scope's list may be empty (that scope must stay clean).
 */
export function validateExceptionSchema(exception) {
  const errors = [];
  if (!isPlainObject(exception)) {
    return ['exception record must be a JSON object'];
  }

  for (const field of REQUIRED_EXCEPTION_FIELDS) {
    if (!(field in exception)) {
      errors.push(`missing required field '${field}'`);
    }
  }
  if (errors.length > 0) {
    return errors;
  }

  const requiredStringFields = [
    'id',
    'advisory',
    'cve',
    'package',
    'affectedVersion',
    'owner',
    'rationale',
    'reviewInstructions',
  ];
  for (const field of requiredStringFields) {
    if (!nonEmptyString(exception[field])) {
      errors.push(`field '${field}' must be a non-empty string`);
    }
  }

  if (!SCOPE_VALUES.includes(exception.scope)) {
    errors.push(`field 'scope' must be one of: ${SCOPE_VALUES.join(', ')} (got ${JSON.stringify(exception.scope)})`);
  }
  if (!SEVERITY_LEVELS.includes(exception.severity)) {
    errors.push(`field 'severity' must be one of: ${SEVERITY_LEVELS.join(', ')} (got ${JSON.stringify(exception.severity)})`);
  }
  if (!Number.isInteger(exception.npmAuditSource) || exception.npmAuditSource <= 0) {
    errors.push(`field 'npmAuditSource' must be a positive integer (got ${JSON.stringify(exception.npmAuditSource)})`);
  }
  if (typeof exception.cvssScore !== 'number' || !Number.isFinite(exception.cvssScore)) {
    errors.push(`field 'cvssScore' must be a finite number (got ${JSON.stringify(exception.cvssScore)})`);
  }
  if (exception.cvssVector !== null && !nonEmptyString(exception.cvssVector)) {
    errors.push(`field 'cvssVector' must be null or a non-empty string (got ${JSON.stringify(exception.cvssVector)})`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(exception.approvalDate ?? ''))) {
    errors.push(`field 'approvalDate' must be an ISO calendar date YYYY-MM-DD (got ${JSON.stringify(exception.approvalDate)})`);
  }
  if (Number.isNaN(Date.parse(String(exception.expiryDate ?? '')))) {
    errors.push(`field 'expiryDate' must be a parseable ISO timestamp (got ${JSON.stringify(exception.expiryDate)})`);
  }
  if (!Number.isInteger(exception.reviewCadenceDays) || exception.reviewCadenceDays < 1) {
    errors.push(`field 'reviewCadenceDays' must be an integer >= 1 (got ${JSON.stringify(exception.reviewCadenceDays)})`);
  }

  const governedList =
    exception.scope === 'production' ? exception.allowedProductionPackages : exception.allowedBarePackages;
  const governedName =
    exception.scope === 'production' ? 'allowedProductionPackages' : 'allowedBarePackages';
  if (!Array.isArray(governedList) || governedList.length === 0) {
    errors.push(`field '${governedName}' must be a non-empty array for a ${exception.scope} exception`);
  }

  for (const field of ['allowedProductionPackages', 'allowedBarePackages']) {
    const list = exception[field];
    if (!Array.isArray(list)) {
      if (!errors.some((error) => error.startsWith(`field '${field}'`))) {
        errors.push(`field '${field}' must be an array of package names`);
      }
      continue;
    }
    const seen = new Set();
    for (const entry of list) {
      if (!nonEmptyString(entry)) {
        errors.push(`field '${field}' must contain only non-empty strings (got ${JSON.stringify(entry)})`);
        break;
      }
      if (seen.has(entry)) {
        errors.push(`field '${field}' contains duplicate package '${entry}'`);
        break;
      }
      seen.add(entry);
    }
  }

  if (!Array.isArray(exception.upstreamLinks)) {
    errors.push(`field 'upstreamLinks' must be an array of URLs`);
  } else {
    for (const link of exception.upstreamLinks) {
      if (!isValidHttpUrl(link)) {
        errors.push(`field 'upstreamLinks' must contain only http(s) URLs (got ${JSON.stringify(link)})`);
        break;
      }
    }
  }

  return errors;
}

export function parseAuditJson(auditJson) {
  let parsed;
  try {
    parsed = JSON.parse(auditJson);
  } catch {
    return { error: 'audit JSON is not parseable' };
  }
  if (!isPlainObject(parsed)) {
    return { error: 'audit JSON root must be an object' };
  }
  return { value: parsed };
}

function normalizeNodePath(nodePath) {
  return String(nodePath).replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * F2: build a node-path -> installed-version map from the dependency tree.
 * The key is the exact lockfile node path (e.g. 'node_modules/minimatch' or
 * 'node_modules/typescript-estree/node_modules/minimatch'), so multiple
 * physical copies of one package name are never collapsed into a single
 * version and the flagged copy can be resolved deterministically.
 */
export function collectLockfilePathVersions(lockfile) {
  const byNodePath = {};
  const packages = objectValue(lockfile, 'packages');
  if (isPlainObject(packages)) {
    for (const [key, entry] of Object.entries(packages)) {
      if (key === '') {
        continue;
      }
      if (entry && typeof entry.version === 'string' && entry.version.length > 0) {
        byNodePath[normalizeNodePath(key)] = entry.version;
      }
    }
  }
  const dependencies = objectValue(lockfile, 'dependencies');
  if (isPlainObject(dependencies)) {
    collectLockfileV2Paths(dependencies, '', byNodePath);
  }
  return byNodePath;
}

function collectLockfileV2Paths(dependencies, prefix, out) {
  for (const [name, entry] of Object.entries(dependencies)) {
    const nodePath = prefix.length > 0 ? `${prefix}/node_modules/${name}` : `node_modules/${name}`;
    if (entry && typeof entry.version === 'string' && entry.version.length > 0) {
      out[nodePath] = entry.version;
    }
    const nested = objectValue(entry, 'dependencies');
    if (nested) {
      collectLockfileV2Paths(nested, nodePath, out);
    }
  }
}

export function resolveInstalledVersions(injected, audit) {
  if (injected !== undefined) {
    if (!isPlainObject(injected)) {
      return null;
    }
    return injected;
  }
  const lockfile = objectValue(audit, 'lockfile');
  if (lockfile) {
    return collectLockfilePathVersions(lockfile);
  }
  const packages = objectValue(audit, 'packages');
  if (packages) {
    return collectLockfilePathVersions({ packages });
  }
  return null;
}

function extractCvssScore(advisory) {
  const direct = isPlainObject(advisory) ? advisory.cvssScore : undefined;
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    return direct;
  }
  const nested = isPlainObject(advisory?.cvss) ? advisory.cvss.score : undefined;
  if (typeof nested === 'number' && Number.isFinite(nested)) {
    return nested;
  }
  return null;
}

function extractCvssVector(advisory) {
  const direct = isPlainObject(advisory) ? advisory.vectorString : undefined;
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct;
  }
  const nested = isPlainObject(advisory?.cvss) ? advisory.cvss.vectorString : undefined;
  if (typeof nested === 'string' && nested.trim().length > 0) {
    return nested;
  }
  return null;
}

function sameNumber(a, b) {
  return (a === null && b === null) || (typeof a === 'number' && typeof b === 'number' && a === b);
}

function compareSemverTriple(a, b) {
  const parse = (value) =>
    String(value)
      .trim()
      .split('.')
      .map((part) => {
        const match = /^(\d+)/.exec(part);
        return match ? Number(match[1]) : 0;
      });
  const left = parse(a);
  const right = parse(b);
  for (let index = 0; index < 3; index += 1) {
    const aPart = left[index] ?? 0;
    const bPart = right[index] ?? 0;
    if (aPart < bPart) {
      return -1;
    }
    if (aPart > bPart) {
      return 1;
    }
  }
  return 0;
}

function satisfiesComparator(operator, version, comparatorVersion) {
  const result = compareSemverTriple(version, comparatorVersion);
  switch (operator) {
    case '<':
      return result < 0;
    case '<=':
      return result <= 0;
    case '>':
      return result > 0;
    case '>=':
      return result >= 0;
    case '=':
    case '==':
      return result === 0;
    default:
      return false;
  }
}

function rangeIncludes(range, version) {
  if (!nonEmptyString(range) || !nonEmptyString(version)) {
    return false;
  }
  const operators = ['<=', '>=', '<', '>', '=', '=='];
  for (const part of String(range).split(/\s+/)) {
    if (part.length === 0) {
      continue;
    }
    for (const operator of operators) {
      if (part.startsWith(operator)) {
        return satisfiesComparator(operator, version, part.slice(operator.length));
      }
    }
    return false;
  }
  return false;
}

function reject(code, summary, observed = {}) {
  return { accepted: false, reasonCode: code, summary, observed };
}

function accept(reasonCode, summary, observed = {}) {
  return { accepted: true, reasonCode, summary, observed };
}

function withObserved(result, extra) {
  return { ...result, observed: { ...result.observed, ...extra } };
}

function checkCveConsistency(advisory, exception) {
  const advisoryCve = isPlainObject(advisory) && nonEmptyString(advisory.cve) ? advisory.cve : null;
  if (advisoryCve === null || advisoryCve === exception.cve) {
    return null;
  }
  return reject(
    'CVE_MISMATCH',
    `advisory reports CVE '${advisoryCve}', but the exception records '${exception.cve}'`,
  );
}

function checkAdvisoryIdentity(advisory, exception) {
  if (advisory.source !== exception.npmAuditSource) {
    return reject(
      'ADVISORY_SOURCE_MISMATCH',
      `advisory source is ${String(advisory.source)}, but the exception records npm audit source ${exception.npmAuditSource}`,
    );
  }
  if (typeof advisory.url !== 'string' || !advisory.url.endsWith(exception.advisory)) {
    return reject(
      'ADVISORY_URL_MISMATCH',
      `advisory URL does not reference ${exception.advisory}`,
    );
  }
  if (advisory.dependency !== exception.package) {
    return reject(
      'ADVISORY_PACKAGE_MISMATCH',
      `advisory targets package '${advisory.dependency}', but the exception records '${exception.package}'`,
    );
  }
  if (advisory.severity !== exception.severity) {
    return reject(
      'ADVISORY_SEVERITY_MISMATCH',
      `advisory severity is '${advisory.severity}', but the exception records '${exception.severity}'`,
    );
  }
  const actualScore = extractCvssScore(advisory);
  if (!sameNumber(actualScore, exception.cvssScore)) {
    return reject(
      'CVSS_SCORE_MISMATCH',
      `advisory CVSS score is ${String(actualScore)}, but the exception records the exact npm-feed value ${exception.cvssScore}`,
    );
  }
  const actualVector = extractCvssVector(advisory);
  if (actualVector !== exception.cvssVector) {
    return reject(
      'CVSS_VECTOR_MISMATCH',
      `advisory CVSS vector is '${actualVector === null ? 'null' : actualVector}', but the exception records '${exception.cvssVector === null ? 'null' : exception.cvssVector}'`,
    );
  }
  if (!rangeIncludes(advisory.range, exception.affectedVersion)) {
    return reject(
      'ADVISORY_RANGE_MISMATCH',
      `advisory range '${advisory.range}' does not include the recorded affected version ${exception.affectedVersion}`,
    );
  }
  return null;
}

/**
 * F2: every install node the audit flagged for the exception package must
 * resolve, by its exact node path, to exactly the recorded affected version.
 * Unflagged copies of the same package name are irrelevant by design.
 */
function checkInstalledVersion(vulnEntries, exception, versionsByNode) {
  const target = vulnEntries.find(([name]) => name === exception.package);
  if (!target) {
    return reject(
      'INSTALLED_VERSION_UNRESOLVED',
      `installed version for '${exception.package}' could not be resolved; the package is absent from the audit`,
    );
  }
  const nodes = arrayValue(target[1], 'nodes');
  if (nodes.length === 0) {
    return reject(
      'INSTALLED_VERSION_UNRESOLVED',
      `audit reports no install node for '${exception.package}'`,
    );
  }
  const flaggedNodes = [];
  const resolved = {};
  for (const node of nodes) {
    if (!nonEmptyString(node)) {
      return reject('INSTALLED_VERSION_UNRESOLVED', `audit reports a malformed install node for '${exception.package}'`);
    }
    const key = normalizeNodePath(node);
    const version = Object.prototype.hasOwnProperty.call(versionsByNode, key)
      ? versionsByNode[key]
      : undefined;
    if (typeof version !== 'string' || version.length === 0) {
      return reject(
        'INSTALLED_VERSION_UNRESOLVED',
        `flagged node '${node}' for '${exception.package}' is absent from the dependency tree`,
      );
    }
    if (version !== exception.affectedVersion) {
      return reject(
        'INSTALLED_VERSION_DRIFT',
        `flagged node '${node}' resolves to version ${version}, but the exception records ${exception.affectedVersion}`,
      );
    }
    flaggedNodes.push(node);
    resolved[key] = version;
  }
  return { flaggedNodes, resolved };
}

function checkPackageSet(vulnEntries, allowedPackages, scope) {
  const allowed = new Set(allowedPackages);
  const observed = new Set(vulnEntries.map(([name]) => name));
  const unexpected = [...new Set(vulnEntries.map(([name]) => name).filter((name) => !allowed.has(name)))].sort();
  if (unexpected.length > 0) {
    return reject(
      'UNEXPECTED_VULNERABLE_PACKAGE',
      `vulnerable packages not in the approved ${scope} exception inventory: ${unexpected.join(', ')}`,
    );
  }
  const missing = [...allowed].filter((name) => !observed.has(name)).sort();
  if (missing.length > 0) {
    return reject(
      'MISSING_EXPECTED_PACKAGE',
      `expected vulnerable packages absent from the ${scope} audit: ${missing.join(', ')}`,
    );
  }
  return null;
}

function checkViaReferences(vulnEntries, vulnNames, allowedPackages, scope) {
  const allowed = new Set(allowedPackages);
  for (const [name, entry] of vulnEntries) {
    const via = arrayValue(entry, 'via');
    if (via.length === 0) {
      continue;
    }
    for (const reference of via) {
      if (isPlainObject(reference)) {
        continue;
      }
      if (!nonEmptyString(reference)) {
        return reject(
          'MALFORMED_VIA_REFERENCE',
          `package '${name}' reports a malformed via reference: ${JSON.stringify(reference)}`,
        );
      }
      if (!vulnNames.has(reference)) {
        return reject(
          'VIA_PACKAGE_NOT_ALLOWED',
          `package '${name}' propagates through '${reference}', which is not part of the ${scope} vulnerable inventory`,
        );
      }
      if (!allowed.has(reference)) {
        return reject(
          'VIA_PACKAGE_NOT_ALLOWED',
          `package '${name}' propagates through '${reference}', which is not part of the approved ${scope} exception inventory`,
        );
      }
    }
  }
  return null;
}

/**
 * J2: the recorded severity is the only severity the exception may accept.
 * Every other severity level must be zero (or absent) in the metadata totals,
 * and the recorded level must equal the total vulnerable package count.
 */
function checkSeverityTotals(severityTotals, entryCount, scope, exception) {
  const expected = entryCount;
  const total = severityTotals.total;
  if (!Number.isInteger(total) || total !== expected) {
    return reject(
      'SEVERITY_TOTALS_MISMATCH',
      `metadata.vulnerabilities.total is ${String(total)}, but the audit reports ${expected} vulnerable packages for scope '${scope}'`,
    );
  }
  const recorded = exception.severity;
  const otherLevels = SEVERITY_LEVELS.filter((level) => level !== recorded);
  const nonZeroOthers = otherLevels.filter((level) => Number(severityTotals[level] ?? 0) !== 0);
  if (nonZeroOthers.length > 0) {
    const detail = nonZeroOthers.map((level) => `${level}=${severityTotals[level]}`).join(', ');
    return reject(
      'SEVERITY_TOTALS_NONRECORDED',
      `metadata reports counts for severity levels other than the recorded '${recorded}' (${detail}); the exception cannot accept them`,
    );
  }
  const recordedCount = Number(severityTotals[recorded] ?? 0);
  if (recordedCount !== expected) {
    return reject(
      'SEVERITY_TOTALS_MISMATCH',
      `metadata.vulnerabilities.${recorded} is ${recordedCount}, but the audit reports ${expected} vulnerable packages for scope '${scope}'`,
    );
  }
  return null;
}

function checkExpiry(exception, now) {
  const expiresAt = Date.parse(exception.expiryDate);
  if (Number.isNaN(expiresAt)) {
    return null;
  }
  return { expired: now.getTime() > expiresAt };
}

/**
 * Pure policy evaluation for one npm audit report.
 *
 * Input:
 *   - auditJson: raw stdout of `npm audit --json` (or `--omit=dev` for production)
 *   - npmExitCode: npm process exit code (0 clean, 1 vulnerabilities found)
 *   - scope: 'production' | 'bare'
 *   - exception: parsed exception record
 *   - now: injected timestamp (Date)
 *   - installedVersions: injected node-path -> version map (optional; falls
 *     back to audit.lockfile / audit.packages when omitted)
 */
export function evaluateAuditPolicy(input) {
  const { auditJson, npmExitCode, scope, exception, now = new Date() } = input;
  const baseObserved = {
    scope,
    npmExitCode,
    totalVulnerabilities: null,
    vulnerabilityPackages: [],
    advisoryObjects: [],
    exceptionId: isPlainObject(exception) ? exception.id ?? null : null,
    exceptionScope: isPlainObject(exception) ? exception.scope ?? null : null,
    exceptionExpiryDate: isPlainObject(exception) ? exception.expiryDate ?? null : null,
    expired: false,
    flaggedNodes: [],
    installedVersionsByNode: {},
  };

  if (scope !== 'production' && scope !== 'bare') {
    return reject('AUDIT_SCOPE_INVALID', `unsupported audit scope '${String(scope)}'`, baseObserved);
  }

  const schemaErrors = validateExceptionSchema(exception);
  if (schemaErrors.length > 0) {
    return reject('EXCEPTION_SCHEMA_INVALID', `exception schema invalid: ${schemaErrors.join('; ')}`, baseObserved);
  }

  const parsed = parseAuditJson(auditJson);
  if (parsed.error) {
    return reject('AUDIT_JSON_MALFORMED', parsed.error, baseObserved);
  }
  const audit = parsed.value;

  if (npmExitCode !== 0 && npmExitCode !== 1) {
    return reject('NPM_UNEXPECTED_EXIT_CODE', `npm audit exited with unexpected code ${String(npmExitCode)}`, baseObserved);
  }

  if (
    npmExitCode !== 0 &&
    (audit.error ||
      audit.message ||
      audit.code ||
      !('auditReportVersion' in audit) ||
      !isPlainObject(audit.metadata))
  ) {
    return reject(
      'NPM_INFRASTRUCTURE_FAILURE',
      `npm audit returned an infrastructure error body instead of a vulnerability report: ${String(audit.message ?? audit.code ?? audit.error ?? 'unknown error')}`,
      baseObserved,
    );
  }

  const metadata = isPlainObject(audit.metadata) ? audit.metadata : null;
  const severityTotals = metadata && isPlainObject(metadata.vulnerabilities) ? metadata.vulnerabilities : null;
  if (!metadata || !severityTotals || !('total' in severityTotals)) {
    return reject('AUDIT_METADATA_MISSING', 'audit metadata.vulnerabilities.total is missing', baseObserved);
  }

  const vulnerabilities = isPlainObject(audit.vulnerabilities) ? audit.vulnerabilities : {};
  const vulnEntries = Object.entries(vulnerabilities)
    .filter(([, entry]) => isPlainObject(entry))
    .map(([name, entry]) => [name, entry]);
  const vulnNames = new Set(vulnEntries.map(([name]) => name));
  const advisoryObjects = [];
  for (const [, entry] of vulnEntries) {
    const via = arrayValue(entry, 'via');
    if (via.length === 0) {
      continue;
    }
    for (const reference of via) {
      if (isPlainObject(reference)) {
        advisoryObjects.push(reference);
      }
    }
  }
  const uniqueAdvisories = new Map(advisoryObjects.map((advisory) => [String(advisory.source), advisory]));
  const total = Number(severityTotals.total);
  const totalIsZero = total === 0 && vulnEntries.length === 0 && advisoryObjects.length === 0;

  if (totalIsZero && npmExitCode === 0) {
    return accept(
      'CLEAN_AUDIT',
      `audit is clean for scope '${scope}' (0 vulnerable packages, 0 advisory objects)`,
      { ...baseObserved, totalVulnerabilities: 0 },
    );
  }

  const findingObserved = {
    totalVulnerabilities: total,
    vulnerabilityPackages: [...vulnNames].sort(),
  };

  // J1: a finding in a scope the exception does not govern is never accepted.
  if (scope !== exception.scope) {
    return reject(
      'SCOPE_MISMATCH',
      `audit scope is '${scope}', but the active exception governs scope '${exception.scope}'; findings outside the governed scope are never accepted`,
      { ...baseObserved, ...findingObserved },
    );
  }

  if (uniqueAdvisories.size !== 1) {
    const count = uniqueAdvisories.size;
    return reject(
      count === 0 ? 'NO_CONCRETE_ADVISORY' : 'MULTIPLE_ADVISORY_OBJECTS',
      count === 0
        ? 'audit reports vulnerabilities but contains no concrete advisory object'
        : `audit reports ${count} distinct advisory objects; the exception authorizes exactly 1`,
      { ...baseObserved, ...findingObserved, advisoryObjects: [...uniqueAdvisories.values()] },
    );
  }

  const advisory = [...uniqueAdvisories.values()][0];
  const findingObservedWithAdvisory = { ...findingObserved, advisoryObjects: [advisory] };

  const cveCheck = checkCveConsistency(advisory, exception);
  if (cveCheck) {
    return withObserved(cveCheck, findingObservedWithAdvisory);
  }

  const identityCheck = checkAdvisoryIdentity(advisory, exception);
  if (identityCheck) {
    return withObserved(identityCheck, findingObservedWithAdvisory);
  }

  const versionsByNode = resolveInstalledVersions(input.installedVersions, audit);
  if (versionsByNode === null) {
    return withObserved(
      reject(
        'INSTALLED_VERSION_UNRESOLVED',
        'installed versions could not be resolved from the provided dependency tree',
        baseObserved,
      ),
      findingObservedWithAdvisory,
    );
  }

  const versionCheck = checkInstalledVersion(vulnEntries, exception, versionsByNode);
  if (versionCheck.flaggedNodes === undefined) {
    return withObserved(versionCheck, findingObservedWithAdvisory);
  }

  const allowedPackages = scope === 'production' ? exception.allowedProductionPackages : exception.allowedBarePackages;
  if (!Array.isArray(allowedPackages) || allowedPackages.length === 0) {
    return withObserved(
      reject(
        'EXCEPTION_SCHEMA_INVALID',
        `no allowed package list for scope '${scope}'`,
        baseObserved,
      ),
      findingObservedWithAdvisory,
    );
  }

  const packageCheck = checkPackageSet(vulnEntries, allowedPackages, scope);
  if (packageCheck) {
    return withObserved(packageCheck, findingObservedWithAdvisory);
  }

  for (const [name, entry] of vulnEntries) {
    if (!nonEmptyString(entry.severity) || entry.severity !== exception.severity) {
      return withObserved(
        reject(
          'SEVERITY_MISMATCH',
          `package '${name}' reports severity '${String(entry.severity)}', but the exception records '${exception.severity}'`,
          baseObserved,
        ),
        findingObservedWithAdvisory,
      );
    }
  }

  const viaCheck = checkViaReferences(vulnEntries, vulnNames, allowedPackages, scope);
  if (viaCheck) {
    return withObserved(viaCheck, findingObservedWithAdvisory);
  }

  const totalsCheck = checkSeverityTotals(severityTotals, vulnEntries.length, scope, exception);
  if (totalsCheck) {
    return withObserved(totalsCheck, findingObservedWithAdvisory);
  }

  const expiry = checkExpiry(exception, now);
  if (!expiry) {
    return withObserved(
      reject('EXCEPTION_SCHEMA_INVALID', `exception expiryDate '${exception.expiryDate}' is not a valid timestamp`, baseObserved),
      findingObservedWithAdvisory,
    );
  }
  if (expiry.expired) {
    return withObserved(
      reject(
        'EXCEPTION_EXPIRED',
        `exception expired at ${exception.expiryDate} (evaluated at ${now.toISOString()})`,
        baseObserved,
      ),
      { ...findingObservedWithAdvisory, expired: true },
    );
  }

  return accept(
    'EXCEPTION_APPLIED',
    `audit matches approved exception ${exception.id} for scope '${scope}': ${exception.advisory} (${exception.package} ${exception.affectedVersion}, severity ${exception.severity})`,
    {
      ...baseObserved,
      ...findingObservedWithAdvisory,
      flaggedNodes: versionCheck.flaggedNodes,
      installedVersionsByNode: versionCheck.resolved,
    },
  );
}

/**
 * CLI-level classification of one scope run. Infrastructure problems must
 * surface as exit 2 (gate could not run), distinct from policy rejections
 * (exit 1) and acceptance (exit 0).
 */
export function classifyScopeOutcome(runResult, evaluation) {
  if (!runResult || runResult.ok === false) {
    return 'infrastructure';
  }
  if (runResult.exitCode !== 0 && runResult.exitCode !== 1) {
    return 'infrastructure';
  }
  if (typeof runResult.stdout !== 'string' || runResult.stdout.length === 0) {
    return 'infrastructure';
  }
  if (!evaluation) {
    return 'infrastructure';
  }
  return evaluation.accepted ? 'accepted' : 'policy-rejected';
}

function fileExists(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * K: bounded breadth-first search for npm-cli.js under rootDir. Shallow
 * candidates are reached before deep ones; the directory visit count is
 * capped at `cap` (default NPM_SEARCH_VISIT_CAP) so the walk always
 * terminates, and a visited set guards against symlink cycles. A directory
 * is accepted when it directly contains npm-cli.js (npm installs place it
 * at <prefix>/node_modules/npm/bin/npm-cli.js, so bin/ is reached by the
 * walk; node_modules directories are intentionally traversed).
 */
export function findNpmCli(rootDir, cap = NPM_SEARCH_VISIT_CAP) {
  const queue = [rootDir];
  const seen = new Set([rootDir]);
  let visited = 0;
  while (queue.length > 0) {
    const dir = queue.shift();
    if (++visited > cap) {
      return null;
    }
    const candidate = path.join(dir, NPM_CLI_FILENAME);
    if (fileExists(candidate)) {
      return candidate;
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }
      if (BFS_SKIP_DIRS.has(entry.name)) {
        continue;
      }
      const childPath = path.join(dir, entry.name);
      if (seen.has(childPath)) {
        continue;
      }
      seen.add(childPath);
      queue.push(childPath);
    }
  }
  return null;
}

function prefixCandidatePaths(env) {
  const candidates = [path.join(path.dirname(process.execPath), NPM_CLI_RELATIVE)];
  if (process.platform === 'win32') {
    candidates.push(path.join('C:', 'Program Files', 'nodejs', NPM_CLI_RELATIVE));
    candidates.push(path.join('C:', 'Program Files (x86)', 'nodejs', NPM_CLI_RELATIVE));
    candidates.push(path.join('C:', 'ProgramData', 'nodejs', NPM_CLI_RELATIVE));
    candidates.push(path.join('C:', 'nodejs', NPM_CLI_RELATIVE));
    if (nonEmptyString(env?.PROGRAMFILES)) {
      candidates.push(path.join(env.PROGRAMFILES, 'nodejs', NPM_CLI_RELATIVE));
    }
  } else {
    if (nonEmptyString(env?.HOME)) {
      candidates.push(path.join(env.HOME, '.npm-global', NPM_CLI_RELATIVE));
      candidates.push(path.join(env.HOME, '.local', 'share', 'npm', NPM_CLI_RELATIVE));
    }
    candidates.push(path.join('/usr/local', NPM_CLI_RELATIVE));
    candidates.push(path.join('/usr', NPM_CLI_RELATIVE));
  }
  return candidates;
}

function searchRootDirs(env) {
  const roots = [];
  if (nonEmptyString(env?.HOME)) {
    roots.push(env.HOME);
  }
  if (process.platform === 'win32') {
    const drive = nonEmptyString(env?.SystemDrive) ? env.SystemDrive : 'C:';
    roots.push(path.join(drive, ''));
    if (nonEmptyString(env?.PROGRAMFILES)) {
      roots.push(env.PROGRAMFILES);
    }
    if (nonEmptyString(env?.['PROGRAMFILES(X86)'])) {
      roots.push(env['PROGRAMFILES(X86)']);
    }
    if (nonEmptyString(env?.PROGRAMDATA)) {
      roots.push(env.PROGRAMDATA);
    }
  } else {
    roots.push('/usr', '/opt', '/');
  }
  return roots;
}

/**
 * K: resolve the npm CLI file to spawn.
 * Candidate order:
 *   1. validated NPM_PATH (spaces allowed; must be an existing file; no shell)
 *   2. validated process.env.npm_execpath (Windows only)
 *   3. npm adjacent to process.execPath (Windows only)
 *   4. common direct Windows/Linux prefix candidates (Windows only)
 *   5. bounded breadth-first filesystem search (Windows only, final fallback)
 * Non-Windows platforms resolve the 'npm' command from PATH; a spawn failure
 * still surfaces as an infrastructure exit 2.
 * Returns null only when no Windows candidate can be validated; the CLI maps
 * that to EXIT_CONFIG_OR_INTERNAL = 2.
 */
export function resolveNpmPath(env = process.env) {
  const explicit = env?.NPM_PATH;
  if (typeof explicit === 'string' && explicit.length > 0) {
    return fileExists(explicit) ? explicit : null;
  }
  if (process.platform !== 'win32') {
    return 'npm';
  }
  const execPath = env?.npm_execpath;
  if (typeof execPath === 'string' && execPath.length > 0 && fileExists(execPath)) {
    return execPath;
  }
  for (const candidate of prefixCandidatePaths(env)) {
    if (fileExists(candidate)) {
      return candidate;
    }
  }
  for (const root of searchRootDirs(env)) {
    const found = findNpmCli(root);
    if (found) {
      return found;
    }
  }
  return null;
}

function resolveNpmCommand(npmPath) {
  if (npmPath.toLowerCase().endsWith('.js')) {
    return [process.execPath, npmPath];
  }
  return [npmPath];
}

export function runNpmAudit(input) {
  const { npmPath, args, cwd = process.cwd(), timeoutMs = NPM_AUDIT_TIMEOUT_MS } = input;
  return new Promise((resolve) => {
    const [command, ...baseArgs] = resolveNpmCommand(npmPath);
    let settled = false;
    let stdout = '';
    let stdoutTruncated = false;
    const settle = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };
    let child;
    try {
      child = spawn(command, [...baseArgs, ...args], {
        env: process.env,
        cwd,
        timeout: timeoutMs,
        killSignal: 'SIGTERM',
      });
    } catch (error) {
      settle({ ok: false, error: 'spawn-failed', detail: String(error?.message ?? error) });
      return;
    }
    child.stdout.on('data', (chunk) => {
      if (stdoutTruncated) {
        return;
      }
      stdout += chunk.toString('utf8');
      if (stdout.length > NPM_STDOUT_LIMIT_BYTES) {
        stdout = stdout.slice(0, NPM_STDOUT_LIMIT_BYTES);
        stdoutTruncated = true;
      }
    });
    child.on('error', (error) => {
      settle({ ok: false, error: 'process-error', detail: String(error?.message ?? error) });
    });
    child.on('close', (code) => {
      settle({ ok: true, exitCode: code, stdout });
    });
  });
}

function readExceptionFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(text);
  if (!isPlainObject(parsed)) {
    throw new Error('exception file root must be a JSON object');
  }
  return parsed;
}

function readInstalledVersions(lockfilePath) {
  const text = fs.readFileSync(lockfilePath, 'utf8');
  const parsed = JSON.parse(text);
  return collectLockfilePathVersions(parsed);
}

async function main() {
  let exception;
  try {
    exception = readExceptionFile(path.join(projectRoot, 'config', 'audit-exceptions.json'));
  } catch (error) {
    console.error(`audit-policy: could not read exception configuration: ${error.message}`);
    process.exitCode = EXIT_CONFIG_OR_INTERNAL;
    return;
  }

  const schemaErrors = validateExceptionSchema(exception);
  if (schemaErrors.length > 0) {
    console.error('audit-policy: exception configuration is invalid:');
    for (const error of schemaErrors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = EXIT_CONFIG_OR_INTERNAL;
    return;
  }

  let installedVersions;
  try {
    installedVersions = readInstalledVersions(path.join(projectRoot, 'package-lock.json'));
  } catch (error) {
    console.error(`audit-policy: could not read dependency tree for installed versions: ${error.message}`);
    process.exitCode = EXIT_CONFIG_OR_INTERNAL;
    return;
  }

  const npmPath = resolveNpmPath();
  if (!npmPath) {
    console.error(
      'audit-policy: could not resolve an npm CLI executable file. Set NPM_PATH to the absolute path of npm-cli.js (spaces are allowed; no shell is used).',
    );
    process.exitCode = EXIT_CONFIG_OR_INTERNAL;
    return;
  }

  console.error(`audit-policy: node=${process.execPath}`);
  console.error(`audit-policy: npm=${npmPath}`);
  console.error(`audit-policy: exception=${exception.id} scope=${exception.scope} expires=${exception.expiryDate} owner=${exception.owner}`);

  const now = new Date();
  const outcomes = new Map();
  for (const scope of SCOPES) {
    const run = await runNpmAudit({ npmPath, args: NPM_AUDIT_ARGS[scope], cwd: projectRoot });
    let outcome;
    if (!run.ok) {
      outcome = {
        classification: 'infrastructure',
        reasonCode: run.error === 'spawn-failed' ? 'NPM_SPAWN_FAILED' : 'NPM_EXECUTION_FAILED',
        summary: `npm audit failed to execute for scope '${scope}' (${run.error}${run.detail ? `: ${run.detail}` : ''})`,
      };
    } else if (run.exitCode !== 0 && run.exitCode !== 1) {
      outcome = {
        classification: 'infrastructure',
        reasonCode: 'NPM_UNEXPECTED_EXIT_CODE',
        summary: `npm audit exited with unexpected code ${run.exitCode} for scope '${scope}'`,
      };
    } else if (run.stdout.length === 0) {
      outcome = {
        classification: 'infrastructure',
        reasonCode: 'NPM_EMPTY_OUTPUT',
        summary: `npm audit produced no output for scope '${scope}'`,
      };
    } else {
      const evaluation = evaluateAuditPolicy({
        auditJson: run.stdout,
        npmExitCode: run.exitCode,
        scope,
        exception,
        now,
        installedVersions,
      });
      outcome = {
        classification: classifyScopeOutcome(run, evaluation),
        reasonCode: evaluation.reasonCode,
        summary: evaluation.summary,
        evaluation,
      };
    }
    outcomes.set(scope, outcome);
    console.error(`audit-policy: scope '${scope}' classified: ${outcome.classification} (${outcome.reasonCode})`);
  }

  const infrastructure = SCOPES.filter((scope) => outcomes.get(scope).classification === 'infrastructure');
  if (infrastructure.length > 0) {
    for (const scope of infrastructure) {
      const outcome = outcomes.get(scope);
      console.error(`audit-policy: infrastructure failure for scope '${scope}': ${outcome.reasonCode} - ${outcome.summary}`);
    }
    console.error('audit-policy: result: INFRASTRUCTURE FAILURE (exit 2). No policy decision was made; fix the gate environment and rerun.');
    process.exitCode = EXIT_CONFIG_OR_INTERNAL;
    return;
  }

  const rejected = SCOPES.filter((scope) => outcomes.get(scope).classification === 'policy-rejected');
  if (rejected.length > 0) {
    for (const scope of rejected) {
      const outcome = outcomes.get(scope);
      console.error(`audit-policy: policy rejected scope '${scope}': ${outcome.reasonCode} - ${outcome.summary}`);
      const packages = outcome.evaluation?.observed?.vulnerabilityPackages ?? [];
      console.error(
        `audit-policy: raw audit package inventory for scope '${scope}': ${packages.length > 0 ? packages.join(', ') : '(none)'}`,
      );
    }
    console.error('audit-policy: result: POLICY REJECTED (exit 1).');
    process.exitCode = EXIT_POLICY_REJECTED;
    return;
  }

  for (const scope of SCOPES) {
    const outcome = outcomes.get(scope);
    const evaluation = outcome.evaluation;
    console.error(`audit-policy: ${evaluation.summary}`);
    if (evaluation.reasonCode === 'EXCEPTION_APPLIED') {
      for (const [node, version] of Object.entries(evaluation.observed.installedVersionsByNode ?? {})) {
        console.error(`audit-policy: flagged node ${node} = ${version}`);
      }
      console.error(
        `audit-policy: exception expires ${evaluation.observed.exceptionExpiryDate} (owner: ${exception.owner}); re-review per the exception's reviewInstructions - the gate fails closed after expiry or metadata drift`,
      );
    }
  }
  console.error('audit-policy: result: ACCEPTED (exit 0).');
  process.exitCode = EXIT_SUCCESS;
}

// The module exports pure evaluation functions that tests import directly;
// the CLI entry point must not run as a side effect of that import.
const isMainModule = (() => {
  try {
    return process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  main().catch((error) => {
    console.error(`audit-policy: internal error: ${error?.message ?? String(error)}`);
    process.exitCode = EXIT_CONFIG_OR_INTERNAL;
  });
}
