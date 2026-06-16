import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { getPatterns } from './patterns.js';

const { groups, master, patterns } = getPatterns();

function newReport() {
  return {
    'version': '2.1.0',
    '$schema': 'https://json.schemastore.org/sarif-2.1.0.json',
    'runs': [
      {
        'tool': {
          'driver': {
            'name': 'PrebidCodeScanner',
            'informationUri': 'https://github.com/prebid/code-scanner',
            'rules': groups.map(group => ({
              'id': group,
              'shortDescription': {
                'text': `Domain flagged by '${group}'`
              },
              'helpUri': 'https://github.com/prebid/code-scanner'
            }))
          }
        },
        artifacts: [],
        results: []
      }
    ]
  };
}

export async function scan(patterns, ignore, root) {
  root = path.resolve(root ?? '.');
  ignore = ignore.split(',').map(ign => path.join(root, ign));
  patterns = patterns.split(',').map(pat => path.join(root, pat));
  console.info('Starting scan', { glob: patterns, ignore });
  const report = newReport();
  for (const pattern of patterns) {
    for (const fname of await glob(pattern, { ignore })) {
      if ((await fs.promises.lstat(fname)).isFile()) {
        await scanFile(root, path.relative(root, fname), report);
      }
    }
  }
  return report;
}

async function scanFile(root, fname, report) {
  const fullPath = path.resolve(root, fname);
  let contents = await fs.promises.readFile(fullPath);
  if (contents.includes(0, 0, 8 * 1024)) {
    console.info(`${fname} appears to be a binary file, skipping`);
    return;
  }
  console.log(`Scanning ${fname}...`);
  report.runs[0].artifacts.push(({
    location: {
      uri: `${fname}`
    }
  }));
  contents = contents.toString();
  if (master.test(contents)) {
    report.runs[0].results.push(...(await getViolations(contents, fname)));
  }
}

function getPosition(str) {
  const lines = str.split(/\r?\n/);
  return [lines.length, lines[lines.length - 1].length];
}

async function getViolations(fileContents, fileName) {
  const violations = [];
  for (const pat of patterns) {
    const match = pat.pattern.exec(fileContents);
    if (match != null) {
      const [startLine, startColumn] = getPosition(fileContents.substring(0, match.index));
      const [endLine, endColumn] = getPosition(fileContents.substring(0, match.index + match[0].length));
      violations.push({
        level: 'error',
        message: {
          text: `Domain blacklisted by '${pat.group}'`
        },
        ruleId: pat.group,
        partialFingerprints: {
          'blocked/v1': `${fileName}/${pat.group}/${pat.hash}`
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: `${fileName}`
              },
              region: { startLine, startColumn, endLine, endColumn },
            }
          }
        ]
      });
    }
  }
  return violations;
}