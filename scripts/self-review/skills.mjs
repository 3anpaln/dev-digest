import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function catalog(root) {
  const guides = new Map();
  for (const dir of ['.agents/skills', '.claude/skills']) {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = join(root, dir, entry.name, 'SKILL.md');
      if (!entry.isDirectory() || !existsSync(path)) continue;
      const body = readFileSync(path, 'utf8');
      const name = /^name:\s*([\w-]+)\s*$/m.exec(body)?.[1];
      if (name) guides.set(name, body);
    }
  }
  return guides;
}

export function route(path, diff) {
  const selected = new Set();
  function add(...names) {
    for (const name of names) selected.add(name);
  }
  if (/^client\//.test(path)) {
    add('frontend-architecture');
    if (/\.tsx$/.test(path) || /\buse[A-Z]\w+/.test(diff)) add('react-best-practices');
    if (path.includes('/app/') || /from ['"]next\//.test(diff)) add('next-best-practices');
    if (/\.tsx$|\.css$/.test(path)) add('ui-ux-pro-max', 'ui-styling');
    if (/\b(useQuery|useMutation|invalidateQueries|queryKey|QueryClient|useInfiniteQuery)\b|@tanstack\/react-query/.test(diff)) {
      add('tanstack-query-best-practices', 'react-best-practices');
    }
    if (/\.test\.tsx$/.test(path)) add('react-testing-library');
  }
  if (/^server\/(src\/modules|src\/platform|src\/adapters|src\/db|test)\//.test(path)) add('onion-architecture');
  if (/^server\//.test(path) && (/routes\.ts$/.test(path) || /\bFastify\w*/.test(diff))) add('fastify-best-practices');
  if (/^server\//.test(path) && (/\/db\//.test(path) || /drizzle-orm/.test(diff))) add('drizzle-orm-patterns', 'postgresql-table-design');
  if (/\bz\.(object|enum|array|string|number)|from ['"]zod/.test(diff)) add('zod');
  if (/\b(auth\w*|workspaceId|secret\w*|permissions|token)\b/i.test(diff) || path.startsWith('.github/')) add('security');
  if (/\.[cm]?tsx?$|tsconfig.*\.json$/.test(path)) add('typescript-expert');
  if (/\.md$/.test(path)) add('documentation-and-adrs');
  return ['general', ...selected];
}
