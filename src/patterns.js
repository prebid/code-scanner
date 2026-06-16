import { default as mock } from '../patterns/mock.json' with { type: 'json' };

function toRegex(pat) {
  return pat.split('*').map(str => RegExp.escape(str)).join('[^./]*')
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    let chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

export function getPatterns() {
  const groups = new Set();
  const patterns = mock.map(pat => ['mock', pat])
    .map(([group, rawPattern], i) => {
      groups.add(group);
      return {
        group,
        rawPattern,
        pattern: toRegex(rawPattern),
        hash: hashCode(rawPattern)
      };
    });
  const master = new RegExp(`(${patterns.map(pat => pat.pattern).join('|')})`, 'gi');
  return {
    groups: Array.from(groups),
    master,
    patterns: patterns.map(pat => Object.assign(pat, {pattern: new RegExp(pat.pattern, 'gi')})),
  }
}