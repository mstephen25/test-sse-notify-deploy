import { loadEnvConfig } from '@next/env';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

loadEnvConfig(process.cwd());

// Parse version out of package.json
const { version } = JSON.parse(readFileSync(join(process.cwd(), 'package.json')).toString('utf-8')) as { version: string };

// Write to the version.txt file, reflecting the latest version
writeFileSync(join(process.cwd(), 'public/version.txt'), version);

console.log(version);
