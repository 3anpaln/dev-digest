import { and, eq } from 'drizzle-orm';
import type { PrDetail } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import { prCommits, prFiles, pullRequests } from '../../db/schema.js';

export async function savePullSnapshot(
  db: Db,
  workspaceId: string,
  prId: string,
  detail: PrDetail,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Updating the parent first serializes refreshes for this PR.
    const [updated] = await tx.update(pullRequests).set({
      body: detail.body ?? null,
      additions: detail.additions,
      deletions: detail.deletions,
      filesCount: detail.files_count,
    })
      .where(and(eq(pullRequests.workspaceId, workspaceId), eq(pullRequests.id, prId)))
      .returning({ id: pullRequests.id });
    if (!updated) return false;

    await tx.delete(prFiles).where(eq(prFiles.prId, prId));
    if (detail.files.length > 0) {
      await tx.insert(prFiles).values(detail.files.map((file) => ({
        prId,
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch ?? null,
      })));
    }

    await tx.delete(prCommits).where(eq(prCommits.prId, prId));
    if (detail.commits.length > 0) {
      await tx.insert(prCommits).values(detail.commits.map((commit) => ({
        prId,
        sha: commit.sha,
        message: commit.message,
        author: commit.author,
        committedAt: commit.committed_at ? new Date(commit.committed_at) : null,
      })));
    }
    return true;
  });
}

export async function readPullSnapshot(db: Db, workspaceId: string, prId: string): Promise<PrDetail | undefined> {
  return db.transaction(async (tx) => {
    const [pr] = await tx.select().from(pullRequests)
      .where(and(eq(pullRequests.workspaceId, workspaceId), eq(pullRequests.id, prId)));
    if (!pr) return undefined;

    const files = await tx.select().from(prFiles).where(eq(prFiles.prId, pr.id));
    const commits = await tx.select().from(prCommits).where(eq(prCommits.prId, pr.id));
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      author: pr.author,
      branch: pr.branch,
      base: pr.base,
      head_sha: pr.headSha,
      additions: pr.additions,
      deletions: pr.deletions,
      files_count: pr.filesCount,
      status: pr.status as PrDetail['status'],
      opened_at: pr.openedAt?.toISOString() ?? null,
      updated_at: pr.updatedAt?.toISOString() ?? null,
      body: pr.body ?? null,
      files: files.map((file) => ({
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch ?? null,
      })),
      commits: commits.map((commit) => ({
        sha: commit.sha,
        message: commit.message,
        author: commit.author,
        committed_at: commit.committedAt?.toISOString() ?? null,
      })),
    };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
