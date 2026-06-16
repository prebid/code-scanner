#!/usr/bin/env node

import {scan} from './src/scan.js';
import process from 'node:process';

const report = await scan(process.argv[2] ?? '**/*', process.argv[3], process.argv[4] ?? null);
console.log(JSON.stringify(report, null, 2));
