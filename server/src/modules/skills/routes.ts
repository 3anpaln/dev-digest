import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { EditableSkill, SkillType } from '@devdigest/shared';
import { z } from 'zod';
import { IdParams } from '../_shared/schemas.js';
import { getContext } from '../_shared/context.js';
import { SkillsRepository } from './repository.js';

const SkillFields = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(4000),
  type: SkillType,
  body: z.string().max(100_000).refine((value) => value.trim().length > 0, 'Enter a skill body'),
  enabled: z.boolean(),
});
const Revision = EditableSkill.shape.revision;

export default async function skillsRoutes(base: FastifyInstance) {
  const app = base.withTypeProvider<ZodTypeProvider>();
  const repo = new SkillsRepository(app.container.db);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return repo.list(workspaceId);
  });

  app.post('/skills', { schema: { body: SkillFields } }, async (req, reply) => {
    await getContext(app.container, req);
    const skill = await repo.create(req.body);
    return reply.code(201).send(skill);
  });

  app.put('/skills/:id', {
    schema: { params: IdParams, body: SkillFields.partial().extend({ revision: Revision }) },
  }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { revision, ...fields } = req.body;
    return repo.update(workspaceId, req.params.id, revision, fields);
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return repo.versions(workspaceId, req.params.id);
  });

  app.delete('/skills/:id', {
    schema: { params: IdParams, querystring: z.object({ revision: Revision }) },
  }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    await repo.delete(workspaceId, req.params.id, req.query.revision);
    return reply.code(204).send();
  });

  app.post('/skills/:id/restore', {
    schema: { params: IdParams, body: z.object({ revision: Revision, version: z.number().int().positive() }) },
  }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return repo.update(workspaceId, req.params.id, req.body.revision, { restore: req.body.version });
  });

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return repo.stats(workspaceId, req.params.id);
  });
}
