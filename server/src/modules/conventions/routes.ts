import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ConventionDecision } from '@devdigest/shared';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SkillFields } from '../skills/routes.js';
import { ConventionsService } from './service.js';
import { DEFAULT_BRANCH, validBranch } from './branch.js';

const basePath = '/repos/:id/conventions';
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const branch = z.string().trim().min(1).max(255).refine(validBranch, 'Enter a valid Git branch name.');
const branchQuery = z.object({ branch: branch.default(DEFAULT_BRANCH) });
const edit = z.object({
  revision,
  rule: z.string().trim().min(1).max(600).optional(),
  scope: z.string().trim().min(1).max(240).regex(/^[^\r\n\x00]+$/).optional(),
  decision: ConventionDecision.optional(),
}).strict();
const saveSkill = SkillFields.pick({ name: true, description: true, body: true })
  .extend({ revision, requestId: z.string().uuid() }).strict();

export default async function conventionsRoutes(base: FastifyInstance) {
  const app = base.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);
  service.register();

  app.get(basePath, { schema: { params: IdParams, querystring: branchQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.page(await service.repo(workspaceId, req.params.id), req.query.branch);
  });
  app.post(basePath + '/scan', {
    schema: { params: IdParams, body: z.object({
      branch: branch.optional(),
      fileLimit: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
      maxResponseTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
      directory: z.string().trim().max(500).optional(),
    }).strict().optional() },
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    return reply.code(202).send(await service.start(await service.repo(workspaceId, req.params.id), req.body));
  });
  app.post(basePath + '/branch/sync', {
    schema: { params: IdParams, body: z.object({ branch }).strict() },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.syncBranch(await service.repo(workspaceId, req.params.id), req.body.branch);
  });
  app.patch(basePath + '/findings/:findingId', {
    schema: { params: IdParams.extend({ findingId: z.string().uuid() }), querystring: branchQuery, body: edit },
  }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.edit(await service.repo(workspaceId, req.params.id), req.query.branch, req.params.findingId, req.body);
  });
  app.post(basePath + '/decisions/clear', { schema: { params: IdParams, querystring: branchQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.clearDecisions(await service.repo(workspaceId, req.params.id), req.query.branch);
  });
  app.get(basePath + '/skill-draft', { schema: { params: IdParams, querystring: branchQuery } }, async (req) => {
    const workspace = await app.container.auth.currentWorkspace(req);
    const draft = await service.draft(await service.repo(workspace.id, req.params.id), req.query.branch);
    return { ...draft, workspace_name: workspace.name };
  });
  app.post(basePath + '/skills', { schema: { params: IdParams, querystring: branchQuery, body: saveSkill } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    return reply.code(201).send(await service.createSkill(await service.repo(workspaceId, req.params.id), req.query.branch, req.body));
  });
}
