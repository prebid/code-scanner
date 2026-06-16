import * as core from "@actions/core";
import * as github from "@actions/github";
import {scan} from './scan.js';
import { Octokit } from '@octokit/core';
import { encode } from './encode.js';

try {
  const patterns = core.getInput('patterns');
  const ignores = core.getInput('ignores');
  const root = core.getInput('root');
  const report = await scan(patterns, ignores, root);
  const octokit = new Octokit({
    auth: core.getInput('token')
  })
  core.info('Uploading report...');
  await octokit.request('POST /repos/{owner}/{repo}/code-scanning/sarifs', {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    commit_sha: core.getInput('sha') || github.context.sha,
    ref: core.getInput('ref') || github.context.ref,
    sarif: encode(JSON.stringify(report))
  });
} catch (error) {
  core.setFailed(error.message);
}
