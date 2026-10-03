/**
 * Phase 14 — BRACES-EXC unit-test matrix.
 *
 * Every fixture is a synthetic object derived from the approved live audit
 * shapes (`npm audit --omit=dev --json` = 5 production package entries;
 * `npm audit --json` = 7 bare package entries; one underlying advisory object
 * with npm audit source 1240992). No npm command and no registry call runs
 * inside this suite: `evaluateAuditPolicy` is a pure function and `now` is
 * injected.
 *
 * Fail-closed orientation: the only states that accept are the exact approved
 * production shape, the exact approved bare shape, a genuinely clean audit, and
 * the exact-expiry boundary. Every other fixture must reject.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { evaluateAuditPolicy } from '../scripts/audit-policy.mjs';

type AuditPolicyResult = {
  accepted: boolean;
  reasonCode: string;
  summary: string;
  observed: {
    scope: 'production' | 'bare';
    npmExitCode: number | null;
    totalVulnerabilities: number | null;
    vulnerabilityPackages: string[];
    advisoryObjects: unknown[];
    installedBracesVersion: string | null;
    exceptionId: string | null;
    exceptionExpiryDate: string | null;
    expired: boolean | null;
  };
};

// Fixtures always carry the exact parsed audit shape; only the two malformed
// fixtures deliberately break it, and they cast inline. Declaring the field as
// `AuditJson` (not a string union) keeps the mutation assertions well typed.
type AuditPolicyInput = {
  auditJson: AuditJson;
  npmExitCode: number;
  scope: 'production' | 'bare';
  exception: Record<string, unknown>;
  now: string | number | Date;
  installedVersions?: Record<string, string> | null;
};

type Scope = 'production' | 'bare';

type AuditSeverity = 'info' | 'low' | 'moderate' | 'high' | 'critical';

type AdvisoryObject = {
  source: number;
  name: string;
  dependency: string;
  title: string;
  url: string;
  severity: AuditSeverity;
  cwe?: string[];
  cvss: { score: number; vectorString: string };
  range: string;
  cve?: string;
};

type VulnerabilityEntry = {
  name: string;
  severity: AuditSeverity;
  isDirect: boolean;
  via: Array<string | AdvisoryObject>;
  effects: string[];
  range: string;
  nodes: string[];
  fixAvailable?: Record<string, unknown> | false;
};

type AuditJson = {
  auditReportVersion: number;
  vulnerabilities: Record<string, VulnerabilityEntry>;
  metadata: {
    vulnerabilities: { info: number; low: number; moderate: number; high: number; critical: number; total: number };
    dependencies: Record<string, number>;
  };
};

/**
 * The approved advisory object, as npm audit emits it inside the single `via`
 * array on the `braces` entry. Built as a factory so every fixture gets its own
 * copy: the drift tests mutate individual fields in place.
 */
function ADVISORY(): AdvisoryObject {
  return {
    source: 1240992,
    name: 'braces',
    dependency: 'braces',
    title: 'braces vulnerable to stack-exhaustion denial of service through deeply nested patterns',
    url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
    severity: 'high',
    cwe: ['CWE-674'],
    cvss: {
      score: 7.5,
      vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H',
    },
    range: '<=3.0.3',
  };
}

const INSTALLED_VERSIONS = { braces: '3.0.3' };

const WITHIN_WINDOW = '2026-10-10T00:00:00Z';
const EXPIRY = '2026-10-17T23:59:59Z';
const ONE_MS_AFTER_EXPIRY = '2026-10-18T00:00:00Z';
const MALFORMED_JSON = '{"auditReportVersion": 2, "vulnerabilities": {';

type VulnerabilityEntries = Record<string, VulnerabilityEntry>;

function productionPackageEntries(): VulnerabilityEntries {
  return {
    braces: {
      name: 'braces',
      severity: 'high',
      isDirect: false,
      via: [ADVISORY()],
      effects: ['chokidar', 'micromatch'],
      range: '*',
      nodes: ['node_modules/braces'],
      fixAvailable: { name: 'tailwindcss', version: '4.3.3', isSemVerMajor: true },
    },
    chokidar: {
      name: 'chokidar',
      severity: 'high',
      isDirect: false,
      via: ['braces'],
      effects: ['tailwindcss'],
      range: '2.0.0 - 3.6.0',
      nodes: ['node_modules/chokidar'],
      fixAvailable: { name: 'tailwindcss', version: '4.3.3', isSemVerMajor: true },
    },
    'fast-glob': {
      name: 'fast-glob',
      severity: 'high',
      isDirect: false,
      via: ['micromatch'],
      effects: ['tailwindcss'],
      range: '*',
      nodes: ['node_modules/fast-glob'],
      fixAvailable: { name: 'tailwindcss', version: '4.3.3', isSemVerMajor: true },
    },
    micromatch: {
      name: 'micromatch',
      severity: 'high',
      isDirect: false,
      via: ['braces'],
      effects: ['fast-glob', 'tailwindcss'],
      range: '>=0.2.0',
      nodes: ['node_modules/micromatch'],
      fixAvailable: { name: 'tailwindcss', version: '4.3.3', isSemVerMajor: true },
    },
    tailwindcss: {
      name: 'tailwindcss',
      severity: 'high',
      isDirect: true,
      via: ['chokidar', 'fast-glob', 'micromatch'],
      effects: [],
      range: '<=0.0.0-oxide-insiders.ff2c25f || 2.1.0-canary.1 - 3.4.19',
      nodes: ['node_modules/tailwindcss'],
      fixAvailable: { name: 'tailwindcss', version: '4.3.3', isSemVerMajor: true },
    },
  };
}

function barePackageEntries(): VulnerabilityEntries {
  const entries = productionPackageEntries();
  entries['@next/eslint-plugin-next'] = {
    name: '@next/eslint-plugin-next',
    severity: 'high',
    isDirect: false,
    via: ['fast-glob'],
    effects: ['eslint-config-next'],
    range: '>=14.3.0-canary.0',
    nodes: ['node_modules/@next/eslint-plugin-next'],
    fixAvailable: { name: 'eslint-config-next', version: '14.2.35', isSemVerMajor: true },
  };
  entries['eslint-config-next'] = {
    name: 'eslint-config-next',
    severity: 'high',
    isDirect: true,
    via: ['@next/eslint-plugin-next'],
    effects: [],
    range: '>=14.3.0-canary.0',
    nodes: ['node_modules/eslint-config-next'],
    fixAvailable: { name: 'eslint-config-next', version: '14.2.35', isSemVerMajor: true },
  };
  entries['fast-glob'].nodes = [
    'node_modules/@next/eslint-plugin-next/node_modules/fast-glob',
    'node_modules/fast-glob',
  ];
  return entries;
}

function productionAudit(): AuditJson {
  return {
    auditReportVersion: 2,
    vulnerabilities: productionPackageEntries(),
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 5, critical: 0, total: 5 },
      dependencies: { prod: 407, dev: 409, optional: 92, peer: 9, peerOptional: 0, total: 854 },
    },
  };
}

function bareAudit(): AuditJson {
  return {
    auditReportVersion: 2,
    vulnerabilities: barePackageEntries(),
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 7, critical: 0, total: 7 },
      dependencies: { prod: 407, dev: 409, optional: 92, peer: 9, peerOptional: 0, total: 854 },
    },
  };
}

function cleanAudit(): AuditJson {
  return {
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
      dependencies: { prod: 407, dev: 409, optional: 92, peer: 9, peerOptional: 0, total: 854 },
    },
  };
}

function productionFixture(): AuditPolicyInput {
  return {
    auditJson: productionAudit(),
    npmExitCode: 1,
    scope: 'production',
    exception: APPROVED_EXCEPTION(),
    now: WITHIN_WINDOW,
    installedVersions: INSTALLED_VERSIONS,
  };
}

function bareFixture(): AuditPolicyInput {
  return {
    auditJson: bareAudit(),
    npmExitCode: 1,
    scope: 'bare',
    exception: APPROVED_EXCEPTION(),
    now: WITHIN_WINDOW,
    installedVersions: INSTALLED_VERSIONS,
  };
}

/**
 * The approved exception record. Built inline (not imported from the config
 * file) so each fixture can mutate a single field without touching the
 * on-disk record, and so the matrix stays self-describing.
 */
function APPROVED_EXCEPTION() {
  return {
    schemaVersion: 1,
    id: 'BRACES-EXC-2026-10-03-GHSA-vfj7-8cjw-p6xm',
    advisory: 'GHSA-vfj7-8cjw-p6xm',
    cve: 'CVE-2026-93687',
    npmAuditSource: 1240992,
    package: 'braces',
    affectedVersion: '3.0.3',
    severity: 'high',
    cvssScore: 7.5,
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H',
    allowedProductionPackages: ['braces', 'chokidar', 'fast-glob', 'micromatch', 'tailwindcss'],
    allowedBarePackages: [
      '@next/eslint-plugin-next',
      'braces',
      'chokidar',
      'eslint-config-next',
      'fast-glob',
      'micromatch',
      'tailwindcss',
    ],
    owner: 'Repository maintainer',
    rationale: 'No patched release exists; build-time-only exposure; temporary exception.',
    approvalDate: '2026-10-03',
    expiryDate: EXPIRY,
    reviewCadenceDays: 7,
    reviewInstructions: 'Run npm view braces dist-tags.latest every 7 days.',
    upstreamLinks: [
      'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
      'https://nvd.nist.gov/vuln/detail/CVE-2026-93687',
      'https://github.com/micromatch/braces/issues/70',
      'https://github.com/micromatch/braces/issues/73',
      'https://github.com/micromatch/braces/pull/72',
    ],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * The concrete advisory object on the `braces` entry's `via` array. The union
 * member is always the object form in these fixtures, but the array's element
 * type admits strings too, so narrowing needs this helper.
 */
function advisoryOf(fixture: AuditPolicyInput): AdvisoryObject {
  const via = fixture.auditJson.vulnerabilities.braces.via;
  if (typeof via[0] !== 'object' || via[0] === null) {
    throw new Error('fixture invariant violated: braces.via[0] must be the advisory object');
  }
  return via[0];
}

function evaluate(input: AuditPolicyInput) {
  return evaluateAuditPolicy(input);
}

function expectRejected(result: AuditPolicyResult, ...expectedCodes: string[]) {
  expect(result.accepted, `expected rejection, got ${result.reasonCode}: ${result.summary}`).toBe(false);
  if (expectedCodes.length > 0) {
    expect(expectedCodes).toContain(result.reasonCode);
  }
}

function expectAccepted(result: AuditPolicyResult, reasonCode?: string) {
  expect(result.accepted, `expected acceptance, got ${result.reasonCode}: ${result.summary}`).toBe(true);
  if (reasonCode) {
    expect(result.reasonCode).toBe(reasonCode);
  }
}

let savedEnv: Record<string, string | undefined>;

describe('audit-policy — production positive path', () => {
  beforeEach(() => {
    savedEnv = { ...process.env };
  });
  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it('1. accepts the exact 5-package production shape under the exception', () => {
    expectAccepted(evaluate(productionFixture()), 'EXCEPTION_APPLIED');
  });

  it('2. accepts the exact 7-package bare shape under the exception', () => {
    expectAccepted(evaluate(bareFixture()), 'EXCEPTION_APPLIED');
  });

  it('3. accepts a clean production audit without using the exception', () => {
    const result = evaluateAuditPolicy({
      ...productionFixture(),
      auditJson: cleanAudit(),
      npmExitCode: 0,
    });
    expectAccepted(result, 'CLEAN_AUDIT');
  });

  it('4. accepts a clean bare audit without using the exception', () => {
    const result = evaluateAuditPolicy({
      ...bareFixture(),
      auditJson: cleanAudit(),
      npmExitCode: 0,
    });
    expectAccepted(result, 'CLEAN_AUDIT');
  });

  it('5. rejects an expired exception', () => {
    const result = evaluateAuditPolicy({ ...productionFixture(), now: ONE_MS_AFTER_EXPIRY });
    expectRejected(result, 'EXCEPTION_EXPIRED');
    expect(result.summary).toContain('expired');
  });

  it('6. rejects a wrong GHSA identifier', () => {
    const fixture = productionFixture();
    advisoryOf(fixture).url =
      'https://github.com/advisories/GHSA-aaaa-aaaa-aaaa-aaaa';
    expectRejected(evaluate(fixture), 'ADVISORY_URL_MISMATCH');
  });

  it('7. rejects a wrong npm audit source id', () => {
    const fixture = productionFixture();
    advisoryOf(fixture).source = 999999;
    expectRejected(evaluate(fixture), 'ADVISORY_SOURCE_MISMATCH');
  });

  it('8. rejects an additional concrete advisory object', () => {
    const fixture = productionFixture();
    const extra = ADVISORY();
    extra.source = 5550001;
    extra.url = 'https://github.com/advisories/GHSA-zzzz-zzzz-zzzz-zzzz';
    fixture.auditJson.vulnerabilities['some-other-package'] = {
      name: 'some-other-package',
      severity: 'high',
      isDirect: false,
      via: [extra],
      effects: [],
      range: '*',
      nodes: ['node_modules/some-other-package'],
    };
    expectRejected(evaluate(fixture), 'UNEXPECTED_VULNERABLE_PACKAGE', 'MULTIPLE_ADVISORY_OBJECTS');
  });

  it('9. rejects an additional vulnerable package entry', () => {
    const fixture = productionFixture();
    fixture.auditJson.vulnerabilities['extra-package'] = {
      name: 'extra-package',
      severity: 'high',
      isDirect: false,
      via: [ADVISORY()],
      effects: [],
      range: '*',
      nodes: ['node_modules/extra-package'],
    };
    expectRejected(evaluate(fixture), 'UNEXPECTED_VULNERABLE_PACKAGE');
  });

  it('10. rejects a missing expected package entry', () => {
    const fixture = productionFixture();
    delete fixture.auditJson.vulnerabilities.tailwindcss;
    fixture.auditJson.metadata.vulnerabilities.high = 4;
    fixture.auditJson.metadata.vulnerabilities.total = 4;
    expectRejected(evaluate(fixture), 'MISSING_EXPECTED_PACKAGE');
  });

  it('11. rejects severity drift to critical', () => {
    const fixture = productionFixture();
    advisoryOf(fixture).severity = 'critical';
    fixture.auditJson.vulnerabilities.braces.severity = 'critical';
    expectRejected(evaluate(fixture), 'ADVISORY_SEVERITY_MISMATCH');
  });

  it('12. rejects CVSS score drift', () => {
    const fixture = productionFixture();
    advisoryOf(fixture).cvss.score = 9.8;
    expectRejected(evaluate(fixture), 'CVSS_SCORE_MISMATCH');
  });

  it('13. rejects CVSS vector drift', () => {
    const fixture = productionFixture();
    advisoryOf(fixture).cvss.vectorString =
      'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N';
    expectRejected(evaluate(fixture), 'CVSS_VECTOR_MISMATCH');
  });

  it('14. rejects installed braces version drift', () => {
    const fixture = productionFixture();
    fixture.installedVersions = { braces: '3.0.4' };
    expectRejected(evaluate(fixture), 'INSTALLED_VERSION_DRIFT');
  });

  it('15. rejects malformed audit JSON', () => {
    const fixture = productionFixture();
    fixture.auditJson = MALFORMED_JSON as unknown as AuditJson;
    expectRejected(evaluate(fixture), 'AUDIT_JSON_MALFORMED');
  });

  it('16. rejects empty stdout', () => {
    const fixture = productionFixture();
    fixture.auditJson = '' as unknown as AuditJson;
    expectRejected(evaluate(fixture), 'AUDIT_JSON_MALFORMED');
  });

  it('17. rejects an npm exit code of 2', () => {
    const fixture = productionFixture();
    fixture.npmExitCode = 2;
    expectRejected(evaluate(fixture), 'NPM_UNEXPECTED_EXIT_CODE');
  });

  it('18. rejects a spawn failure at the CLI helper boundary', async () => {
    const { runNpmAudit } = await import('../scripts/audit-policy.mjs');
    const result = await runNpmAudit({
      npmPath: 'definitely-not-a-real-executable-9f3a',
      args: ['audit', '--json'],
      cwd: process.cwd(),
    });
    expect(result.ok).toBe(false);
    expect(result.error).not.toBe(null);
  });

  it('19. rejects a registry/network error reported as JSON', () => {
    const fixture = productionFixture();
    fixture.auditJson = {
      error: { code: 'EAI_AGAIN', summary: 'request to https://registry.npmjs.org/braces failed' },
    } as unknown as AuditJson;
    fixture.npmExitCode = 1;
    expectRejected(evaluate(fixture), 'NPM_INFRASTRUCTURE_FAILURE');
  });

  it('20. evaluates a valid audit exit code 1 normally (not as an infrastructure failure)', () => {
    const result = evaluate(productionFixture());
    expectAccepted(result, 'EXCEPTION_APPLIED');
    expect(result.observed.npmExitCode).toBe(1);
  });

  it('21. accepts when the CVE is absent from the audit JSON but primary identifiers match', () => {
    const fixture = productionFixture();
    // The live npm audit JSON carries no CVE field on the advisory object; the
    // exception record still records CVE-2026-93687.
    expect(advisoryOf(fixture).cve).toBeUndefined();
    expectAccepted(evaluate(fixture), 'EXCEPTION_APPLIED');
  });

  it('22. rejects an explicit conflicting CVE identifier', () => {
    const fixture = productionFixture();
    advisoryOf(fixture).cve = 'CVE-9999-00001';
    expectRejected(evaluate(fixture), 'CVE_CONFLICT');
  });

  it('23. rejects an unknown string "via" package reference', () => {
    const fixture = productionFixture();
    fixture.auditJson.vulnerabilities.chokidar.via = ['not-an-approved-package'];
    expectRejected(evaluate(fixture), 'VIA_PACKAGE_NOT_ALLOWED');
  });

  it('24. rejects a malformed "via" entry', () => {
    const fixture = productionFixture();
    fixture.auditJson.vulnerabilities.braces.via = [42] as unknown as Array<string | AdvisoryObject>;
    expectRejected(evaluate(fixture), 'VIA_MALFORMED');
  });

  it('25. rejects an exception schema missing owner or expiry', () => {
    const fixture = productionFixture();
    const noOwner = clone(fixture.exception);
    delete noOwner.owner;
    expectRejected(evaluateAuditPolicy({ ...fixture, exception: noOwner }), 'EXCEPTION_SCHEMA_INVALID');

    const noExpiry = clone(fixture.exception);
    delete noExpiry.expiryDate;
    expectRejected(evaluateAuditPolicy({ ...fixture, exception: noExpiry }), 'EXCEPTION_SCHEMA_INVALID');
  });

  it('26. accepts at the exact expiry timestamp', () => {
    const result = evaluateAuditPolicy({ ...productionFixture(), now: EXPIRY });
    expectAccepted(result, 'EXCEPTION_APPLIED');
    expect(result.observed.expired).toBe(false);
  });

  it('27. rejects one millisecond after expiry', () => {
    const result = evaluateAuditPolicy({
      ...productionFixture(),
      now: '2026-10-17T23:59:59.001Z',
    });
    expectRejected(result, 'EXCEPTION_EXPIRED');
  });

  it('28. rejects the production shape evaluated as bare', () => {
    const fixture = productionFixture();
    const result = evaluateAuditPolicy({ ...fixture, scope: 'bare' as Scope });
    expectRejected(result, 'MISSING_EXPECTED_PACKAGE');
  });

  it('29. rejects the bare shape evaluated as production', () => {
    const fixture = bareFixture();
    const result = evaluateAuditPolicy({ ...fixture, scope: 'production' as Scope });
    expectRejected(result, 'UNEXPECTED_VULNERABLE_PACKAGE');
  });

  it('30. does not depend on process.env values', () => {
    const baseline = evaluate(productionFixture());
    process.env.AUDIT_POLICY_FORCE_PASS = '1';
    process.env.BRACES_EXCEPTION_OVERRIDE = 'accept-everything';
    const mutated = evaluate(productionFixture());
    expect(mutated.accepted).toBe(baseline.accepted);
    expect(mutated.reasonCode).toBe(baseline.reasonCode);
    expect(mutated.summary).toBe(baseline.summary);
    delete process.env.AUDIT_POLICY_FORCE_PASS;
    delete process.env.BRACES_EXCEPTION_OVERRIDE;
  });

  it('additionally rejects a total/high metadata mismatch (extra hidden finding)', () => {
    const fixture = productionFixture();
    fixture.auditJson.metadata.vulnerabilities.critical = 1;
    expectRejected(evaluate(fixture), 'SEVERITY_TOTALS_NONHIGH');
  });

  it('additionally rejects a bare advisory whose package name drifts', () => {
    const fixture = bareFixture();
    advisoryOf(fixture).dependency = 'micromatch';
    advisoryOf(fixture).name = 'micromatch';
    expectRejected(evaluate(fixture), 'ADVISORY_PACKAGE_MISMATCH');
  });
});
