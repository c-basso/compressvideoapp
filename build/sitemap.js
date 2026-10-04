const fs = require('fs');
const path = require('path');

const {
  SITE_URL,
  URLS,
  DEFAULT_LANGUAGE,
  GUIDE_URLS,
  GUIDE_HUBS,
  getGuideAlternates,
  getGuideHubAlternates
} = require('./constants');

function resolvePagePathByUrl(loc) {
  const parsed = new URL(loc);
  const cleanPath = parsed.pathname.replace(/^\/+|\/+$/g, '');
  if (!cleanPath) {
    return path.join(__dirname, '..', 'index.html');
  }
  return path.join(__dirname, '..', ...cleanPath.split('/'), 'index.html');
}

function getLastmodForUrl(loc) {
  const pagePath = resolvePagePathByUrl(loc);
  // Prefer the content date the build wrote into JSON-LD; file mtime changes on every build.
  const html = fs.readFileSync(pagePath, 'utf8');
  const match = html.match(/"dateModified":"(\d{4}-\d{2}-\d{2})"/);
  if (match) {
    return match[1];
  }
  return fs.statSync(pagePath).mtime.toISOString().slice(0, 10);
}

/**
 * Guide hubs and guide pages. Each one carries hreflang links to its versions in other languages
 * (paired through `en_slug` in the localized guide JSON); x-default is the English version.
 */
function guideUrls() {
  const list = [];
  const hubAlternates = getGuideHubAlternates();
  for (const { url, outputPath } of GUIDE_HUBS) {
    if (fs.existsSync(outputPath)) {
      list.push({ loc: url, priority: '0.8', alternates: hubAlternates });
    }
  }
  for (const { slug, lang, url, outputPath } of GUIDE_URLS) {
    if (fs.existsSync(outputPath)) {
      list.push({ loc: url, priority: '0.9', alternates: getGuideAlternates(slug, lang) });
    }
  }
  return list;
}

(function main() {
  const sitemapPath = path.join(__dirname, '..', 'sitemap.xml');
  const robotsPath = path.join(__dirname, '..', 'robots.txt');

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  lines.push('<urlset ');
  lines.push('  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  lines.push('  xmlns:xhtml="http://www.w3.org/1999/xhtml">');
  lines.push('  ');
  const defaultUrl = URLS.find(({ lang }) => lang === DEFAULT_LANGUAGE)?.url ?? SITE_URL;
  for (const { url: loc } of URLS) {
    const lastmod = getLastmodForUrl(loc);
    lines.push('  <url>');
    lines.push(`    <loc>${loc}</loc>`);
    lines.push(`    <lastmod>${lastmod}</lastmod>`);
    for (const { hreflang, url } of URLS) {
      lines.push(`    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${url}" />`);
    }
    lines.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${defaultUrl}" />`);
    lines.push('    <priority>1.0</priority>');
    lines.push('  </url>');
    lines.push('');
  }
  for (const { loc, priority, alternates } of guideUrls()) {
    const xDefault = alternates.find(({ lang }) => lang === DEFAULT_LANGUAGE)?.url || loc;
    lines.push('  <url>');
    lines.push(`    <loc>${loc}</loc>`);
    lines.push(`    <lastmod>${getLastmodForUrl(loc)}</lastmod>`);
    for (const { hreflang, url } of alternates) {
      lines.push(`    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${url}" />`);
    }
    lines.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${xDefault}" />`);
    lines.push(`    <priority>${priority}</priority>`);
    lines.push('  </url>');
    lines.push('');
  }
  lines.push('</urlset>');

  fs.writeFileSync(sitemapPath, lines.join('\n') + '\n', 'utf8');
  console.log(`✅ Successfully built sitemap.xml`);
  console.log(`📁 Output saved to: ${sitemapPath}`);
  console.log()

  const robots = `
User-agent: *
Allow: /

Sitemap: ${SITE_URL}sitemap.xml 
  `;
  fs.writeFileSync(robotsPath, robots.trim() + '\n', 'utf8');
  console.log(`✅ Successfully built robots.txt`);
  console.log(`📁 Output saved to: ${robotsPath}`);
  console.log()

})();

