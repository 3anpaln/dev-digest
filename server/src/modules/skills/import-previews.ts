import { randomUUID } from 'node:crypto';
import type { SkillImportPreview } from '@devdigest/shared';
import { AppError, ValidationError } from '../../platform/errors.js';
import type { RequestContext } from '../_shared/context.js';

type Origin = Pick<SkillImportPreview, 'source' | 'reference'>;
type PendingPreview = { context: RequestContext; origin: Origin; expiresAt: number; saving: boolean };
const TTL_MS = 10 * 60_000;
const MAX_PREVIEWS = 256;

export class SkillImportPreviews {
  private readonly pending = new Map<string, PendingPreview>();

  issue(context: RequestContext, origin: Origin): string {
    const now = Date.now();
    for (const [token, preview] of this.pending) {
      if (preview.expiresAt <= now && !preview.saving) this.pending.delete(token);
    }
    if (this.pending.size >= MAX_PREVIEWS) {
      throw new AppError('skill_preview_limit', 'Too many pending import previews. Try again later.', 429);
    }
    const token = randomUUID();
    this.pending.set(token, { context, origin, expiresAt: now + TTL_MS, saving: false });
    return token;
  }

  async confirm<T>(token: string, context: RequestContext, save: (origin: Origin) => Promise<T>): Promise<T> {
    const preview = this.pending.get(token);
    if (!preview || preview.expiresAt <= Date.now() || preview.context.userId !== context.userId
      || preview.context.workspaceId !== context.workspaceId) {
      throw new ValidationError('Load a new import preview before confirming.');
    }
    if (preview.saving) throw new AppError('skill_import_pending', 'This import is already being saved.', 409);
    preview.saving = true;
    try {
      const saved = await save(preview.origin);
      this.pending.delete(token);
      return saved;
    } finally {
      preview.saving = false;
    }
  }
}
