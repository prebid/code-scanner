import * as core from "@actions/core";
import * as github from "@actions/github";
import {scan} from './scan.js';
import { Octokit } from 'octokit';
import { encode } from './encode.js';
import { fetchPatterns, getOctokit, getPatterns } from './patterns.js';

try {
  const globs = core.getInput('patterns');
  const ignores = core.getInput('ignores');
  const root = core.getInput('root');
  const patterns = getPatterns(
    await fetchPatterns(await getOctokit({
      privateKey: core.getInput('pem'),
      appId: core.getInput('appId'),
      installId: core.getInput('installationId')
    }))
  )
  const octokit = new Octokit({
    auth: core.getInput('token')
  })
  function requestParams(params) {
    return Object.assign({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      headers: {
        'X-GitHub-Api-Version': '2026-03-10'
      }
    }, params)
  }
  const prNo = github.context.payload.pull_request?.number;
  let commit_sha;
  let ref;
  let whitelist;
  if (prNo == null) {
    commit_sha = github.context.sha;
    ref = gihub.context.ref;
    whitelist = null;
  } else {
    core.info(`Scanning only files touched in #${prNo}`);
    const params = requestParams({ prNo });
    const pr = await octokit.request('GET /repos/{owner}/{repo}/pulls/{prNo}', params);
    const files = await octokit.request('GET /repos/{owner}/{repo}/pulls/{prNo}/files?per_page=100', params)
    commit_sha = pr.data.head.sha;
    ref = `refs/pull/${prNo}/head`;
    whitelist = files.data.length >= 100 ? null : new Set(files.data.map(({filename}) => filename));
  }
  const report = await scan(patterns, globs, ignores, root, whitelist);
  core.info('Uploading report...');
  await octokit.request('POST /repos/{owner}/{repo}/code-scanning/sarifs', requestParams({
    commit_sha,
    ref,
    sarif: await encode(JSON.stringify(report))
  }));
  if (report.runs[0].results.length > 0) {
    core.warning(`Found ${report.runs[0].results.length} violations`);
  }
} catch (error) {
  core.setFailed(error.message);
}
