const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const key = require('../service_account.json');
const { URLS, ADDITIONAL_URLS } = require('./constants');

const BATCH_SIZE = 100;
const INDEXING_SCOPE = 'https://www.googleapis.com/auth/indexing';
const BATCH_URL = 'https://indexing.googleapis.com/batch';

// Daily rotation: Google's default Indexing API quota is ~200 publish requests per day per
// project (resets at midnight Pacific time). Each run sends at most DAILY_LIMIT URLs and
// remembers what was sent in a local, git-ignored state file, so repeated daily runs
// eventually cover every URL: new pages first, then pages changed since their last
// notification (sitemap <lastmod>), then a slow refresh of the oldest ones.
const STATE_PATH = path.resolve(__dirname, '..', '.index-google-state.json');
const SITEMAP_PATH = path.resolve(__dirname, '..', 'sitemap.xml');
const DEFAULT_DAILY_LIMIT = 190; // a little under the 200/day default quota
const DEFAULT_REFRESH_DAYS = 30; // re-notify unchanged URLs at most this often

function getIndexableUrls() {
    // Same list as urls.txt / IndexNow: every homepage, guide and FAQ page.
    try {
        return require('./site').allUrls();
    } catch (e) {
        console.warn('⚠️  Could not load page list from build/site.js, falling back to urls.txt:', e.message);
    }
    const urlsPath = path.resolve(__dirname, '..', 'urls.txt');
    if (fs.existsSync(urlsPath)) {
        return fs.readFileSync(urlsPath, 'utf8')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
    }
    return URLS.map(({ url }) => url);
}

function chunk(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

function buildBatchBody(urls) {
    const boundary = `batch_${crypto.randomUUID().replace(/-/g, '')}`;
    const parts = urls.map((url, index) => {
        const payload = JSON.stringify({ url, type: 'URL_UPDATED' });
        const httpRequest = [
            'POST /v3/urlNotifications:publish HTTP/1.1',
            'Content-Type: application/json',
            `Content-Length: ${Buffer.byteLength(payload)}`,
            '',
            payload,
        ].join('\r\n');

        return [
            `--${boundary}`,
            'Content-Type: application/http',
            'Content-Transfer-Encoding: binary',
            `Content-ID: <${index + 1}>`,
            '',
            httpRequest,
        ].join('\r\n');
    });

    return {
        boundary,
        body: `${parts.join('\r\n')}\r\n--${boundary}--\r\n`,
    };
}

async function submitBatch(urls, accessToken) {
    const { boundary, body } = buildBatchBody(urls);
    const response = await fetch(BATCH_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/mixed; boundary=${boundary}`,
        },
        body,
    });

    return {
        ok: response.ok,
        status: response.status,
        body: await response.text(),
    };
}

function parseBatchResponse(rawBody) {
    const results = [];
    const partPattern = /(?:Content-ID: <response-(\d+)>[\s\S]*?)?HTTP\/1\.1 (\d+) ([^\r\n]+)[\s\S]*?\r\n\r\n([\s\S]*?)(?=\r\n--batch_|\r\n--[^\r\n]+--\s*$)/g;

    for (const match of rawBody.matchAll(partPattern)) {
        const [, contentId, statusCode, statusText, payload] = match;
        const index = contentId ? Number(contentId) - 1 : results.length;
        const trimmed = payload.trim();

        if (trimmed.startsWith('{')) {
            try {
                const json = JSON.parse(trimmed);
                results.push({
                    index,
                    statusCode: Number(statusCode),
                    statusText,
                    url: json.urlNotificationMetadata?.url,
                    error: json.error?.message,
                    reason: json.error?.status,
                });
                continue;
            } catch {
                // fall through
            }
        }

        results.push({ index, statusCode: Number(statusCode), statusText, error: trimmed || undefined });
    }

    return results;
}

function logBatchResults(results) {
    const ok = results.filter((item) => item.statusCode >= 200 && item.statusCode < 300);
    const failed = results.filter((item) => item.statusCode < 200 || item.statusCode >= 300);

    console.log(`   ✓ ${ok.length} accepted, ✗ ${failed.length} failed`);

    const errorsByMessage = new Map();
    for (const item of failed) {
        const key = `${item.statusCode} ${item.statusText}|${item.error || ''}`;
        errorsByMessage.set(key, (errorsByMessage.get(key) || 0) + 1);
    }

    for (const [key, count] of errorsByMessage) {
        const [status, message] = key.split('|');
        const suffix = count > 1 ? ` (×${count})` : '';
        console.error(`   ✗ HTTP ${status}${suffix}`);
        if (message) {
            console.error(`     ${message}`);
        }
    }
}

function parseArgs(argv) {
    const args = { limit: DEFAULT_DAILY_LIMIT, refreshDays: DEFAULT_REFRESH_DAYS, dryRun: false, status: false, reset: false };
    for (const arg of argv) {
        const [name, value] = arg.split('=');
        if (name === '--limit') args.limit = Math.max(0, parseInt(value, 10) || 0);
        else if (name === '--refresh-days') args.refreshDays = Math.max(0, parseInt(value, 10) || 0);
        else if (name === '--dry-run') args.dryRun = true;
        else if (name === '--status') args.status = true;
        else if (name === '--reset') args.reset = true;
        else if (name === '--help' || name === '-h') args.help = true;
        else throw new Error(`Unknown option: ${arg}`);
    }
    return args;
}

function printHelp() {
    console.log(`Usage: npm run index:google -- [options]

Sends at most --limit URLs per Pacific-time day to the Google Indexing API and remembers
progress in .index-google-state.json (git-ignored), so daily runs cover the whole site.

  --limit=N          max URLs per day (default ${DEFAULT_DAILY_LIMIT}; Google default quota is 200)
  --refresh-days=N   re-send unchanged URLs only if last sent more than N days ago (default ${DEFAULT_REFRESH_DAYS})
  --dry-run          show what would be sent today, send nothing
  --status           show progress and exit
  --reset            forget all progress and exit`);
}

// Quota resets at midnight Pacific time.
function pacificDay(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(date);
}

function loadState() {
    try {
        const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
        return { day: state.day || null, usedToday: state.usedToday || 0, sent: state.sent || {} };
    } catch {
        return { day: null, usedToday: 0, sent: {} };
    }
}

function saveState(state) {
    const tmp = `${STATE_PATH}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(tmp, STATE_PATH);
}

function readSitemapLastmod() {
    const lastmod = new Map();
    if (!fs.existsSync(SITEMAP_PATH)) return lastmod;
    const xml = fs.readFileSync(SITEMAP_PATH, 'utf8');
    for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
        const loc = block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/);
        if (!loc) continue;
        const mod = block.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/);
        lastmod.set(loc[1], mod ? mod[1] : null);
    }
    return lastmod;
}

function daysBetween(fromIso, to = new Date()) {
    return (to.getTime() - new Date(fromIso).getTime()) / 86400000;
}

// Ordered queue for today: never sent (newest lastmod first) → changed since last send → stale.
function buildQueue(urls, lastmod, sent, refreshDays) {
    const fresh = [];
    const changed = [];
    const stale = [];
    for (const url of urls) {
        const record = sent[url];
        const mod = lastmod.get(url) || null;
        if (!record) fresh.push({ url, mod });
        else if (mod && mod > record.at.slice(0, 10)) changed.push({ url, mod });
        else if (daysBetween(record.at) >= refreshDays) stale.push({ url, at: record.at });
    }
    const byModDesc = (a, b) => String(b.mod || '').localeCompare(String(a.mod || '')) || a.url.localeCompare(b.url);
    fresh.sort(byModDesc);
    changed.sort(byModDesc);
    stale.sort((a, b) => a.at.localeCompare(b.at) || a.url.localeCompare(b.url));
    return { fresh, changed, stale, queue: [...fresh, ...changed, ...stale].map((item) => item.url) };
}

function printStatus(urls, state, queueInfo, limit, today) {
    const sentCount = urls.filter((url) => state.sent[url]).length;
    const usedToday = state.day === today ? state.usedToday : 0;
    const remainingToday = Math.max(0, limit - usedToday);
    console.log(`📊 ${sentCount}/${urls.length} URL(s) notified at least once`);
    console.log(`   never sent: ${queueInfo.fresh.length}, changed since last send: ${queueInfo.changed.length}, due for refresh: ${queueInfo.stale.length}`);
    console.log(`   today (${today} PT): ${usedToday}/${limit} used, ${remainingToday} left`);
    const pending = queueInfo.fresh.length + queueInfo.changed.length;
    if (pending > 0 && limit > 0) {
        console.log(`   ≈ ${Math.ceil(Math.max(0, pending - remainingToday) / limit) + (remainingToday > 0 ? 1 : 0)} more daily run(s) to cover all new/changed URLs`);
    }
}

async function main() {
    let args;
    try {
        args = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(`❌ ${error.message}`);
        printHelp();
        process.exitCode = 1;
        return;
    }
    if (args.help) return printHelp();

    if (args.reset) {
        if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
        console.log('🧹 Progress reset.');
        return;
    }

    const lastmod = readSitemapLastmod();
    // sitemap.xml is the source of truth (HTML pages only, with <lastmod>); fall back to the old list if missing.
    const urls = lastmod.size > 0
        ? Array.from(lastmod.keys())
        : Array.from(new Set([...getIndexableUrls(), ...(ADDITIONAL_URLS || [])]));
    const state = loadState();
    const today = pacificDay();
    if (state.day !== today) {
        state.day = today;
        state.usedToday = 0;
    }

    const queueInfo = buildQueue(urls, lastmod, state.sent, args.refreshDays);
    printStatus(urls, state, queueInfo, args.limit, today);
    if (args.status) return;

    const budget = Math.max(0, args.limit - state.usedToday);
    const todays = queueInfo.queue.slice(0, budget);
    if (todays.length === 0) {
        console.log(budget === 0 ? '⏸  Daily limit already used — run again tomorrow.' : '✅ Nothing to send today: every URL is up to date.');
        return;
    }

    console.log();
    console.log(`🚀 ${args.dryRun ? '[dry run] Would send' : 'Sending'} ${todays.length} URL(s) to the Google Indexing API...`);
    if (args.dryRun) {
        todays.forEach((url) => console.log(`   • ${url}`));
        return;
    }

    const client = new google.auth.JWT({
        email: key.client_email,
        key: key.private_key,
        scopes: [INDEXING_SCOPE],
    });

    await client.authorize();
    const accessToken = client.credentials.access_token;

    let accepted = 0;
    let quotaHit = false;
    const batches = chunk(todays, BATCH_SIZE);
    for (let i = 0; i < batches.length && !quotaHit; i++) {
        const batch = batches[i];
        console.log();
        console.log(`📦 Batch ${i + 1}/${batches.length} (${batch.length} URL(s))`);
        batch.forEach((url) => console.log(`   • ${url}`));

        const { ok, status, body } = await submitBatch(batch, accessToken);
        if (status === 429) {
            quotaHit = true;
        }
        const results = parseBatchResponse(body);
        const now = new Date().toISOString();

        for (const result of results) {
            const url = result.url || batch[result.index];
            if (!url) continue;
            if (result.statusCode >= 200 && result.statusCode < 300) {
                state.sent[url] = { at: now };
                state.usedToday += 1;
                accepted += 1;
            } else if (result.statusCode === 429 || result.reason === 'RESOURCE_EXHAUSTED') {
                quotaHit = true;
            }
        }

        const hasFailures = !ok || results.length === 0 || results.some((item) => item.statusCode < 200 || item.statusCode >= 300);
        if (!hasFailures) {
            console.log(`✅ Batch ${i + 1} accepted (HTTP ${status})`);
        } else {
            console.error(`❌ Batch ${i + 1} had failures (HTTP ${status})`);
            process.exitCode = 1;
        }

        logBatchResults(results);
        saveState(state); // persist after every batch so an interrupted run never re-sends
        console.log('-'.repeat(30));
    }

    if (quotaHit) {
        state.usedToday = Math.max(state.usedToday, args.limit);
        saveState(state);
        console.error('⏸  Google quota exhausted for today — the rest will go out on the next run.');
    }

    console.log();
    console.log(`✅ ${accepted} URL(s) accepted today.`);
    printStatus(urls, state, buildQueue(urls, lastmod, state.sent, args.refreshDays), args.limit, today);
}

main().catch((error) => {
    console.error('❌ Google Indexing API submit failed.');
    console.error(error);
    process.exitCode = 1;
});
