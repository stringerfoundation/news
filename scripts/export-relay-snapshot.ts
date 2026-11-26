#!/usr/bin/env node
// Fetch the signed public collection from configured relays and write data/news.json.
import { mkdir, writeFile } from 'node:fs/promises';
import relayConfig from '../relay-config.ts';
import { readRelaySnapshot } from '../relay/reader.ts';
import { validateSnapshot } from '../news-model.ts';

if (!relayConfig.enabled) throw new Error('Relay reader is disabled; enable relay-config before exporting');
const snapshot = validateSnapshot(
  await readRelaySnapshot(
    { pubkey: relayConfig.pubkey, relays: relayConfig.relays },
    (message) => console.error(message),
  ),
);
await mkdir('data', { recursive: true });
await writeFile('data/news.json', `${JSON.stringify(snapshot)}\n`);
console.error(
  `Wrote data/news.json · ${snapshot.generatedAt} · ${
    Object.values(snapshot.sources).reduce((total, source) => total + source.stories.length, 0)
  } stories`,
);
