// Stamps OTA build metadata for CI. One source of truth for both workflows:
//   - `baseline`            → writes www/ota.json (baked into the APK)
//   - `manifest <outDir>`   → writes <outDir>/latest.json (published to Pages)
//
// The build number is `git rev-list --count HEAD`: monotonic along the branch
// and identical no matter which workflow computes it, so an APK built at commit
// N and a web bundle published at commit M compare correctly (M > N ⇒ update).
//
// Usage:
//   node scripts/ota-stamp.mjs baseline
//   node scripts/ota-stamp.mjs manifest dist/updates
//
// Env: GITHUB_REPOSITORY ("owner/repo") is used to derive the Pages channel URL
// so forks automatically target their own Pages instead of the upstream repo.

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function buildNumber() {
  try {
    return Number(execSync('git rev-list --count HEAD').toString().trim()) || 0;
  } catch (e) {
    return 0;
  }
}

// "owner/repo" → https://owner.github.io/repo/updates (Pages hosts are lowercase)
function channelUrl() {
  const repo = process.env.GITHUB_REPOSITORY || '';
  const [owner, name] = repo.split('/');
  if (!owner || !name) return '';
  return `https://${owner.toLowerCase()}.github.io/${name}/updates`;
}

// Minimum native versionCode a web bundle needs = the versionCode currently in
// android/app/build.gradle. Bumping it (for native changes) automatically gates
// new web bundles to phones that installed the matching APK.
function nativeVersionCode() {
  try {
    const gradle = readFileSync('android/app/build.gradle', 'utf8');
    const m = gradle.match(/versionCode\s+(\d+)/);
    return m ? Number(m[1]) : 1;
  } catch (e) {
    return 1;
  }
}

// A short change summary for the in-app "what's new" prompt: the subject lines
// of the most recent commits. Best-effort — empty if git isn't available.
function releaseNotes() {
  try {
    const raw = execSync('git log -5 --pretty=%s').toString().trim();
    return raw
      .split('\n')
      .map((s) => `• ${s.trim()}`)
      .join('\n');
  } catch (e) {
    return '';
  }
}

const mode = process.argv[2];
const build = buildNumber();
const channel = channelUrl();

if (mode === 'baseline') {
  const out = { build, channel };
  writeFileSync('www/ota.json', `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Stamped www/ota.json → build ${build}, channel ${channel || '(none)'}`);
} else if (mode === 'manifest') {
  const outDir = process.argv[3] || 'dist/updates';
  mkdirSync(outDir, { recursive: true });
  const manifest = {
    build,
    version: `web-${build}`,
    url: `${channel}/bundle-${build}.zip`,
    minNative: nativeVersionCode(),
    notes: releaseNotes(),
    publishedAt: new Date().toISOString(),
  };
  writeFileSync(join(outDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${join(outDir, 'latest.json')}:`, manifest);
} else {
  console.error('Usage: ota-stamp.mjs <baseline|manifest [outDir]>');
  process.exit(1);
}
