/**
 * Phase 16B — audit-policy test matrix (DEP-AUDIT-005).
 *
 * Supersedes the Phase 14 BRACES-EXC matrix. The policy under test is:
 *
 *   PRODUCTION CLEAN + ONE DEV-ONLY TEMPORARY EXCEPTION
 *
 * - production scope must be completely clean (CLEAN_AUDIT, never consumes
 *   the exception),
 * - bare scope may accept exactly the approved minimatch dev-only exception
 *   (GHSA-g3hv-75wg-m249, source 1244012, minimatch 3.1.5, moderate,
 *   cvssScore 0, cvssVector null, expiry 2026-11-16T23:59:59Z).
 *
 * Test numbering follows the Phase 16B prompt section L (1..32). Tests 33..38
 * preserve still-valid behaviors from the Phase 14 BRACES-EXC matrix:
 *
 *   old 3/4/20   -> L1/L2 + exit-code-1-not-infrastructure assertion (L4)
 *   old 5/26/27  -> L21 (including the exact-millisecond expiry boundary)
 *   old 6/7      -> L13 / L11
 *   old 8        -> L6
 *   old 9/10     -> L8 / L9
 *   old 11 + add -> L14 / L17 (severity parameterization, J2)
 *   old 12/13    -> L20 / L19
 *   old 14       -> L10
 *   old 15       -> L23
 *   old 16       -> L24
 *   old 17       -> L26 (pure level) + end-to-end exit 2
 *   old 18       -> L25 (spawn failure at the helper boundary)
 *   old 19       -> 35 (registry/network error JSON)
 *   old 21       -> 33 (CVE absent is tolerated)
 *   old 22       -> 34 (conflicting CVE rejects)
 *   old 23/24    -> L31 (via propagation + malformed via)
 *   old 25       -> L22 (schema)
 *   old 28/29    -> L3 (scope gate subsumes content/scope mismatches)
 *   old 30       -> 36 (pure evaluation does not depend on process.env)
 *   old add 2    -> L12 (advisory package name drift)
 *
 * Every fixture is synthetic (no npm process, no registry, no network). The
 * end-to-end CLI tests spawn the gate with a fake `npm` script written to a
 * temporary directory, so they are deterministic and offline as well.
 * No local-machine path is hard-coded anywhere in this file (K12): the fake
 * npm scripts live under os.tmpdir().
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  classifyScopeOutcome,
  evaluateAuditPolicy,
  findNpmCli,
  NPM_SEARCH_VISIT_CAP,
  resolveNpmPath,
  runNpmAudit,
} from '../scripts/audit-policy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Approved exception fixture (mirrors config/audit-exceptions.json)
// ---------------------------------------------------------------------------

const BARE_VULN_PACKAGES = [
  '@eslint-community/eslint-utils',
  '@eslint/config-array',
  '@eslint/eslintrc',
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  '@typescript-eslint/type-utils',
  '@typescript-eslint/utils',
  'eslint',
  'eslint-config-next',
  'eslint-plugin-import',
  'eslint-plugin-jsx-a11y',
  'eslint-plugin-react',
  'minimatch',
];

const BASE_EXCEPTION = {
  id: 'MINIMATCH-DEV-EXC-2026-11-02',
  scope: 'bare',
  advisory: 'GHSA-g3hv-75wg-m249',
  cve: 'CVE-2026-118764',
  npmAuditSource: 1244012,
  package: 'minimatch',
  affectedVersion: '3.1.5',
  severity: 'moderate',
  cvssScore: 0,
  cvssVector: null,
  allowedProductionPackages: [],
  allowedBarePackages: [...BARE_VULN_PACKAGES],
  approvalDate: '2026-11-02',
  expiryDate: '2026-11-16T23:59:59Z',
  reviewCadenceDays: 7,
  owner: 'repository-maintainer',
  rationale:
    'Phase 16B (DEP-AUDIT-005): production audit clean; glob removed; remaining minimatch copy dev-only; minimatch 11.0.1 incompatible with the current @eslint/eslintrc ESM default-import contract; temporary pending an upstream-compatible ESLint chain.',
  reviewInstructions:
    'Re-run both audits before expiry and at each 7-day review; remove the exception once the ESLint chain is minimatch 11.x compatible; the gate fails closed on expiry or metadata drift.',
  upstreamLinks: [
    'https://github.com/advisories/GHSA-g3hv-75wg-m249',
    'https://github.com/minimatchjs/minimatch',
  ],
};

// A fixed evaluation instant inside the approved validity window.
const NOW = new Date('2026-11-03T12:00:00Z');
const INSTALLED_VERSIONS = { 'node_modules/minimatch': '3.1.5' };

interface Advisory {
  source: number;
  name: string;
  dependency: string;
  url: string;
  severity: string;
  cwe: string[];
  cvss: { score: number; vectorString: string | null };
  vulnerable_versions: string;
  range: string;
  cve?: string;
}

interface AuditEntry {
  name: string;
  severity: string;
  is_direct: boolean;
  via: unknown[];
  effects: string[];
  range: string;
  nodes: string[];
  fix_available: boolean;
}

interface AuditReport {
  auditReportVersion: number;
  vulnerabilities: Record<string, AuditEntry>;
  metadata: { vulnerabilities: Record<string, number> };
}

interface BuildAuditOverrides {
  packages?: string[];
  advisory?: Advisory;
  minimatchVia?: unknown[] | null;
  extraEntries?: Record<string, AuditEntry>;
  totals?: Record<string, number>;
  nodes?: string[];
}

interface EvalResult {
  accepted: boolean;
  reasonCode: string;
  summary: string;
  observed: Record<string, unknown>;
}

interface CliRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function makeException(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...BASE_EXCEPTION, ...(overrides ?? {}) };
}

function makeAdvisory(overrides: Partial<Advisory> = {}): Advisory {
  return {
    source: 1244012,
    name: 'minimatch',
    dependency: 'minimatch',
    url: 'https://github.com/advisories/GHSA-g3hv-75wg-m249',
    severity: 'moderate',
    cwe: ['CWE-405'],
    cvss: { score: 0, vectorString: null },
    vulnerable_versions: '<11.0.1',
    range: '<11.0.1',
    cve: 'CVE-2026-118764',
    ...(overrides ?? {}),
  };
}

const CLEAN_AUDIT: AuditReport = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
  },
};

/**
 * Build a bare-scope audit report.
 *
 * - `packages`: vulnerable package names (minimatch carries the advisory object)
 * - `minimatchVia`: via array for the minimatch entry (default: [advisory object])
 * - `extraEntries`: additional/overriding vulnerability entries keyed by name
 * - `totals`: override for metadata.vulnerabilities
 */
function buildAudit(overrides: BuildAuditOverrides = {}): AuditReport {
  const {
    packages = BARE_VULN_PACKAGES,
    advisory = makeAdvisory(),
    minimatchVia = null,
    extraEntries = {},
    totals = null,
    nodes = ['node_modules/minimatch'],
  } = overrides;
  const vulnerabilities: Record<string, AuditEntry> = {};
  for (const name of packages) {
    if (name === 'minimatch') {
      vulnerabilities[name] = {
        name,
        severity: 'moderate',
        is_direct: false,
        via: minimatchVia ?? [advisory],
        effects: [],
        range: '<11.0.1',
        nodes,
        fix_available: true,
      };
    } else {
      vulnerabilities[name] = {
        name,
        severity: 'moderate',
        is_direct: false,
        via: ['minimatch'],
        effects: ['minimatch'],
        range: '*',
        nodes: [`node_modules/${name}`],
        fix_available: true,
      };
    }
  }
  for (const [name, entry] of Object.entries(extraEntries)) {
    vulnerabilities[name] = entry;
  }
  const entryCount = Object.keys(vulnerabilities).length;
  const metadata = {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: entryCount,
      high: 0,
      critical: 0,
      total: entryCount,
      ...(totals ?? {}),
    },
  };
  return { auditReportVersion: 2, vulnerabilities, metadata };
}

function makePropagatedEntry(name: string): AuditEntry {
  return {
    name,
    severity: 'moderate',
    is_direct: false,
    via: ['minimatch'],
    effects: ['minimatch'],
    range: '*',
    nodes: [`node_modules/${name}`],
    fix_available: true,
  };
}

function evaluate(auditJson: unknown, opts: Record<string, unknown> = {}) {
  return evaluateAuditPolicy({
    auditJson: typeof auditJson === 'string' ? auditJson : JSON.stringify(auditJson),
    npmExitCode: 1,
    scope: 'bare',
    exception: makeException(),
    now: NOW,
    installedVersions: INSTALLED_VERSIONS,
    ...opts,
  });
}

function expectRejected(result: EvalResult, reasonCode: string): EvalResult {
  expect(result.accepted).toBe(false);
  expect(result.reasonCode).toBe(reasonCode);
  return result;
}

// ---------------------------------------------------------------------------
// Temporary-directory + fake-npm helpers (end-to-end CLI tests)
// ---------------------------------------------------------------------------

let tmpDir: string;

function tmp(name: string): string {
  return path.join(tmpDir, name);
}

function writeFakeNpm(filename: string, script: string): string {
  const file = tmp(filename);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, script, 'utf8');
  return file;
}

const FAKE_CLEAN_SCRIPT = `
const clean = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
};
process.stdout.write(JSON.stringify(clean));
process.exit(0);
`;

function runCli(envOverrides: Record<string, string> = {}): Promise<CliRunResult> {
  return new Promise<CliRunResult>((resolve) => {
    execFile(
      process.execPath,
      ['scripts/audit-policy.mjs'],
      {
        cwd: projectRoot,
        env: { ...process.env, ...envOverrides },
        timeout: 30000,
        maxBuffer: 16 * 1024 * 1024,
        encoding: 'utf8',
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : -1) : 0;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p16b-policy-'));
});

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Section L behaviors 1..32 + preserved Phase 14 behaviors 33..38
// ---------------------------------------------------------------------------

describe('audit-policy (Phase 16B) — pure evaluation', () => {
  it('L1. accepts a clean production audit without using the exception', () => {
    const result = evaluate(CLEAN_AUDIT, { npmExitCode: 0, scope: 'production' });
    expect(result.accepted).toBe(true);
    expect(result.reasonCode).toBe('CLEAN_AUDIT');
    expect(result.observed.totalVulnerabilities).toBe(0);
  });

  it('L2. accepts a clean bare audit without using the exception', () => {
    const result = evaluate(CLEAN_AUDIT, { npmExitCode: 0, scope: 'bare' });
    expect(result.accepted).toBe(true);
    expect(result.reasonCode).toBe('CLEAN_AUDIT');
  });

  it('L3. rejects a production finding even when a bare exception exists (J1)', () => {
    const result = evaluate(buildAudit(), { scope: 'production' });
    expectRejected(result, 'SCOPE_MISMATCH');
    // The raw inventory is still visible on rejection.
    expect(result.observed.vulnerabilityPackages).toEqual([...BARE_VULN_PACKAGES].sort());
  });

  it('L4. accepts the exact approved bare exception', () => {
    const result = evaluate(buildAudit());
    expect(result.accepted).toBe(true);
    expect(result.reasonCode).toBe('EXCEPTION_APPLIED');
    // Preserved from old test 20: a vulnerability exit code of 1 is a valid
    // audit, not an infrastructure failure.
    expect(result.observed.npmExitCode).toBe(1);
    expect(result.observed.totalVulnerabilities).toBe(13);
    // F2: the flagged copy is resolved by its exact install node path.
    expect(result.observed.flaggedNodes).toEqual(['node_modules/minimatch']);
    expect(result.observed.installedVersionsByNode).toEqual({ 'node_modules/minimatch': '3.1.5' });
  });

  it('L5. rejects an unsupported audit scope', () => {
    const result = evaluate(CLEAN_AUDIT, { scope: 'dev' });
    expectRejected(result, 'AUDIT_SCOPE_INVALID');
  });

  it('L6. rejects an additional concrete advisory object', () => {
    const audit = buildAudit();
    audit.vulnerabilities.minimatch.via.push(
      makeAdvisory({ source: 1244013, url: 'https://github.com/advisories/GHSA-other-other-other' }),
    );
    const result = evaluate(audit);
    expectRejected(result, 'MULTIPLE_ADVISORY_OBJECTS');
  });

  it('L7. rejects findings that carry no concrete advisory object', () => {
    const result = evaluate(buildAudit({ minimatchVia: ['minimatch'] }));
    expectRejected(result, 'NO_CONCRETE_ADVISORY');
  });

  it('L8. rejects an additional vulnerable package', () => {
    const result = evaluate(
      buildAudit({
        extraEntries: { 'brace-expansion': makePropagatedEntry('brace-expansion') },
        totals: { moderate: 14, total: 14 },
      }),
    );
    expectRejected(result, 'UNEXPECTED_VULNERABLE_PACKAGE');
    expect(result.summary).toContain('brace-expansion');
  });

  it('L9. rejects a missing expected package', () => {
    const packages = BARE_VULN_PACKAGES.filter((name) => name !== 'eslint');
    const result = evaluate(buildAudit({ packages }));
    expectRejected(result, 'MISSING_EXPECTED_PACKAGE');
    expect(result.summary).toContain('eslint');
  });

  it('L10. rejects installed-version drift on the flagged node (F2)', () => {
    const result = evaluate(buildAudit(), {
      installedVersions: { 'node_modules/minimatch': '3.1.6' },
    });
    expectRejected(result, 'INSTALLED_VERSION_DRIFT');
    expect(result.summary).toContain('3.1.6');
  });

  it('L11. rejects a wrong npm audit source id', () => {
    const result = evaluate(buildAudit({ advisory: makeAdvisory({ source: 1244013 }) }));
    expectRejected(result, 'ADVISORY_SOURCE_MISMATCH');
  });

  it('L12. rejects a wrong advisory package', () => {
    const result = evaluate(buildAudit({ advisory: makeAdvisory({ dependency: 'glob' }) }));
    expectRejected(result, 'ADVISORY_PACKAGE_MISMATCH');
  });

  it('L13. rejects advisory URL drift', () => {
    const result = evaluate(
      buildAudit({ advisory: makeAdvisory({ url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }) }),
    );
    expectRejected(result, 'ADVISORY_URL_MISMATCH');
  });

  it('L13b. rejects a wrong GHSA identifier recorded in the exception (preserved from old test 6)', () => {
    const result = evaluate(buildAudit(), { exception: makeException({ advisory: 'GHSA-0000-0000-0000' }) });
    expectRejected(result, 'ADVISORY_URL_MISMATCH');
    expect(result.summary).toContain('GHSA-0000-0000-0000');
  });

  it('L14. rejects a severity escalation (high appearing alongside moderate)', () => {
    const result = evaluate(buildAudit({ totals: { moderate: 12, high: 1, total: 13 } }));
    expectRejected(result, 'SEVERITY_TOTALS_NONRECORDED');
    expect(result.summary).toContain('high=1');
  });

  it('L15. rejects a lower or different recorded severity', () => {
    // Advisory-object severity drift is caught by the identity check first.
    const advisoryDrift = evaluate(buildAudit(), { exception: makeException({ severity: 'low' }) });
    expectRejected(advisoryDrift, 'ADVISORY_SEVERITY_MISMATCH');
    // With the advisory object matching, per-package entry severity drift is
    // caught by the package-level severity loop.
    const entryDrift = evaluate(
      buildAudit({ advisory: makeAdvisory({ severity: 'low' }) }),
      { exception: makeException({ severity: 'low' }) },
    );
    expectRejected(entryDrift, 'SEVERITY_MISMATCH');
    expect(entryDrift.summary).toContain("reports severity 'moderate'");
  });

  it('L16. accepts exact moderate totals (moderate = total, all others zero)', () => {
    const audit = buildAudit();
    expect(audit.metadata.vulnerabilities).toEqual({
      info: 0,
      low: 0,
      moderate: 13,
      high: 0,
      critical: 0,
      total: 13,
    });
    const result = evaluate(audit);
    expect(result.accepted).toBe(true);
    expect(result.reasonCode).toBe('EXCEPTION_APPLIED');
  });

  it('L17. rejects high and critical counts alongside moderate', () => {
    const result = evaluate(buildAudit({ totals: { moderate: 11, high: 1, critical: 1, total: 13 } }));
    expectRejected(result, 'SEVERITY_TOTALS_NONRECORDED');
  });

  it('L18. accepts an exact null CVSS vector (feed null, record null)', () => {
    const advisory = makeAdvisory();
    expect(advisory.cvss.vectorString).toBeNull();
    const audit = buildAudit({ advisory });
    const result = evaluate(audit);
    expect(result.accepted).toBe(true);
    expect(result.reasonCode).toBe('EXCEPTION_APPLIED');
  });

  it('L19. rejects null-to-non-null CVSS vector drift (J3)', () => {
    const result = evaluate(
      buildAudit({
        advisory: makeAdvisory({
          cvss: { score: 0, vectorString: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:N/SC:N/SI:N/SA:N' },
        }),
      }),
    );
    expectRejected(result, 'CVSS_VECTOR_MISMATCH');
  });

  it('L20. rejects CVSS score drift (exact npm-feed value, J4)', () => {
    const result = evaluate(buildAudit({ advisory: makeAdvisory({ cvss: { score: 6.9, vectorString: null } }) }));
    expectRejected(result, 'CVSS_SCORE_MISMATCH');
  });

  it('L20a. rejects an advisory range that does not include the recorded affected version', () => {
    const result = evaluate(buildAudit({ advisory: makeAdvisory({ range: '>=11.0.1' }) }));
    expectRejected(result, 'ADVISORY_RANGE_MISMATCH');
  });

  it('L21. rejects an expired exception, and accepts at the exact expiry instant', () => {
    const expired = evaluate(buildAudit(), { now: new Date('2026-11-17T00:00:00Z') });
    expectRejected(expired, 'EXCEPTION_EXPIRED');
    expect(expired.observed.expired).toBe(true);

    // Preserved from old tests 26/27: boundary is exact-millisecond.
    const atExpiry = evaluate(buildAudit(), { now: new Date('2026-11-16T23:59:59.000Z') });
    expect(atExpiry.accepted).toBe(true);
    expect(atExpiry.reasonCode).toBe('EXCEPTION_APPLIED');

    const afterExpiry = evaluate(buildAudit(), { now: new Date('2026-11-16T23:59:59.001Z') });
    expectRejected(afterExpiry, 'EXCEPTION_EXPIRED');
  });

  it('L22. rejects malformed exception schemas (fail closed)', () => {
    const noScope = makeException();
    delete noScope.scope;
    expectRejected(evaluate(buildAudit(), { exception: noScope }), 'EXCEPTION_SCHEMA_INVALID');

    expectRejected(
      evaluate(buildAudit(), { exception: makeException({ cvssVector: '' }) }),
      'EXCEPTION_SCHEMA_INVALID',
    );

    expectRejected(
      evaluate(buildAudit(), {
        exception: makeException({ allowedBarePackages: [...BARE_VULN_PACKAGES, 'eslint'] }),
      }),
      'EXCEPTION_SCHEMA_INVALID',
    );

    expectRejected(
      evaluate(buildAudit(), { exception: makeException({ upstreamLinks: ['not-a-url'] }) }),
      'EXCEPTION_SCHEMA_INVALID',
    );

    // An exception that authorizes nothing in its governed scope is invalid.
    expectRejected(
      evaluate(buildAudit(), { exception: makeException({ allowedBarePackages: [] }) }),
      'EXCEPTION_SCHEMA_INVALID',
    );
  });

  it('L22b. rejects an exception missing owner or expiryDate (preserved from old test 25)', () => {
    const noOwner = makeException();
    delete noOwner.owner;
    expectRejected(evaluate(buildAudit(), { exception: noOwner }), 'EXCEPTION_SCHEMA_INVALID');

    const noExpiry = makeException();
    delete noExpiry.expiryDate;
    expectRejected(evaluate(buildAudit(), { exception: noExpiry }), 'EXCEPTION_SCHEMA_INVALID');
  });

  it('L23. rejects malformed audit JSON', () => {
    expectRejected(evaluate('not json at all'), 'AUDIT_JSON_MALFORMED');
    expectRejected(evaluate('[1, 2, 3]'), 'AUDIT_JSON_MALFORMED');
  });

  it('L24. classifies empty npm output as an infrastructure failure', () => {
    expect(classifyScopeOutcome({ ok: true, exitCode: 1, stdout: '' }, null)).toBe('infrastructure');
    expect(classifyScopeOutcome({ ok: true, exitCode: 0, stdout: '' }, null)).toBe('infrastructure');
  });

  it('L25. classifies an npm spawn failure as an infrastructure failure (helper boundary)', async () => {
    const missing = path.join(tmpDir, 'no-such-npm');
    const run = await runNpmAudit({ npmPath: missing, args: ['audit', '--json'], cwd: tmpDir });
    expect(run.ok).toBe(false);
    expect(classifyScopeOutcome(run, null)).toBe('infrastructure');
  });

  it('L26. classifies an unexpected npm exit code as an infrastructure failure', () => {
    expect(classifyScopeOutcome({ ok: true, exitCode: 3, stdout: '{}' }, null)).toBe('infrastructure');
    // Pure level (preserved from old test 17): the evaluator also rejects it.
    expectRejected(evaluate(CLEAN_AUDIT, { npmExitCode: 2 }), 'NPM_UNEXPECTED_EXIT_CODE');
  });

  it('L26a. evaluates a valid audit reported with exit code 1 as a policy outcome (preserved from old test 20)', () => {
    const run = { ok: true, exitCode: 1, stdout: JSON.stringify(buildAudit()) };
    expect(classifyScopeOutcome(run, null)).toBe('infrastructure');
    expect(classifyScopeOutcome(run, evaluate(buildAudit()))).toBe('accepted');
  });

  it('L29. resolves a validated NPM_PATH before every other candidate (K order)', () => {
    const explicit = writeFakeNpm('explicit/fake-npm.js', FAKE_CLEAN_SCRIPT);
    const execpath = writeFakeNpm('execpath/fake-npm.js', FAKE_CLEAN_SCRIPT);
    const resolved = resolveNpmPath({
      NODE_ENV: 'test',
      NPM_PATH: explicit,
      npm_execpath: execpath,
      HOME: tmpDir,
    });
    expect(resolved).toBe(explicit);
  });

  it('L31a. a wrong advisory cannot be hidden by package propagation strings', () => {
    // Every other entry propagates through 'minimatch' (string via refs), but
    // the concrete advisory object carries the wrong source.
    const result = evaluate(buildAudit({ advisory: makeAdvisory({ source: 1244013 }) }));
    expectRejected(result, 'ADVISORY_SOURCE_MISMATCH');
  });

  it('L31b. rejects a via propagation to a package outside the inventory', () => {
    const result = evaluate(
      buildAudit({
        extraEntries: {
          eslint: { ...makePropagatedEntry('eslint'), via: ['minimatch', '@types/node'] },
        },
      }),
    );
    expectRejected(result, 'VIA_PACKAGE_NOT_ALLOWED');
    expect(result.summary).toContain('@types/node');
  });

  it('L31c. rejects a malformed via reference', () => {
    const result = evaluate(
      buildAudit({
        extraEntries: {
          eslint: { ...makePropagatedEntry('eslint'), via: [123] },
        },
      }),
    );
    expectRejected(result, 'MALFORMED_VIA_REFERENCE');
  });

  it('L32. keeps the raw audit package inventory visible on rejection', () => {
    const result = expectRejected(
      evaluate(
        buildAudit({
          extraEntries: { 'left-pad': makePropagatedEntry('left-pad') },
          totals: { moderate: 14, total: 14 },
        }),
      ),
      'UNEXPECTED_VULNERABLE_PACKAGE',
    );
    expect(result.observed.vulnerabilityPackages).toEqual(
      [...BARE_VULN_PACKAGES, 'left-pad'].sort(),
    );
  });

  // --- preserved Phase 14 behaviors ---------------------------------------

  it('33. accepts when the CVE is absent from the audit but primary identifiers match', () => {
    const advisory = makeAdvisory();
    delete advisory.cve;
    const result = evaluate(buildAudit({ advisory }));
    expect(result.accepted).toBe(true);
    expect(result.reasonCode).toBe('EXCEPTION_APPLIED');
  });

  it('34. rejects an explicit conflicting CVE identifier', () => {
    const result = evaluate(buildAudit({ advisory: makeAdvisory({ cve: 'CVE-9999-0001' }) }));
    expectRejected(result, 'CVE_MISMATCH');
  });

  it('35. rejects a registry/network error body reported as JSON with exit code 1', () => {
    const result = evaluate(
      JSON.stringify({ message: 'getaddrinfo ENOTFOUND registry.npmjs.org', code: 'ENOTFOUND' }),
    );
    expectRejected(result, 'NPM_INFRASTRUCTURE_FAILURE');
  });

  it('36. pure evaluation does not depend on process.env values', () => {
    const audit = buildAudit();
    const before = evaluate(audit);
    const savedNpmPath = process.env.NPM_PATH;
    const savedExecpath = process.env.npm_execpath;
    process.env.NPM_PATH = path.join(tmpDir, 'does-not-exist', 'npm-cli.js');
    process.env.npm_execpath = '';
    try {
      const after = evaluate(audit);
      expect(after.accepted).toBe(before.accepted);
      expect(after.reasonCode).toBe(before.reasonCode);
    } finally {
      if (savedNpmPath === undefined) {
        delete process.env.NPM_PATH;
      } else {
        process.env.NPM_PATH = savedNpmPath;
      }
      if (savedExecpath === undefined) {
        delete process.env.npm_execpath;
      } else {
        process.env.npm_execpath = savedExecpath;
      }
    }
  });

  it('37. rejects a production finding whose content is the bare inventory (scope gate first)', () => {
    const result = evaluate(buildAudit(), { scope: 'production' });
    expectRejected(result, 'SCOPE_MISMATCH');
  });

  it('38. rejects an audit metadata total that hides extra findings', () => {
    // 13 packages reported, but metadata claims only 12 moderate.
    const result = evaluate(buildAudit({ totals: { moderate: 12, total: 12 } }));
    expectRejected(result, 'SEVERITY_TOTALS_MISMATCH');
  });
});

describe('audit-policy (Phase 16B) — npm resolution (K)', () => {
  it('L27. accepts an NPM_PATH containing spaces (validated file, no shell)', () => {
    const spacedDir = path.join(os.tmpdir(), `p16b npm gate spaced ${Date.now()}`);
    try {
      fs.mkdirSync(spacedDir, { recursive: true });
      const spacedNpm = path.join(spacedDir, 'fake npm with space.js');
      fs.writeFileSync(spacedNpm, FAKE_CLEAN_SCRIPT, 'utf8');
      expect(resolveNpmPath({ NODE_ENV: 'test', NPM_PATH: spacedNpm })).toBe(spacedNpm);
      // A spaced path that does not exist is rejected, not passed through.
      expect(resolveNpmPath({ NODE_ENV: 'test', NPM_PATH: path.join(spacedDir, 'missing spaced npm.js') })).toBeNull();
    } finally {
      fs.rmSync(spacedDir, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform !== 'win32')(
    'L28. falls back to a validated npm_execpath before prefix candidates (Windows)',
    () => {
      const execpath = writeFakeNpm('execpath/fake-npm.js', FAKE_CLEAN_SCRIPT);
      const resolved = resolveNpmPath({ NODE_ENV: 'test', NPM_PATH: '', npm_execpath: execpath, HOME: tmpDir });
      expect(resolved).toBe(execpath);
      // A non-existent npm_execpath is not accepted.
      expect(
        resolveNpmPath({
          NODE_ENV: 'test',
          NPM_PATH: '',
          npm_execpath: path.join(tmpDir, 'missing', 'npm-cli.js'),
          HOME: tmpDir,
        }),
      ).not.toBe(path.join(tmpDir, 'missing', 'npm-cli.js'));
    },
  );

  it('L29b. a direct prefix candidate is returned without a filesystem walk (Windows)', () => {
    if (process.platform !== 'win32') {
      // Non-Windows platforms resolve the npm command from PATH.
      expect(resolveNpmPath({ NODE_ENV: 'test' })).toBe('npm');
      return;
    }
    const resolved = resolveNpmPath({ NODE_ENV: 'test', NPM_PATH: '', npm_execpath: '', HOME: tmpDir });
    expect(resolved).toBeTruthy();
    expect(resolved).toMatch(/node_modules[\\/]npm[\\/]bin[\\/]npm-cli\.js$/);
    if (resolved === null) {
      throw new Error('type narrowing: a string resolution is expected here');
    }
    expect(fs.statSync(resolved).isFile()).toBe(true);
  });

  it('L30a. BFS finds shallow candidates before deep ones', () => {
    const root = tmp('bfs');
    fs.mkdirSync(path.join(root, 'zzz'), { recursive: true });
    fs.mkdirSync(path.join(root, 'aaa', 'bbb'), { recursive: true });
    fs.writeFileSync(path.join(root, 'zzz', 'npm-cli.js'), '', 'utf8');
    fs.writeFileSync(path.join(root, 'aaa', 'bbb', 'npm-cli.js'), '', 'utf8');
    expect(findNpmCli(root)).toBe(path.join(root, 'zzz', 'npm-cli.js'));
  });

  it('L30b. the bounded BFS terminates at the visit cap', () => {
    const root = tmp('bfs-bounded');
    fs.mkdirSync(path.join(root, 'a', 'b', 'c', 'd'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a', 'b', 'c', 'd', 'npm-cli.js'), '', 'utf8');
    // No npm-cli.js within 1 or 2 directory visits.
    expect(findNpmCli(root, 1)).toBeNull();
    expect(findNpmCli(root, 2)).toBeNull();
    // Within the default bound the CLI is still found (depth 4).
    expect(findNpmCli(root)).toBe(path.join(root, 'a', 'b', 'c', 'd', 'npm-cli.js'));
    expect(NPM_SEARCH_VISIT_CAP).toBe(1000);
  });

  it('L30c. a missing root terminates the BFS', () => {
    expect(findNpmCli(path.join(tmpDir, 'absent'))).toBeNull();
  });
});

describe('audit-policy (Phase 16B) — end-to-end CLI exit codes', () => {
  it('L24b. exits 2 when npm produces no output (infrastructure)', async () => {
    const fakeNpm = writeFakeNpm('bin/fake-npm-empty.js', 'process.exit(1);\n');
    const result = await runCli({ NPM_PATH: fakeNpm });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('NPM_EMPTY_OUTPUT');
    expect(result.stderr).toContain('INFRASTRUCTURE FAILURE');
  });

  it('L25b. exits 2 when the npm CLI cannot be resolved (spawn failure class)', async () => {
    const missing = path.join(tmpDir, 'no-such-npm-cli.js');
    const result = await runCli({ NPM_PATH: missing });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('could not resolve an npm CLI');
  });

  it('L26b. exits 2 when npm exits with an unexpected code', async () => {
    const fakeNpm = writeFakeNpm('bin/fake-npm-exit3.js', 'process.exit(3);\n');
    const result = await runCli({ NPM_PATH: fakeNpm });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('NPM_UNEXPECTED_EXIT_CODE');
  });

  it('L27b. runs both scopes and exits 0 with a spaced NPM_PATH (clean audits)', async () => {
    const spacedDir = path.join(os.tmpdir(), `p16b npm gate e2e ${Date.now()}`);
    try {
      fs.mkdirSync(spacedDir, { recursive: true });
      const spacedNpm = path.join(spacedDir, 'clean npm.js');
      fs.writeFileSync(spacedNpm, FAKE_CLEAN_SCRIPT, 'utf8');
      const result = await runCli({ NPM_PATH: spacedNpm });
      expect(result.code).toBe(0);
      expect(result.stderr).toContain('CLEAN_AUDIT');
      expect(result.stderr).toContain('result: ACCEPTED (exit 0)');
    } finally {
      fs.rmSync(spacedDir, { recursive: true, force: true });
    }
  });

  it('L32b. prints the raw package inventory and exits 1 on policy rejection', async () => {
    const badAudit = buildAudit({
      extraEntries: { 'left-pad': makePropagatedEntry('left-pad') },
      totals: { moderate: 14, total: 14 },
    });
    const fakeNpm = writeFakeNpm(
      'bin/fake-npm-bad.js',
      `process.stdout.write(${JSON.stringify(JSON.stringify(badAudit))});\nprocess.exit(1);\n`,
    );
    const result = await runCli({ NPM_PATH: fakeNpm });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('raw audit package inventory');
    expect(result.stderr).toContain('left-pad');
    expect(result.stderr).toContain('POLICY REJECTED (exit 1)');
  });
});
