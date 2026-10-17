import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const selection = resolve('.local/runtime-selected.json');
const selected: { runtime?: string } = existsSync(selection) ? JSON.parse(readFileSync(selection, 'utf8')) : {};
const root = process.env.DSH_TEST_RUNTIME || selected.runtime || '.local/runtime';

/** Use the same released runtime as the plugin's linked service dependencies. */
export const runtimePath = (...segments: string[]) => resolve(root, ...segments);
