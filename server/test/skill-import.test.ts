import { expect, it, vi } from 'vitest';
import { loadFileDraft, loadUrlDraft } from '../src/modules/skills/import-content.js';
import { SkillImportPreviews } from '../src/modules/skills/import-previews.js';

const archivedSkill = 'UEsDBBQAAAAIAPyBel2sx/pUJAAAACIAAAAPAAAAc2FtcGxlL1NLSUxMLm1kU1YITswtyEnlCkoty0wtVyjJSFVwDPBUSM7PKylKTC7R4wIAUEsDBBQAAAAIAPyBel0KfX23FQAAABMAAAAQAAAAc2FtcGxlL3NjcmlwdC5zaFNW8EzPyy9KTVFIzs8tSMzLzM8DAFBLAQIUABQAAAAIAPyBel2sx/pUJAAAACIAAAAPAAAAAAAAAAAAAACAAQAAAABzYW1wbGUvU0tJTEwubWRQSwECFAAUAAAACAD8gXpdCn19txUAAAATAAAAEAAAAAAAAAAAAAAAgAFRAAAAc2FtcGxlL3NjcmlwdC5zaFBLBQYAAAAAAgACAHsAAACUAAAAAAA=';
const ambiguousArchive = 'UEsDBBQAAAAIAPyBel2sx/pUJAAAACIAAAAIAAAAU0tJTEwubWRTVghOzC3ISeUKSi3LTC1XKMlIVXAM8FRIzs8rKUpMLtHjAgBQSwMEFAAAAAgA/IF6XazH+lQkAAAAIgAAAA8AAABuZXN0ZWQvU0tJTEwubWRTVghOzC3ISeUKSi3LTC1XKMlIVXAM8FRIzs8rKUpMLtHjAgBQSwECFAAUAAAACAD8gXpdrMf6VCQAAAAiAAAACAAAAAAAAAAAAAAAgAEAAAAAU0tJTEwubWRQSwECFAAUAAAACAD8gXpdrMf6VCQAAAAiAAAADwAAAAAAAAAAAAAAgAFKAAAAbmVzdGVkL1NLSUxMLm1kUEsFBgAAAAACAAIAcwAAAJsAAAAAAA==';

it('loads Markdown metadata and extracts only the single archive core', async () => {
  const markdown = Buffer.from('---\nname: Contract checks\ntype: rubric\n---\n# Guidance');
  expect(await loadFileDraft('review.md', markdown)).toEqual({
    reference: 'review.md', draft: { name: 'Contract checks', type: 'rubric', description: '', body: '# Guidance' },
  });
  // sample/SKILL.md and sample/script.sh are stored together in this fixture.
  expect(await loadFileDraft('sample.zip', Buffer.from(archivedSkill, 'base64'))).toEqual({
    reference: 'sample.zip / sample/SKILL.md',
    draft: { name: 'Sample', type: 'custom', description: '', body: '# Sample\nReview the API contract.\n' },
  });
  await expect(loadFileDraft('ambiguous.zip', Buffer.from(ambiguousArchive, 'base64'))).rejects.toThrow('one regular SKILL.md');
  await expect(loadFileDraft('binary.md', Buffer.from([0xff]))).rejects.toThrow('UTF-8');
});

it('fetches only approved public GitHub Markdown and disallows redirect following', async () => {
  const fetchMarkdown = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('# Contract checks'));
  const result = await loadUrlDraft('https://github.com/demo/skills/blob/main/SKILL.md', fetchMarkdown);
  expect(result.reference).toBe('https://raw.githubusercontent.com/demo/skills/main/SKILL.md');
  expect(result.draft.body).toBe('# Contract checks');
  expect(fetchMarkdown).toHaveBeenCalledWith(new URL(result.reference), expect.objectContaining({ redirect: 'error' }));
  await expect(loadUrlDraft('https://example.org/demo/skills/main/SKILL.md', fetchMarkdown)).rejects.toThrow('public GitHub');
  expect(fetchMarkdown).toHaveBeenCalledTimes(1);
  fetchMarkdown.mockResolvedValueOnce(new Response('<html>Not Markdown</html>', { headers: { 'content-type': 'text/html' } }));
  await expect(loadUrlDraft(result.reference, fetchMarkdown)).rejects.toThrow('Could not load');
});

it('binds preview confirmation to the requester and allows one concurrent save or a retry after failure', async () => {
  const previews = new SkillImportPreviews();
  const context = { userId: 'reviewer', workspaceId: 'library' };
  const origin = { source: 'imported_file', reference: 'review.md' } as const;
  const token = previews.issue(context, origin);
  const save = vi.fn().mockRejectedValueOnce(new Error('Write failed')).mockResolvedValueOnce('saved');
  await expect(previews.confirm(token, { ...context, workspaceId: 'other' }, save)).rejects.toThrow('Load a new');
  expect(save).not.toHaveBeenCalled();
  await expect(previews.confirm(token, context, save)).rejects.toThrow('Write failed');
  const pending = previews.confirm(token, context, save);
  await expect(previews.confirm(token, context, save)).rejects.toThrow('already being saved');
  await expect(pending).resolves.toBe('saved');
  await expect(previews.confirm(token, context, save)).rejects.toThrow('Load a new');
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith(origin);
});
