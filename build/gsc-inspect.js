/**
 * Index status of site URLs via the Search Console URL Inspection API.
 *
 * Usage: node build/gsc-inspect.js [url ...]   (default: every URL in sitemap.xml)
 * Auth: service_account.json, same as gsc-report.js. Quota: 2000 inspections/day per property.
 */
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const ROOT = path.join(__dirname, '..');
const SITE = 'sc-domain:compressvideoapp.com';

function sitemapUrls() {
    const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function main() {
    const urls = process.argv.slice(2).length ? process.argv.slice(2) : sitemapUrls();
    const auth = new google.auth.GoogleAuth({
        keyFile: path.join(ROOT, 'service_account.json'),
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
    });
    const sc = google.searchconsole({ version: 'v1', auth });
    const rows = [];
    for (const url of urls) {
        try {
            const { data } = await sc.urlInspection.index.inspect({ requestBody: { inspectionUrl: url, siteUrl: SITE } });
            const r = data.inspectionResult.indexStatusResult || {};
            rows.push({ url: url.replace('https://compressvideoapp.com', ''), verdict: r.verdict, coverage: r.coverageState, lastCrawl: (r.lastCrawlTime || '-').slice(0, 10), canonical: r.googleCanonical === url ? 'same' : (r.googleCanonical || '-') });
        } catch (e) {
            rows.push({ url, verdict: 'ERROR', coverage: e.message });
        }
    }
    console.table(rows);
}

main().catch((e) => { console.error(e); process.exit(1); });
