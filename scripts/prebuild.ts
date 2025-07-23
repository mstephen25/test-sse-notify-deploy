import { loadEnvConfig } from '@next/env';
import { writeFileSync } from 'fs';
import { join } from 'path';
import assert from 'assert';

loadEnvConfig(process.cwd());

const version = process.env.NEXT_PUBLIC_TEST_VAR;

assert(version, 'Variable must be present at build time!');

writeFileSync(join(process.cwd(), 'public/version.txt'), version);
