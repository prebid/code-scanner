import { App } from 'octokit';

export async function getOctokit({ privateKey, appId, installId }) {
  const app = new App({
    appId,
    privateKey,
  });
  return app.getInstallationOctokit(installId);
}


export async function fetchPatterns(octokit) {
  function request(path, raw = false) {
    const headers = {
      'X-GitHub-Api-Version': '2026-03-10'
    };
    if (raw) {
      headers['Accept'] = 'application/vnd.github.raw+json';
    }
    return octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: 'prebid',
      repo: 'code-scanning-data',
      path,
      headers
    });
  }

  const files = await request('/dist');
  const requests = files.data.map(({ path }) => request(path, true));
  return (await Promise.all(requests))
    .map(result => JSON.parse(result.data));
}

function toRegex(pat) {
  return pat.split('*').map(str => RegExp.escape(str)).join('[^./]*');
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

export function getPatterns(rawPatterns) {
  const groups = {};
  const patterns = rawPatterns
    .flatMap(({ id, name, patterns }, i) => {
      return patterns.map(rawPattern => ({
        groupId: id,
        groupName: name,
        rawPattern,
        pattern: toRegex(rawPattern),
        hash: hashCode(rawPattern)
      }));
    });
  const master = new RegExp(`(${patterns.map(pat => pat.pattern).join('|')})`, 'gi');
  return {
    groups: rawPatterns.map(({ id, name }) => ({ id, name })),
    master,
    patterns: patterns.map(pat => Object.assign(pat, { pattern: new RegExp(pat.pattern, 'gi') })),
  };
}