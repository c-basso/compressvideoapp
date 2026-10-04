const fs = require('fs');
const path = require('path');

const SITE_URL = "https://compressvideoapp.com/";
const APP_ID = '6808348626';
const APP_STORE_URL = APP_ID ? `https://apps.apple.com/app/id${APP_ID}` : 'https://apps.apple.com/';
const DEFAULT_LANGUAGE = 'en';

/**
 * Site locales. Add a code here and a matching `build/<code>.json` to publish a new language
 * (lookup tables for html lang / og:locale / native names live in build.js).
 */
const LANGUAGES = [
    DEFAULT_LANGUAGE
];

const URLS = LANGUAGES.map((code) => ({
    code,
    hreflang: code === 'no' ? 'nb' : code,
    lang: code,
    url: code === DEFAULT_LANGUAGE ? SITE_URL : `${SITE_URL}${code}/`
}));

/**
 * SEO guide pages: one JSON per target keyword.
 * English guides live in `build/guides/*.json` and are published under `/guides/<slug>/`.
 * Localized guide sets live in `build/guides/<lang>/*.json`; each file names its English twin in
 * `en_slug` so the pages are linked with hreflang. Slugs are written in the target language.
 */
const GUIDES_DIR = path.join(__dirname, 'guides');
const GUIDES_PATH_SEGMENT = 'guides';
const GUIDES_HUB_URL = `${SITE_URL}${GUIDES_PATH_SEGMENT}/`;
const PROJECT_ROOT_DIR = path.join(__dirname, '..');

const GUIDE_LOCALE_CONFIG = {
    en: { dir: GUIDES_DIR, segment: GUIDES_PATH_SEGMENT }
    // e.g. de: { dir: path.join(GUIDES_DIR, 'de'), segment: 'de/anleitungen' }
};

function listJsonSlugs(dir) {
    if (!fs.existsSync(dir)) {
        return [];
    }
    return fs
        .readdirSync(dir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => file.replace(/\.json$/, ''))
        .sort();
}

/** Languages that have at least one guide. English first. */
const GUIDE_LANGUAGES = Object.keys(GUIDE_LOCALE_CONFIG).filter(
    (lang) => listJsonSlugs(GUIDE_LOCALE_CONFIG[lang].dir).length > 0
);

function guideConfig(lang = DEFAULT_LANGUAGE) {
    const config = GUIDE_LOCALE_CONFIG[lang];
    if (!config) {
        throw new Error(`No guide configuration for language "${lang}"`);
    }
    return config;
}

function getGuideSlugs(lang = DEFAULT_LANGUAGE) {
    return listJsonSlugs(guideConfig(lang).dir);
}

function guideHubUrl(lang = DEFAULT_LANGUAGE) {
    return `${SITE_URL}${guideConfig(lang).segment}/`;
}

function guideUrlForSlug(slug, lang = DEFAULT_LANGUAGE) {
    return `${guideHubUrl(lang)}${slug}/`;
}

function guideOutputPathFor(slug, lang = DEFAULT_LANGUAGE) {
    return path.join(PROJECT_ROOT_DIR, ...guideConfig(lang).segment.split('/'), slug, 'index.html');
}

function guideHubOutputPath(lang = DEFAULT_LANGUAGE) {
    return path.join(PROJECT_ROOT_DIR, ...guideConfig(lang).segment.split('/'), 'index.html');
}

const guideJsonCache = new Map();
function readGuideJson(slug, lang = DEFAULT_LANGUAGE) {
    const key = `${lang}:${slug}`;
    if (!guideJsonCache.has(key)) {
        guideJsonCache.set(key, JSON.parse(fs.readFileSync(path.join(guideConfig(lang).dir, `${slug}.json`), 'utf8')));
    }
    return guideJsonCache.get(key);
}

/** English slug a guide belongs to (its own slug for English guides). */
function guideEnglishSlug(slug, lang = DEFAULT_LANGUAGE) {
    return lang === DEFAULT_LANGUAGE ? slug : readGuideJson(slug, lang).en_slug || null;
}

/** BCP 47 code for hreflang/lang: Norwegian pages live under /no/ but are Bokmål (nb). */
function toHreflang(lang) {
    return lang === 'no' ? 'nb' : lang;
}

/** hreflang alternates for one guide: every language that has a version of the same English guide. */
function getGuideAlternates(slug, lang = DEFAULT_LANGUAGE) {
    const enSlug = guideEnglishSlug(slug, lang);
    if (!enSlug) {
        return [{ lang, hreflang: toHreflang(lang), url: guideUrlForSlug(slug, lang) }];
    }
    const list = [];
    for (const altLang of GUIDE_LANGUAGES) {
        const match = getGuideSlugs(altLang).find((candidate) => guideEnglishSlug(candidate, altLang) === enSlug);
        if (match) {
            list.push({ lang: altLang, hreflang: toHreflang(altLang), url: guideUrlForSlug(match, altLang) });
        }
    }
    return list;
}

function getGuideHubAlternates() {
    return GUIDE_LANGUAGES.map((lang) => ({ lang, hreflang: toHreflang(lang), url: guideHubUrl(lang) }));
}

const GUIDE_URLS = GUIDE_LANGUAGES.flatMap((lang) =>
    getGuideSlugs(lang).map((slug) => ({
        slug,
        lang,
        url: guideUrlForSlug(slug, lang),
        outputPath: guideOutputPathFor(slug, lang)
    }))
);

const GUIDE_HUBS = GUIDE_LANGUAGES.map((lang) => ({
    lang,
    url: guideHubUrl(lang),
    outputPath: guideHubOutputPath(lang)
}));

const ADDITIONAL_URLS = [
    `${SITE_URL}llms.txt`,
    ...GUIDE_HUBS.map(({ url }) => url),
    ...GUIDE_URLS.map(({ url }) => url)
];

// Expected JSON-LD types that should be present on each generated page.
// Keep this list in sync with `build/template.html` structured data scripts.
// Note: MobileApplication is a subtype of SoftwareApplication and is acceptable
const EXPECTED_JSON_LD_TYPES = [
    'MobileApplication', // or 'SoftwareApplication' - MobileApplication is more specific
    'Organization',
    'WebSite',
    'HowTo',
    'FAQPage',
    'WebPage',
    'BreadcrumbList'
];

/** JSON-LD types every guide page (`guides/<slug>/index.html`) and the hub must include. */
const EXPECTED_GUIDE_JSON_LD_TYPES = [
    'Article',
    'HowTo',
    'FAQPage',
    'WebPage',
    'BreadcrumbList'
];

const EXPECTED_GUIDES_HUB_JSON_LD_TYPES = [
    'CollectionPage',
    'ItemList',
    'BreadcrumbList'
];

// IndexNow key; the key file <KEY>.txt at the site root is written by `npm run index:now`.
const INDEX_NOW_KEY = 'VprsvtyeguO2iImhduATEjQz7HxWXSBD';

/** Same legal docs as the App Store listing; merged into every locale `footer` in `normalizeFooter`. */
const FOOTER_PRIVACY_URL = 'https://c-basso.xyz/privacy.html';
const FOOTER_TERMS_URL = 'https://c-basso.xyz/terms.html';

/**
 * JSON-LD `aggregateRating` on `MobileApplication` (merged in `buildSoftwareApplicationStructuredData`).
 * Keep null until the app has real App Store ratings, e.g.
 * { '@type': 'AggregateRating', ratingValue: '4.5', ratingCount: '100' }
 */
const SOFTWARE_APPLICATION_AGGREGATE_RATING = null;

/**
 * Date the homepage content last changed (ISO). Bump ONLY when visible copy or facts change,
 * not on every build: it feeds the visible "Updated" label, JSON-LD dateModified and sitemap lastmod.
 * Guides carry their own `updated` field in build/guides/<slug>.json.
 */
const SITE_CONTENT_UPDATED_ISO = '2026-10-04';

/** Site-wide meta duplicated across locales; merged at build time in `normalizeMeta`. */
const SHARED_SITE_META = {
    author: 'c-basso',
    app_store_id: APP_ID ? String(APP_ID) : '',
    theme_color: '#7b2ff7',
    apple_mobile_web_app_status_bar_style: 'black-translucent',
    og_image_width: '1026',
    og_image_height: '539',
    og_type: 'website',
    twitter_card: 'summary_large_image',
    twitter_image_width: '1026',
    twitter_image_height: '539'
};

// https://www.indexnow.org/searchengines.json
const INDEX_NOW_ENGINES = [
    'indexnow.yep.com',
    'search.seznam.cz',
    'searchadvisor.naver.com',
    'indexnow.amazonbot.amazon',
    'api.indexnow.org',
    'yandex.com',
    'bing.com'
];

module.exports = {
    SITE_URL,
    APP_ID,
    APP_STORE_URL,
    URLS,
    DEFAULT_LANGUAGE,
    LANGUAGES,
    EXPECTED_JSON_LD_TYPES,
    EXPECTED_GUIDE_JSON_LD_TYPES,
    EXPECTED_GUIDES_HUB_JSON_LD_TYPES,
    GUIDES_DIR,
    GUIDES_PATH_SEGMENT,
    GUIDES_HUB_URL,
    GUIDE_URLS,
    GUIDE_HUBS,
    GUIDE_LANGUAGES,
    guideHubUrl,
    guideOutputPathFor,
    guideHubOutputPath,
    getGuideAlternates,
    getGuideHubAlternates,
    getGuideSlugs,
    guideUrlForSlug,
    INDEX_NOW_KEY,
    INDEX_NOW_ENGINES,
    ADDITIONAL_URLS,
    SHARED_SITE_META,
    FOOTER_PRIVACY_URL,
    FOOTER_TERMS_URL,
    SOFTWARE_APPLICATION_AGGREGATE_RATING,
    SITE_CONTENT_UPDATED_ISO
};