#!/usr/bin/env node

import { scan } from './src/scan.js';
import process from 'node:process';
import { getAllPatterns } from './patterns.js';

const patterns = await getAllPatterns();
const report = await scan(patterns, process.argv[2] ?? '**/*', process.argv[3], process.argv[4] ?? null);
console.log(JSON.stringify(report));
