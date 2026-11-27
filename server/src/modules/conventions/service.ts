import { createHash } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { DEFAULT_BRANCH } from './branch.js';
import type { ConventionCandidate, ConventionDecision, ConventionScan, ConventionSkillDraft, ConventionSkippedFile, ConventionsPage } from '@devdigest/shared';
import { conventions, jobs, repos } from '../../db/schema.js';
import type { Db } from '../../db/client.js';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError, ResponseTokenLimitError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { RepoRepository, type RepoRow } from '../repos/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { findConventionSkill, insertSkillVersionOne } from '../skills/repository.js';
import {
  BATCH_CHAR_LIMIT, corroboratedConventions, conventionKey, extractConventions,
  DEFAULT_MAX_RESPONSE_TOKENS, FILE_BYTE_LIMIT, sourceWindows, type GroundedConvention, type SourceWindow,
} from './extract.js';
import { corroborationFiles, FOCUS_FILE_LIMIT, inFocus, normalizeFocus, prioritizeFocusFiles, suggestFocus } from './focus.js';

const KIND = 'conventions-scan';
const SCAN_TIMEOUT = 10 * 60_000;
const SCAN_JOB_TIMEOUT = SCAN_TIMEOUT + 15_000;
const QUEUE_EXPIRY = 10 * 60_000;
const ATTEMPT_HISTORY_LIMIT = 10;
const NEW_FINDING_LIMIT = 5;
type Job = typeof jobs.$inferSelect;
type Finding = typeof conventions.$inferSelect;
type ReadDb = Pick<Db, 'select'>;
type ScanInput = {
  workspaceId: string; repoId: string; branch: string; commit: string;
  directory: string;
  fileLimit: number;
  maxResponseTokens: number;
  modelChoice: NonNullable<ConventionScan['model_choice']>;
};
type ScanPayload = Omit<ScanInput, 'modelChoice' | 'directory' | 'fileLimit' | 'maxResponseTokens'> & {
  modelChoice?: ScanInput['modelChoice']; files?: number; skipped?: number;
  directory?: string; budgetReached?: boolean;
  fileLimit?: number;
  maxResponseTokens?: number;
  selectedPaths?: string[];
  skippedPaths?: ConventionSkippedFile[];
  findings?: number; changes?: ConventionScan['changes'];
};
type FindingEdit = { revision: string; rule?: string; scope?: string; decision?: ConventionDecision };
type SkillSave = Pick<ConventionSkillDraft, 'revision' | 'name' | 'description' | 'body'> & { requestId: string };

function hash(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function findingRevision(row: Finding): string {
  return hash([row.id, row.rule, row.scope, row.decision, row.decidedAt]);
}

function findingsInRepo(repo: RepoRow) {
  return and(eq(conventions.workspaceId, repo.workspaceId), eq(conventions.repoId, repo.id));
}

function scansInRepo(repo: RepoRow, branch?: string) {
  return and(eq(jobs.workspaceId, repo.workspaceId), eq(jobs.kind, KIND), sql<boolean>`${jobs.payload}->>'repoId' = ${repo.id}`,
    branch === undefined ? undefined : sql<boolean>`${jobs.payload}->>'branch' = ${branch}`);
}

async function scanFor(db: ReadDb, repo: RepoRow, done = false, branch?: string): Promise<Job | undefined> {
  const [row] = await db.select().from(jobs)
    .where(and(scansInRepo(repo, branch), done ? eq(jobs.status, 'done') : undefined))
    .orderBy(desc(jobs.scheduledAt), desc(jobs.id)).limit(1);
  return row;
}

function activeScan(job: Job) {
  if (job.status === 'queued') return Date.now() - job.scheduledAt.getTime() < QUEUE_EXPIRY;
  return job.status === 'running' && Date.now() - (job.startedAt ?? job.scheduledAt).getTime() < SCAN_JOB_TIMEOUT;
}

function scanDto(job: Job, repo: RepoRow, legacyFindings?: number): ConventionScan {
  const payload = job.payload as ScanPayload;
  const expired = (job.status === 'queued' || job.status === 'running') && !activeScan(job);
  return {
    id: job.id, status: expired ? 'failed' : job.status, branch: payload.branch, commit: payload.commit,
    commit_url: 'https://github.com/' + [repo.owner, repo.name, 'commit', payload.commit].map(encodeURIComponent).join('/'),
    branch_url: 'https://github.com/' + [repo.owner, repo.name, 'tree', ...payload.branch.split('/')].map(encodeURIComponent).join('/'),
    queued_at: job.scheduledAt.toISOString(),
    model_choice: payload.modelChoice ?? null,
    findings_count: job.status === 'done' ? payload.findings ?? legacyFindings ?? null : null,
    files_analyzed: payload.files ?? null, branch_files_skipped: payload.skipped ?? null, changes: payload.changes ?? null,
    focus_directory: payload.directory === '.' && payload.fileLimit !== undefined ? null : payload.directory ?? null,
    file_budget_reached: payload.budgetReached ?? null,
    file_limit: payload.fileLimit ?? null,
    max_response_tokens: payload.maxResponseTokens ?? null,
    selected_files: payload.selectedPaths ?? null,
    skipped_files: payload.skippedPaths ?? null,
    finished_at: job.finishedAt?.toISOString() ?? null,
    error: expired ? 'The scan was interrupted. Run it again.' : job.error,
  };
}

async function recentAttempts(db: ReadDb, repo: RepoRow, branch: string): Promise<ConventionScan[]> {
  const history = await db.select().from(jobs).where(scansInRepo(repo, branch))
    .orderBy(desc(jobs.scheduledAt), desc(jobs.id)).limit(ATTEMPT_HISTORY_LIMIT);
  const legacyIds = history.filter((job) => job.status === 'done' && (job.payload as ScanPayload).findings === undefined)
    .map(({ id }) => id);
  const legacyCounts = legacyIds.length ? await db.select({ id: conventions.scanId, total: count() }).from(conventions)
    .where(and(findingsInRepo(repo), inArray(conventions.scanId, legacyIds), isNull(conventions.previousEvidenceCommit)))
    .groupBy(conventions.scanId) : [];
  const counts = new Map(legacyCounts.map(({ id, total }) => [id, total]));
  return history.map((job) => scanDto(job, repo, counts.get(job.id) ?? 0));
}

function loadFindings(db: ReadDb, repo: RepoRow, scanId: string) {
  return db.select().from(conventions).where(and(findingsInRepo(repo), eq(conventions.scanId, scanId)))
    .orderBy(asc(conventions.originalRule), asc(conventions.originalScope), asc(conventions.id));
}

function candidateDto(row: Finding, repo: RepoRow, commit: string): ConventionCandidate {
  const origin = 'https://github.com/' + [repo.owner, repo.name, 'blob', row.previousEvidenceCommit ?? commit].map(encodeURIComponent).join('/');
  return {
    id: row.id, rule: row.rule, scope: row.scope!, decision: row.decision, accepted: row.decision === 'accepted',
    decided_at: row.decidedAt?.toISOString() ?? null,
    carried_forward: row.previousEvidenceCommit !== null,
    confidence: row.confidence!, evidence_path: row.evidencePath!, evidence_snippet: row.evidenceSnippet!,
    evidence: row.evidence!.map((item) => ({
      ...item, url: origin + '/' + item.path.split('/').map(encodeURIComponent).join('/')
        + '#L' + item.start_line + '-L' + item.end_line,
    })),
    revision: findingRevision(row),
  };
}

function skillDraft(repo: RepoRow, scan: Job | undefined, rows: Finding[]): ConventionSkillDraft {
  if (!scan || !rows.length) throw new AppError('no_accepted_conventions', 'Accept a finding before creating a skill.', 409);
  return {
    revision: hash([repo.workspaceId, repo.id, scan.id, rows.map(findingRevision)]),
    accepted_count: rows.length,
    name: repo.name + '-conventions',
    description: 'Coding conventions reviewed for ' + repo.fullName + ' on ' + (scan.payload as ScanPayload).branch,
    body: '# Repository conventions\n\n' + rows.map(({ rule, scope }) =>
      '- **Applies to** ' + scope + '\n  ' + rule.replace(/\r?\n/g, '\n  ')).join('\n\n') + '\n',
  };
}

export class ConventionsService {
  private readonly repositories: RepoRepository;

  constructor(private readonly container: Container) {
    this.repositories = new RepoRepository(container.db);
  }

  register() {
    this.container.jobs.register(KIND, (input, { jobId }) => this.run(jobId, input as ScanInput), { timeoutMs: SCAN_JOB_TIMEOUT });
  }

  async repo(workspaceId: string, id: string) {
    const repo = await this.repositories.getById(workspaceId, id);
    if (!repo) throw new NotFoundError('Repository not found.');
    return repo;
  }

  async page(repo: RepoRow, branch: string): Promise<ConventionsPage> {
    const db = this.container.db;
    const [attempts, recent] = await Promise.all([recentAttempts(db, repo, branch), scanFor(db, repo)]);
    const latest = attempts[0] ?? null;
    let successful = attempts.find(({ status }) => status === 'done') ?? null;
    if (!successful && attempts.length === ATTEMPT_HISTORY_LIMIT) {
      const lastSuccess = await scanFor(db, repo, true, branch);
      successful = lastSuccess ? scanDto(lastSuccess, repo) : null;
    }
    const rows = successful ? await loadFindings(db, repo, successful.id) : [];
    return {
      readiness: repo.clonePath ? 'ready' : 'clone', repository: repo.fullName, latest, successful, attempts,
      active_branch: recent && activeScan(recent) ? (recent.payload as ScanPayload).branch : null,
      findings: successful ? rows.map((row) => candidateDto(row, repo, successful.commit)) : [],
    };
  }

  private async focusTree(repo: RepoRow, branch: string) {
    if (!repo.clonePath) throw new AppError('repo_not_ready', 'Wait for the repository clone to finish.', 409);
    const commit = await withTimeout(this.container.git.branchHead(repo, branch), 7_000).catch(() => {
      throw new AppError('branch_unavailable', 'Branch “' + branch + '” is unavailable locally. Sync the branch and retry.', 409);
    });
    const paths = await withTimeout(this.container.git.listTrackedSourcePaths(repo, commit), 15_000).catch(() => {
      throw new AppError('branch_unavailable', 'Could not read the local branch. Resync the repository and retry.', 409);
    });
    return { commit, paths };
  }

  async syncBranch(repo: RepoRow, branch: string) {
    if (!repo.clonePath) throw new AppError('repo_not_ready', 'Wait for the repository clone to finish.', 409);
    await withTimeout(this.container.git.fetchBranch(repo, branch), 30_000).catch(() => {
      throw new AppError('branch_sync_failed', 'Could not sync branch “' + branch + '”. Check the branch name and repository access.', 502);
    });
    return { branch };
  }

  private async graphRank(repo: RepoRow, commit: string): Promise<string[]> {
    const intel = this.container.repoIntel;
    try {
      const state = await intel.getIndexState(repo.id);
      if (state.lastIndexedSha !== commit || (state.status !== 'full' && state.status !== 'partial')) return [];
      const [paths, ranked] = await Promise.all([intel.getCriticalPaths(repo.id), intel.getConventionSamples(repo.id, 120)]);
      return [...new Set([...paths.flat(), ...ranked])];
    } catch {
      return [];
    }
  }

  private async preferredDirectory(repo: RepoRow, commit: string, paths: string[], rank: string[]) {
    const files = paths.filter((path) => /^(?:readme(?:\.[a-z]+)?|package\.json|pyproject\.toml|cargo\.toml|go\.mod|composer\.json)$/i.test(path));
    const metadata = await Promise.all(files.map((path) =>
      withTimeout(this.container.git.readSourceAt(repo, commit, path, 16_000), 5_000).catch(() => null)));
    return suggestFocus(paths, rank, metadata.join('\n'))[0] ?? '.';
  }

  async start(repo: RepoRow, options: { branch?: string; directory?: string; fileLimit?: number; maxResponseTokens?: number } = {}): Promise<ConventionScan> {
    const branch = options.branch ?? DEFAULT_BRANCH;
    const active = await scanFor(this.container.db, repo);
    if (active && activeScan(active)) return scanDto(active, repo);
    const { commit, paths } = await this.focusTree(repo, branch);
    const directory = options.directory?.trim() ? normalizeFocus(options.directory) : '.';
    if (!directory || (directory !== '.' && !prioritizeFocusFiles(paths, directory, []).length)) {
      throw new AppError('invalid_focus', 'Choose a directory with supported source files on the selected branch.', 422);
    }
    const modelChoice = await resolveFeatureModel(this.container, repo.workspaceId, 'conventions');
    const fileLimit = options.fileLimit ?? FOCUS_FILE_LIMIT;
    const maxResponseTokens = options.maxResponseTokens ?? DEFAULT_MAX_RESPONSE_TOKENS;
    const { job, input } = await this.container.db.transaction(async (tx) => {
      await this.lockRepo(tx, repo);
      const previous = await scanFor(tx, repo);
      if (previous && activeScan(previous)) return { job: previous };
      const input: ScanInput = {
        workspaceId: repo.workspaceId, repoId: repo.id, branch, commit,
        directory, fileLimit, maxResponseTokens, modelChoice,
      };
      const [job] = await tx.insert(jobs).values({
        workspaceId: repo.workspaceId, kind: KIND, payload: { ...input, selectedPaths: [], skippedPaths: [] },
      }).returning();
      return { job: job!, input };
    });
    if (input) void this.container.jobs.schedule(job.id, KIND, input).done.catch(() => {});
    return scanDto(job, repo);
  }

  async edit(repo: RepoRow, branch: string, id: string, edit: FindingEdit): Promise<ConventionCandidate> {
    return this.container.db.transaction(async (tx) => {
      await this.lockRepo(tx, repo);
      const scan = await scanFor(tx, repo, true, branch);
      if (!scan) throw new NotFoundError('Finding not found.');
      const filter = and(findingsInRepo(repo), eq(conventions.scanId, scan.id), eq(conventions.id, id));
      const [row] = await tx.select().from(conventions).where(filter);
      if (!row || findingRevision(row) !== edit.revision) {
        throw new AppError('finding_changed', 'This finding changed. Reload the findings and try again.', 409);
      }
      const { rule = row.rule, scope = row.scope, decision = row.decision } = edit;
      const [updated] = await tx.update(conventions).set({
        rule, scope, decision, accepted: decision === 'accepted',
        decidedAt: decision === row.decision ? row.decidedAt : decision === 'pending' ? null : new Date(),
      }).where(filter).returning();
      return candidateDto(updated!, repo, scanDto(scan, repo).commit);
    });
  }

  async clearDecisions(repo: RepoRow, branch: string): Promise<ConventionsPage> {
    await this.container.db.transaction(async (tx) => {
      await this.lockRepo(tx, repo);
      // Historical findings can be recovered on a later scan, so clear their decisions too.
      const scans = tx.select({ id: jobs.id }).from(jobs).where(scansInRepo(repo, branch));
      await tx.update(conventions).set({ decision: 'pending', decidedAt: null, accepted: false })
        .where(and(findingsInRepo(repo), ne(conventions.decision, 'pending'),
          or(inArray(conventions.scanId, scans), branch === repo.defaultBranch ? isNull(conventions.scanId) : undefined)));
    });
    return this.page(repo, branch);
  }

  async draft(repo: RepoRow, branch: string) {
    const scan = await scanFor(this.container.db, repo, true, branch);
    const rows = scan ? await loadFindings(this.container.db, repo, scan.id) : [];
    return skillDraft(repo, scan, rows.filter((row) => row.decision === 'accepted'));
  }

  async createSkill(repo: RepoRow, branch: string, { requestId, revision, ...fields }: SkillSave) {
    return this.container.db.transaction(async (tx) => {
      await this.lockRepo(tx, repo);
      const existing = await findConventionSkill(tx, repo.workspaceId, repo.id, requestId, branch);
      if (existing) return existing;
      const scan = await scanFor(tx, repo, true, branch);
      const accepted = scan ? (await loadFindings(tx, repo, scan.id)).filter((row) => row.decision === 'accepted') : [];
      if (!scan || !accepted.length || skillDraft(repo, scan, accepted).revision !== revision) {
        throw new AppError('conventions_changed', 'Accepted findings changed. Refresh the source to continue.', 409);
      }
      return insertSkillVersionOne(tx, {
        ...fields, id: requestId, type: 'convention', source: 'extracted', enabled: false,
        workspaceId: repo.workspaceId,
        conventionOrigin: {
          repoId: repo.id, branch, commit: scanDto(scan, repo).commit,
          findings: accepted.map((row) => ({
            id: row.id, revision: findingRevision(row), evidenceCommit: row.previousEvidenceCommit ?? scanDto(scan, repo).commit,
          })),
        },
      });
    });
  }

  private async lockRepo(tx: ReadDb, repo: RepoRow) {
    const [locked] = await tx.select({ id: repos.id }).from(repos)
      .where(and(eq(repos.workspaceId, repo.workspaceId), eq(repos.id, repo.id))).for('update');
    if (!locked) throw new NotFoundError('Repository not found.');
  }

  private async run(jobId: string, input: ScanInput) {
    const deadline = Date.now() + SCAN_TIMEOUT;
    const repo = await this.repo(input.workspaceId, input.repoId);
    const selectedPaths = new Set<string>();
    const skippedPaths: ConventionSkippedFile[] = [];
    const persistFiles = () => this.container.db.update(jobs)
      .set({ payload: { ...input, selectedPaths: [...selectedPaths], skippedPaths } })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, 'running'))).returning({ id: jobs.id });
    let output: Awaited<ReturnType<ConventionsService['analyze']>>;
    try {
      output = await withTimeout(this.analyze(repo, input, deadline, skippedPaths, async (batch) => {
        for (const path of batch) selectedPaths.add(path);
        const [active] = await persistFiles();
        if (!active) throw new ScanFailure('The scan is no longer running.');
      }), SCAN_TIMEOUT);
    } catch (error) {
      await persistFiles();
      throw new Error(error instanceof TimeoutError
        ? 'The scan timed out. Re-scan to try again.'
        : error instanceof ScanFailure ? error.message : 'Could not read source from the branch. Resync the repository and retry.');
    }
    await this.container.db.transaction(async (tx) => {
      await this.lockRepo(tx, repo);
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for('update');
      const latest = await scanFor(tx, repo);
      if (job?.status !== 'running' || latest?.id !== jobId) throw new Error('This scan was superseded.');
      if (Date.now() >= deadline) throw new Error('The scan timed out. Re-scan to try again.');
      const previous = await scanFor(tx, repo, true, input.branch);
      const oldRows = await this.previousFindings(tx, repo, input.branch, previous);
      const { changes, findingsCount } = await this.publish(tx, repo, jobId, oldRows, output.findings);
      await tx.update(jobs).set({
        status: 'done', finishedAt: new Date(),
        payload: {
          ...input, files: output.files, skipped: output.skipped, findings: findingsCount,
          selectedPaths: [...selectedPaths], skippedPaths,
          budgetReached: output.budgetReached, changes: previous ? changes : null,
        },
      }).where(eq(jobs.id, jobId));
    });
  }

  private async analyze(repo: RepoRow, { commit, directory, fileLimit, maxResponseTokens, modelChoice }: ScanInput, deadline: number,
    skippedPaths: ConventionSkippedFile[], recordBatch: (paths: Iterable<string>) => Promise<void>) {
    const { git } = this.container;
    const [tracked, rank] = await Promise.all([git.listTrackedSourcePaths(repo, commit), this.graphRank(repo, commit)]);
    const ranked = prioritizeFocusFiles(tracked, directory, rank);
    const preferred = fileLimit > 0 && directory === '.' ? await this.preferredDirectory(repo, commit, tracked, rank) : '.';
    const paths = preferred === '.' ? ranked : [
      ...ranked.filter((path) => inFocus(path, preferred)),
      ...ranked.filter((path) => !inFocus(path, preferred)),
    ];
    const grouped = new Map<string, GroundedConvention>();
    const sources = new Map<string, SourceWindow>();
    const seenSources = new Set<string>();
    const { provider, model } = modelChoice;
    let providerClient: ReturnType<Container['llm']> | undefined;
    let chars = 0;
    let files = 0;

    function checkDeadline() {
      if (Date.now() >= deadline) throw new TimeoutError(SCAN_TIMEOUT);
    }

    const flush = async () => {
      if (!sources.size) return;
      checkDeadline();
      providerClient ??= this.container.llm(provider).catch(() => {
        throw new ScanFailure('Configure the Conventions model and its provider key in Settings.');
      });
      const llm = await providerClient;
      checkDeadline();
      await recordBatch(sources.keys());
      checkDeadline();
      await extractConventions(llm, model, sources, grouped, {
        directory, maxResponseTokens, checkCancelled: checkDeadline,
      }).catch((error: unknown) => {
        if (error instanceof TimeoutError) throw error;
        if (error instanceof ResponseTokenLimitError) {
          throw new ScanFailure('The model response reached the token limit. Increase Max response tokens and retry.');
        }
        throw new ScanFailure('The Conventions model did not return usable findings. Check its settings and retry.');
      });
      sources.clear();
      chars = 0;
    };

    const inspect = async (selected: string[]) => {
      for (const path of selected) {
        if (fileLimit > 0 && files >= fileLimit) break;
        checkDeadline();
        const source = await git.readSourceAt(repo, commit, path, FILE_BYTE_LIMIT);
        checkDeadline();
        if (source === null) {
          skippedPaths.push({ path, reason: 'oversized_or_unavailable' });
          continue;
        }
        if (!source.trim()) {
          skippedPaths.push({ path, reason: 'empty' });
          continue;
        }
        if (/[\u0000\ufffd]/.test(source)) {
          skippedPaths.push({ path, reason: 'non_text' });
          continue;
        }
        const fingerprint = createHash('sha256').update(source).digest('hex');
        if (seenSources.has(fingerprint)) {
          skippedPaths.push({ path, reason: 'duplicate' });
          continue;
        }
        const windows = sourceWindows(path, source);
        if (!windows.length) {
          skippedPaths.push({ path, reason: 'line_too_long' });
          continue;
        }
        seenSources.add(fingerprint);
        for (const entry of windows) {
          if (sources.has(path) || chars + entry.chars > BATCH_CHAR_LIMIT) await flush();
          sources.set(path, entry.window);
          chars += entry.chars;
        }
        files++;
      }
      await flush();
    };
    if (fileLimit === 0 || paths.length <= fileLimit) {
      await inspect(paths);
    } else {
      const initialCount = Math.ceil(fileLimit * 0.7);
      await inspect(paths.slice(0, initialCount));
      const remaining = paths.slice(initialCount);
      const related = new Set(corroborationFiles(remaining, grouped.values()));
      await inspect([...related, ...remaining.filter((path) => !related.has(path))]);
    }
    return {
      files, skipped: skippedPaths.length, budgetReached: fileLimit > 0 && files >= fileLimit,
      findings: corroboratedConventions(grouped, directory === '.' && files === paths.length),
    };
  }

  private async previousFindings(tx: ReadDb, repo: RepoRow, branch: string, previous: Job | undefined) {
    if (!previous) {
      const rows = branch === repo.defaultBranch
        ? await tx.select().from(conventions).where(and(findingsInRepo(repo), isNull(conventions.scanId))) : [];
      return rows.map((row) => ({ row, commit: null }));
    }
    const current = await loadFindings(tx, repo, previous.id);
    const result: { row: Finding; commit: string | null }[] = current.map((row) => ({
      row, commit: scanDto(previous, repo).commit,
    }));
    // Older versions omitted unmatched findings. Recover the latest saved
    // decision for each omitted rule, including a deliberate reset to pending.
    const history = await tx.select({ row: conventions, payload: jobs.payload }).from(conventions)
      .innerJoin(jobs, eq(jobs.id, conventions.scanId))
      .where(and(findingsInRepo(repo), scansInRepo(repo, branch), eq(jobs.status, 'done'), isNotNull(conventions.originalScope)))
      .orderBy(desc(jobs.scheduledAt), desc(jobs.id), asc(conventions.id));
    const seen = new Set(current.filter((row) => row.originalScope).map((row) =>
      conventionKey(row.originalRule ?? row.rule, row.originalScope!)));
    for (const { row, payload } of history) {
      const key = conventionKey(row.originalRule ?? row.rule, row.originalScope!);
      if (seen.has(key)) continue;
      seen.add(key);
      if (row.decision !== 'pending') result.push({ row, commit: (payload as ScanPayload).commit });
    }
    return result;
  }

  private async publish(tx: Pick<Db, 'insert'>, repo: RepoRow, scanId: string,
    previous: { row: Finding; commit: string | null }[], findings: GroundedConvention[]) {
    const oldRows = previous.map(({ row }) => row);
    const matches = new Map<string, Finding[]>();
    for (const row of oldRows) {
      if (!row.originalScope) continue;
      const key = conventionKey(row.originalRule ?? row.rule, row.originalScope);
      const group = matches.get(key) ?? [];
      group.push(row);
      matches.set(key, group);
    }
    const changes = { decisions_kept: 0, new_findings: 0, reviewed_not_rediscovered: 0 };
    const matched = new Set<string>();
    let surfaced = 0;
    const selected = findings.filter(({ rule, scope }) => {
      const group = matches.get(conventionKey(rule, scope));
      if (group?.length === 1 && group[0]!.decision !== 'pending') return true;
      if (surfaced === NEW_FINDING_LIMIT) return false;
      surfaced++;
      return true;
    });
    const rows: (typeof conventions.$inferInsert)[] = selected.map(({ rule, scope, evidence, confidence }) => {
      const group = matches.get(conventionKey(rule, scope));
      const old = group?.length === 1 ? group[0] : undefined;
      if (!old) changes.new_findings++;
      if (old && old.decision !== 'pending') changes.decisions_kept++;
      if (old) matched.add(old.id);
      return {
        scanId, workspaceId: repo.workspaceId, repoId: repo.id, originalRule: rule, originalScope: scope,
        rule: old?.rule ?? rule, scope: old?.scope ?? scope, confidence, evidence,
        evidencePath: evidence[0]!.path, evidenceSnippet: evidence[0]!.snippet,
        decision: old?.decision ?? 'pending' as const, accepted: old?.decision === 'accepted',
        decidedAt: old?.decidedAt,
      };
    });
    for (const { row, commit } of previous) {
      if (matched.has(row.id) || row.decision === 'pending' || !commit || !row.evidence?.length) continue;
      const { id: _previousId, ...saved } = row;
      rows.push({ ...saved, scanId, previousEvidenceCommit: row.previousEvidenceCommit ?? commit });
      changes.decisions_kept++;
      changes.reviewed_not_rediscovered++;
    }
    if (rows.length) await tx.insert(conventions).values(rows);
    return { changes, findingsCount: selected.length };
  }
}

class ScanFailure extends Error {}
