const fs = require('fs');
const path = require('path');

const {
  LANGUAGES,
  DEFAULT_LANGUAGE,
  EXPECTED_JSON_LD_TYPES,
  EXPECTED_GUIDE_JSON_LD_TYPES,
  EXPECTED_GUIDES_HUB_JSON_LD_TYPES,
  GUIDE_URLS,
  GUIDE_HUBS
} = require('../constants');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

/**
 * Every generated HTML page the validators should check.
 * `lang` drives locale-specific heuristics; `kind` selects the expected JSON-LD type set.
 */
function listPages() {
  const pages = LANGUAGES.map((lang) => ({
    id: lang,
    lang,
    kind: 'home',
    file: path.join(PROJECT_ROOT, lang === DEFAULT_LANGUAGE ? 'index.html' : `${lang}/index.html`),
    expectedJsonLdTypes: EXPECTED_JSON_LD_TYPES
  }));

  for (const { lang, outputPath } of GUIDE_HUBS) {
    if (fs.existsSync(outputPath)) {
      pages.push({
        id: lang === DEFAULT_LANGUAGE ? 'guides-hub' : `guides-hub:${lang}`,
        lang,
        kind: 'hub',
        file: outputPath,
        expectedJsonLdTypes: EXPECTED_GUIDES_HUB_JSON_LD_TYPES
      });
    }
  }
  for (const { slug, lang, outputPath } of GUIDE_URLS) {
    pages.push({
      id: lang === DEFAULT_LANGUAGE ? `guide:${slug}` : `guide:${lang}:${slug}`,
      lang,
      kind: 'guide',
      file: outputPath,
      expectedJsonLdTypes: EXPECTED_GUIDE_JSON_LD_TYPES
    });
  }

  return pages;
}

module.exports = { listPages, PROJECT_ROOT };
