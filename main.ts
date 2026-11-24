// Token Radar, Calibrated Edition (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input
// <file|dir>), scores every rankable pre-token protocol with the radar-4 model
// in lib/model.ts, writes the ranked board to /output/board.json, and copies this
// repository's dashboard/ and screenshots/ to /output. Last, it writes
// /output/dossier.json, the summary the judge reads, with the vendored make.fun
// library.
//
// radar-4 fits each category's TVL multiple from the snapshot's own live-token
// protocols (median market-cap / TVL per bucket), gives every protocol token odds
// from its bucket's record, tests the fit held-out twice, tests every value term
// held-out, and puts a calibrated P10-P90 range on every row — a range the
// held-out halves actually held (see the cover's five build-time checks). Farm
// calls read Farm now / Wait / Don't farm, from the implied value each farm
// dollar buys and the token odds. No multiple is hand-set.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html,
// dashboard/app.css and dashboard/app.js read /output/data.js, which this program
// writes from the same board. The board ranks 197 protocols — the whole watchlist,
// every other rankable pre-token protocol, and none of the wrapped, staked or
// bridged products the model sets aside.
//
// The program refuses to write a board that fails any of its five build-time
// checks (the cover shows them): the board gate, the range calibration, the
// per-term held-out table, the snapshot's integrity, and the output caps.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import type { BuildCheck } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

// Check C5, the output caps, from the source files, before anything is written:
// the dashboard's source must fit the dossier's text whole (65,536 bytes), and
// the screenshots must be 3 or 4 whole images within their caps.
const dashboardDir = join(here, 'dashboard');
const dashboardBytes = readdirSync(dashboardDir)
  .filter((n) => !n.startsWith('.'))
  .reduce((sum, n) => sum + statSync(join(dashboardDir, n)).size, 0);
const shotNames = existsSync(join(here, 'screenshots'))
  ? readdirSync(join(here, 'screenshots')).filter((n) => !n.startsWith('.'))
  : [];
const shotSizes = shotNames.map((n) => ({ name: n, bytes: statSync(join(here, 'screenshots', n)).size }));
const badShot = shotSizes.find((s) => !IMAGE_NAME.test(s.name) || s.bytes > SCREENSHOT_CAPS.max_bytes);
const capsOk =
  dashboardBytes <= TEXT_MAX_BYTES &&
  shotNames.length >= 3 &&
  shotNames.length <= SCREENSHOT_CAPS.max &&
  badShot === undefined &&
  board.length > 0;
const check5: BuildCheck = {
  id: 'C5-caps',
  name: 'Output caps',
  status: capsOk ? 'pass' : 'fail',
  detail:
    `dashboard source ${dashboardBytes.toLocaleString('en-US')} bytes (cap ${TEXT_MAX_BYTES.toLocaleString('en-US')}), ` +
    `${shotNames.length} screenshots (${shotSizes.map((s) => `${s.name} ${(s.bytes / 1024).toFixed(0)}KB`).join(', ')}, cap ${SCREENSHOT_CAPS.max} at ${(SCREENSHOT_CAPS.max_bytes / 1024).toFixed(0)}KB each), ` +
    `${board.length} board rows` +
    (badShot === undefined ? '' : ` — ${badShot.name} breaks its cap`),
};
radar.checks.push(check5);

const failed = radar.checks.filter((c) => c.status === 'fail');
if (failed.length > 0) {
  for (const c of radar.checks) process.stderr.write(`token radar: check ${c.id} ${c.status}: ${c.detail}\n`);
  process.stderr.write(`token radar: ${failed.length} build-time check(s) failed, refusing to write a board\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const fmtPct = (n: number): string => `${(n * 100).toFixed(1)}%`;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.above_floor_size} above the floor, ${radar.set_aside_size} set aside, ${radar.live_size} live set aside)\n` +
    `token radar: fitted multiples from ${radar.fitted.globalPeers} live peers (global median ${radar.fitted.globalMultiple}): ` +
    radar.fitted.multiples.map((m) => `${m.bucket} ${m.multiple}${m.source === 'global' ? '*' : ''} (n=${m.peers})`).join(', ') + '\n' +
    `token radar: held-out validation: ` +
    radar.validation.map((v) => `${v.split}: Spearman ${v.spearman.toFixed(2)}, MAPE ${(v.mape * 100).toFixed(1)}%, range coverage ${fmtPct(v.rangeCoverage)} (fit n=${v.fitPeers}, test n=${v.testPeers})`).join('; ') + '\n' +
    `token radar: ranges P10-P90 x${radar.ranges.widenK} from ${radar.ranges.peers} live peers (ratios ${radar.ranges.loRatio.toFixed(4)}-${radar.ranges.hiRatio.toFixed(4)}): held-out coverage ${radar.ranges.coverage.map(fmtPct).join(' / ')}, mean ${fmtPct(radar.ranges.meanCoverage)} (target ${fmtPct(radar.ranges.target)})\n` +
    `token radar: per-term held-out (delta Spearman, mean of halves): ` +
    radar.term_tests.terms.map((t) => `${t.term} ${t.meanDelta >= 0 ? '+' : ''}${t.meanDelta.toFixed(3)}`).join(', ') +
    `; full model ${radar.term_tests.fullModel.map((s) => s.toFixed(3)).join('/')} vs TVL-only ${radar.term_tests.tvlOnly.map((s) => s.toFixed(3)).join('/')}\n` +
    `token radar: farm calls: Farm now ${radar.call_counts.farm}, Wait ${radar.call_counts.wait}, Don't farm ${radar.call_counts.dont}\n` +
    `token radar: checks: ` + radar.checks.map((c) => `${c.id} ${c.status}`).join(', ') + '\n' +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
