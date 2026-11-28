export const DEFAULT_BRANCH = 'main';

export function validBranch(branch: string): boolean {
  return branch !== '@' && branch.toUpperCase() !== 'HEAD' && !branch.endsWith('.')
    && !/[\x00-\x20\x7f~^:?*\[\\]/.test(branch) && !branch.includes('..') && !branch.includes('@{')
    && branch.split('/').every((part) => part && !part.startsWith('.') && !part.endsWith('.lock'));
}
