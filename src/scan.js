import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { getPatterns } from './patterns.js';

const { master, patterns } = getPatterns();

function newReport() {
  return {
    'version': '2.1.0',
    '$schema': 'http://json.schemastore.org/sarif-2.1.0-rtm.4',
    'runs': [
      {
        'tool': {
          'driver': {
            'name': 'PrebidCodeScanner',
            'informationUri': 'https://github.com/prebid/code-scanner',
            'rules': [
              {
                'id': 'blocked',
                'shortDescription': {
                  'text': 'Flag blacklisted domains'
                },
                'helpUri': 'https://github.com/prebid/code-scanner'
              }
            ]
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
      uri: `file://./${fname}`
    }
  }))
  contents = contents.toString();
  if (master.test(contents)) {
    report.runs[0].results.push(...(await getViolations(contents, fname)))
  }
}

async function getViolations(fileContents, fileName) {
  const violations = [];
  for (const pat of patterns) {
    const match = pat.pattern.exec(fileContents);
    if (match != null) {
      violations.push({
        level: 'error',
        message: {
          text: `Domain blacklisted by '${pat.group}'`
        },
        ruleId: 'blocked',
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: `file://./${fileName}`
              },
              region: {
                charOffset: match.index,
                charLength: match[0].length
              },
              partialFingerprints: {
                'blocked/v1': `${fileName}/${pat.group}/${pat.hash}`
              }
            }
          }
        ]
      });
    }
  }
  return violations;
}