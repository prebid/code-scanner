import { App } from 'octokit';
import crypto from 'node:crypto';
import { combine, compile } from './parser.js';

export async function getOctokit({ privateKey, appId, installId }) {
  const key = crypto
    .createPrivateKey(privateKey)
    .export({
      type: 'pkcs8',
      format: 'pem',
    });
  const app = new App({
    appId,
    privateKey: key,
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
  const patterns = rawPatterns
    .flatMap(({ id, name, patterns }, i) => {
      return patterns.map(rawPattern => ({
        groupId: id,
        groupName: name,
        rawPattern,
        pattern: compile(rawPattern),
        hash: hashCode(rawPattern)
      }));
    });
  const pattern = combine(patterns);
  return {
    groups: rawPatterns.map(({ id, name }) => ({ id, name })),
    pattern
  };
}