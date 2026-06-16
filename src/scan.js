import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

function newReport(groups) {
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
              'id': group.id,
              'shortDescription': {
                'text': `Domain flagged by '${group.name}'`
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

export async function scan(patterns, globs, ignores, root, whitelist) {
  root = path.resolve(root ?? '.');
  ignores = ignores && ignores.split(',').map(ign => path.join(root, ign));
  globs = globs.split(',').map(pat => path.join(root, pat));
  console.info('Starting scan', { glob: globs, ignore: ignores, dot: true });
  const report = newReport(patterns.groups);
  for (const pattern of globs) {
    for (const fname of await glob(pattern, { ignore: ignores })) {
      if ((whitelist == null || whitelist.has(fname)) && (await fs.promises.lstat(fname)).isFile()) {
        await scanFile(patterns, root, path.relative(root, fname), report);
      }
    }
  }
  return report;
}

async function scanFile(patterns, root, fname, report) {
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
  if (patterns.master.test(contents)) {
    report.runs[0].results.push(...(await getViolations(patterns, contents, fname)));
  }
}

function getPosition(str) {
  const lines = str.split(/\r?\n/);
  return [lines.length, lines[lines.length - 1].length + 1];
}

async function getViolations(patterns, fileContents, fileName) {
  const violations = [];
  for (const pat of patterns.patterns) {
    const match = pat.pattern.exec(fileContents);
    if (match != null) {
      const [startLine, startColumn] = getPosition(fileContents.substring(0, match.index));
      const [endLine, endColumn] = getPosition(fileContents.substring(0, match.index + match[0].length));
      violations.push({
        level: 'error',
        message: {
          text: `Domain blacklisted by '${pat.groupName}'`
        },
        ruleId: pat.group,
        partialFingerprints: {
          primaryLocationLineHash: `${fileName}/${pat.groupId}/${pat.hash}`
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