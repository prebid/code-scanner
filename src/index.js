import * as core from "@actions/core";
import * as github from "@actions/github";
import {scan} from './scan.js';

try {
  const patterns = core.getInput('patterns');
  const ignores = core.getInput('ignores');
  const root = core.getInput('root');
  const report = await scan(patterns, ignores, root);
  core.info(`Result: ${JSON.stringify(report, null, 2)}`);
} catch (error) {
  core.setFailed(error.message);
}
