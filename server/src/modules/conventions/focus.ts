import { posix } from 'node:path';
import { eligiblePath, eligibleSource, type GroundedConvention } from './extract.js';

export const FOCUS_FILE_LIMIT = 20;
export const INITIAL_FILES = 14;
const SUGGESTION_LIMIT = 5;

export function inFocus(path: string, directory: string): boolean {
  return directory === '.' || path.startsWith(directory + '/');
}

export function normalizeFocus(value: string): string | null {
  const directory = value.trim().replace(/\/+$/, '');
  return directory === '.' || eligiblePath(directory) ? directory : null;
}

function entryPoint(path: string): boolean {
  return /(?:^|\/)(?:main|index|app|api|server|cli|mod|lib|__main__|__init__|routes?|handlers?|manage)(?:\.[^/]+)+$/i.test(path);
}

export function prioritizeFocusFiles(paths: string[], directory: string, ranked: string[]): string[] {
  const rank = new Map(ranked.map((path, index) => [path, index]));
  const score = (path: string) => (rank.has(path) ? 120 - Math.min(rank.get(path)!, 119) : 0)
    + (entryPoint(path) ? 35 : 0) - (/(?:^|\/)(?:tests?|__tests__|fixtures|examples)(?:\/|$)|\.(?:spec|test)\./i.test(path) ? 45 : 0);
  return paths.filter((path) => eligibleSource(path) && inFocus(path, directory))
    .sort((left, right) => score(right) - score(left) || left.localeCompare(right));
}

export function suggestFocus(paths: string[], ranked: string[], metadata: string): string[] {
  const sources = prioritizeFocusFiles(paths, '.', ranked);
  const rank = new Set(ranked.slice(0, 24));
  const areas = new Map<string, number>();
  for (const path of sources) {
    if (/(?:^|\/)(?:tests?|__tests__|fixtures|examples)(?:\/|$)|\.(?:spec|test)\./i.test(path)) continue;
    const segments = path.split('/').slice(0, -1);
    const container = /^(?:apps|packages|services|modules|crates|cmd|src|lib|internal)$/i.test(segments[0] ?? '');
    const area = segments.slice(0, container ? 2 : 1).join('/') || '.';
    const mentioned = area !== '.' && metadata.includes(area + '/');
    const weight = 1 + (entryPoint(path) ? 5 : 0) + (rank.has(path) ? 4 : 0);
    areas.set(area, (areas.get(area) ?? (mentioned ? 12 : 0)) + weight);
  }
  if (!areas.size) return sources.length ? ['.'] : [];
  return [...areas].sort(([left, a], [right, b]) => b - a || left.localeCompare(right))
    .slice(0, SUGGESTION_LIMIT).map(([area]) => area);
}

export function corroborationFiles(remaining: string[], findings: Iterable<GroundedConvention>): string[] {
  const related = new Set<string>();
  for (const finding of findings) {
    if (finding.evidence.length !== 1) continue;
    related.add(posix.dirname(finding.evidence[0]!.path));
  }
  return remaining.filter((path) => {
    for (const directory of related) {
      if (directory === '.' ? posix.dirname(path) === '.' : inFocus(path, directory)) return true;
    }
    return false;
  });
}
