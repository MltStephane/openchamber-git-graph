type DiffLineKind = 'file' | 'hunk' | 'added' | 'removed' | 'plain';

export const diffLines = (patch: string): Array<{ text: string; kind: DiffLineKind }> => {
  let inHunk = false;
  return (patch.match(/[^\n]*\n|[^\n]+$/g) ?? []).map((text) => {
    if (text.startsWith('diff --git ')) {
      inHunk = false;
      return { text, kind: 'file' };
    }
    if (text.startsWith('@@ ')) {
      inHunk = true;
      return { text, kind: 'hunk' };
    }
    if (inHunk && text.startsWith('+')) return { text, kind: 'added' };
    if (inHunk && text.startsWith('-')) return { text, kind: 'removed' };
    return { text, kind: 'plain' };
  });
};
