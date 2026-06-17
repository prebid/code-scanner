import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { parse, BinaryStream } from './parser.js';

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
  ignores = ignores ? ignores.split(',').map(ign => path.join(root, ign)) : [];
  globs = globs.split(',').map(pat => path.join(root, pat));
  console.info('Starting scan', { globs, ignores, whitelist: whitelist && Array.from(whitelist) });
  const report = newReport(patterns.groups);
  for (const pattern of globs) {
    for (const fname of await glob(pattern, { ignore: ignores, dot: true })) {
      const relFile = path.relative(root, fname);
      if ((whitelist == null || whitelist.has(relFile)) && (await fs.promises.lstat(fname)).isFile()) {
        await scanFile(patterns, root, relFile, report);
      }
    }
  }
  return report;
}

async function scanFile(patterns, root, fname, report) {
  console.log(`Scanning ${fname}...`);
  const fullPath = path.resolve(root, fname);
  const contents = fs.createReadStream(fullPath);
  let match = null;
  try {
    match = await parse(contents, patterns.pattern());
  } catch (e) {
    if (e instanceof BinaryStream) {
      console.log(`${fname} appears to be a binary file, skipping`);
    } else {
      throw e;
    }
  }
  report.runs[0].artifacts.push(({
    location: {
      uri: `${fname}`
    }
  }));
  if (match != null) {
    report.runs[0].results.push(getResult(match, fname));
  }
}

function getResult({match, position}, fileName) {
  return {
    level: 'warning',
    message: {
      text: `Domain flagged by ${match.groupName}`
    },
    ruleId: match.groupId,
    partialFingerprints: {
      primaryLocationLineHash: `${fileName}/${match.groupId}/${match.hash}`
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: `${fileName}`
          },
          region: position,
        }
      }
    ]
  };

}