const fs = require('fs');
const path = require('path');

const {
    URLS,
    SITE_URL,
    DEFAULT_LANGUAGE,
    LANGUAGES,
    APP_ID,
    APP_STORE_URL,
    SHARED_SITE_META,
    FOOTER_PRIVACY_URL,
    FOOTER_TERMS_URL,
    SOFTWARE_APPLICATION_AGGREGATE_RATING,
    SITE_CONTENT_UPDATED_ISO,
    GUIDES_DIR,
    GUIDES_HUB_URL,
    GUIDE_LANGUAGES,
    GUIDE_URLS,
    GUIDE_HUBS,
    guideHubUrl,
    guideOutputPathFor,
    guideHubOutputPath,
    getGuideAlternates,
    getGuideHubAlternates,
    getGuideSlugs,
    guideUrlForSlug
} = require('./constants');

const ROOT_DIR = path.join(__dirname, '..');
const TEMPLATE_PATH = path.join(__dirname, 'template.html');
const URLS_PATH = path.join(ROOT_DIR, 'urls.txt');
const LLMS_PATH = path.join(ROOT_DIR, 'llms.txt');
const STYLE_CSS_PATH = path.join(ROOT_DIR, 'style.css');
const WEBMANIFEST_PATH = path.join(ROOT_DIR, 'site.webmanifest');

const APP_STORE_PLACEHOLDER = '__APP_STORE_URL__';

const BUILD_TIMESTAMP = Date.now();
const BUILD_DATE_ISO = new Date(BUILD_TIMESTAMP).toISOString().slice(0, 10);
const CURRENT_YEAR = new Date().getFullYear();

/** Content dates (not build dates): see SITE_CONTENT_UPDATED_ISO in constants.js. */
const HOME_UPDATED_ISO = SITE_CONTENT_UPDATED_ISO;

function guideUpdatedIso(guide) {
    return guide.updated || guide.published || HOME_UPDATED_ISO;
}

function formatIsoDate(iso, localeTag = 'en-US') {
    try {
        return new Date(`${iso}T00:00:00Z`).toLocaleDateString(localeTag, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC'
        });
    } catch {
        return iso;
    }
}

function slugifyHeading(value) {
    return String(stripHtml(value) || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/g, '');
}

const DEFAULT_SITE_NAME = 'Compress Video';
const DEFAULT_OG_LOGO = `${SITE_URL}img/app-icon.webp`;

const ALTERNATE_LANGUAGE_LINKS = URLS.map(({ code, hreflang, url }) => ({
    code,
    hreflang,
    lang: hreflang,
    url
}));

const HTML_LANG_BY_CODE = {
    en: 'en',
    cs: 'cs',
    da: 'da',
    de: 'de',
    el: 'el',
    es: 'es',
    fi: 'fi',
    fil: 'fil',
    fr: 'fr',
    he: 'he',
    hr: 'hr',
    hu: 'hu',
    id: 'id',
    it: 'it',
    ja: 'ja',
    ko: 'ko',
    ms: 'ms',
    nl: 'nl',
    no: 'nb',
    pl: 'pl',
    pt: 'pt',
    ro: 'ro',
    ru: 'ru',
    sk: 'sk',
    sv: 'sv',
    bg: 'bg',
    sl: 'sl',
    ca: 'ca',
    hi: 'hi',
    bn: 'bn',
    ta: 'ta',
    te: 'te',
    ml: 'ml',
    th: 'th',
    tr: 'tr',
    uk: 'uk',
    vi: 'vi',
    zh: 'zh'
};

const OG_LOCALE_BY_LANGUAGE = {
    en: 'en_US',
    cs: 'cs_CZ',
    da: 'da_DK',
    ru: 'ru_RU',
    es: 'es_ES',
    fi: 'fi_FI',
    fil: 'tl_PH',
    fr: 'fr_FR',
    he: 'he_IL',
    hr: 'hr_HR',
    hu: 'hu_HU',
    id: 'id_ID',
    de: 'de_DE',
    el: 'el_GR',
    it: 'it_IT',
    ja: 'ja_JP',
    pt: 'pt_PT',
    ko: 'ko_KR',
    ms: 'ms_MY',
    nl: 'nl_NL',
    no: 'nb_NO',
    pl: 'pl_PL',
    ro: 'ro_RO',
    sk: 'sk_SK',
    sv: 'sv_SE',
    bg: 'bg_BG',
    sl: 'sl_SI',
    ca: 'ca_ES',
    hi: 'hi_IN',
    bn: 'bn_BD',
    ta: 'ta_IN',
    te: 'te_IN',
    ml: 'ml_IN',
    th: 'th_TH',
    tr: 'tr_TR',
    uk: 'uk_UA',
    vi: 'vi_VN',
    zh: 'zh_CN'
};

/** Native-language names for the footer language switcher. */
const LANGUAGE_NAMES = {
    en: 'English',
    cs: 'Čeština',
    da: 'Dansk',
    de: 'Deutsch',
    el: 'Ελληνικά',
    es: 'Español',
    fi: 'Suomi',
    fil: 'Filipino',
    fr: 'Français',
    he: 'עברית',
    hr: 'Hrvatski',
    hu: 'Magyar',
    id: 'Bahasa Indonesia',
    it: 'Italiano',
    ja: '日本語',
    ko: '한국어',
    ms: 'Bahasa Melayu',
    nl: 'Nederlands',
    no: 'Norsk',
    pl: 'Polski',
    pt: 'Português',
    ro: 'Română',
    ru: 'Русский',
    sk: 'Slovenčina',
    sv: 'Svenska',
    bg: 'Български',
    sl: 'Slovenščina',
    ca: 'Català',
    hi: 'हिन्दी',
    bn: 'বাংলা',
    ta: 'தமிழ்',
    te: 'తెలుగు',
    ml: 'മലയാളം',
    th: 'ไทย',
    tr: 'Türkçe',
    uk: 'Українська',
    vi: 'Tiếng Việt',
    zh: '简体中文'
};

// Footer language switcher: hidden while the site has a single locale.
const LANGUAGE_LINKS = ALTERNATE_LANGUAGE_LINKS.length > 1
    ? ALTERNATE_LANGUAGE_LINKS.map((link) => ({
        ...link,
        name: LANGUAGE_NAMES[link.code] || link.hreflang
    }))
    : null;

const CANONICAL_URL_BY_LANGUAGE = new Map(URLS.map(({ code, url }) => [code, url]));

function assertStyleCssExists() {
    if (!fs.existsSync(STYLE_CSS_PATH)) {
        throw new Error(`Missing ${STYLE_CSS_PATH} (create or restore style.css next to index.html)`);
    }
    console.log(`✅ style.css present: ${STYLE_CSS_PATH}`);
    console.log();
}

function syncWebManifest() {
    if (!fs.existsSync(WEBMANIFEST_PATH)) {
        return;
    }
    const manifest = JSON.parse(fs.readFileSync(WEBMANIFEST_PATH, 'utf8'));
    manifest.name = DEFAULT_SITE_NAME;
    if (APP_ID) {
        manifest.related_applications = [{ platform: 'itunes', url: APP_STORE_URL, id: String(APP_ID) }];
    } else {
        delete manifest.related_applications;
    }
    fs.writeFileSync(WEBMANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`✅ site.webmanifest -> App Store id ${APP_ID || '(not set yet)'}`);
    console.log();
}

function writeUrlsFile() {
    const all = URLS.map(({ url }) => url)
        .concat(GUIDE_HUBS.map(({ url }) => url))
        .concat(GUIDE_URLS.map(({ url }) => url));
    fs.writeFileSync(URLS_PATH, all.join('\n'), 'utf8');
    console.log('✅ Successfully built urls.txt file');
    console.log(`📁 Output saved to: ${URLS_PATH}`);
    console.log();
}

function absoluteSiteUrl(maybe) {
    if (maybe == null || maybe === '') {
        return SITE_URL;
    }
    const value = String(maybe);
    if (/^https?:\/\//i.test(value)) {
        return value;
    }
    return `${SITE_URL.replace(/\/?$/, '/')}${value.replace(/^\//, '')}`;
}

function writeLlmsFile(defaultLocaleData, guides = [], localizedGuides = {}) {
    const appName = defaultLocaleData.header?.app_name || DEFAULT_SITE_NAME;
    const description = stripHtml(defaultLocaleData.meta?.description) || '';
    const lastUpdated = BUILD_DATE_ISO;
    const privacyUrl = absoluteSiteUrl(FOOTER_PRIVACY_URL);
    const termsUrl = absoluteSiteUrl(FOOTER_TERMS_URL);
    const rating = SOFTWARE_APPLICATION_AGGREGATE_RATING;
    // Product facts for AI assistants live in en.json under `llms` (entity / numbers arrays of strings).
    const llms = defaultLocaleData.llms || {};

    const guideLines = guides.length
        ? [
            '## How-to guides (English)',
            `- [All guides](${GUIDES_HUB_URL})`,
            ...guides.map((guide) => `- [${stripHtml(guide.h1)}](${guideUrlForSlug(guide.slug)}): ${stripHtml(guide.description)}`),
            ''
        ]
        : [];

    const localizedGuideLines = Object.entries(localizedGuides).flatMap(([lang, list]) =>
        list.length
            ? [
                `## How-to guides (${LANGUAGE_NAMES[lang] || lang})`,
                `- [${LANGUAGE_NAMES[lang] || lang} guides hub](${guideHubUrl(lang)})`,
                ...list.map((guide) => `- [${stripHtml(guide.h1)}](${guideUrlForSlug(guide.slug, lang)}): ${stripHtml(guide.description)}`),
                ''
            ]
            : []
    );

    const languageLines = LANGUAGES.length > 1
        ? ['## Language pages', ...ALTERNATE_LANGUAGE_LINKS.map(({ hreflang, url }) => `- [${hreflang}](${url})`), '']
        : [];

    const faqLines = (defaultLocaleData.seo?.faq || []).flatMap((faq) => [
        `### ${stripHtml(faq.question)}`,
        stripHtml(faq.answer),
        ''
    ]);

    const lines = [
        `# ${appName}`,
        '',
        `> ${description}`,
        '',
        '## Entity snapshot',
        `- Name: ${appName}`,
        ...(llms.entity || []).map((line) => `- ${line}`),
        ...(APP_ID ? [`- App Store listing: ${APP_STORE_URL}`, `- App Store id: ${APP_ID}`] : []),
        '',
        '## By the numbers',
        ...(llms.numbers || []).map((line) => `- ${line}`),
        ...(rating ? [`- App Store rating: ${rating.ratingValue} out of 5 from ${rating.ratingCount} ratings`] : []),
        `- Public website: ${SITE_URL}`,
        `- Last website build date: ${lastUpdated}`,
        '',
        '## Main sections',
        `- [Home](${SITE_URL}): Product overview, how it works, FAQ, and App Store link`,
        `- [FAQ](${SITE_URL}#faq): Direct answers to common product questions`,
        ...(guides.length ? [`- [Guides](${GUIDES_HUB_URL}): Step-by-step how-to articles, one per use case`] : []),
        `- [Privacy policy](${privacyUrl}): Data and privacy details`,
        `- [Terms of service](${termsUrl}): Legal terms`,
        '',
        ...guideLines,
        ...localizedGuideLines,
        ...languageLines,
        ...(faqLines.length ? ['## LLM-ready Q&A facts', ...faqLines] : []),
        '## Contact and policies',
        `- Website: ${SITE_URL}`,
        `- Privacy: ${privacyUrl}`,
        `- Terms: ${termsUrl}`,
        '',
        `Last updated: ${lastUpdated}`
    ];

    fs.writeFileSync(LLMS_PATH, `${lines.join('\n')}\n`, 'utf8');
    console.log('✅ Successfully built llms.txt file');
    console.log(`📁 Output saved to: ${LLMS_PATH}`);
    console.log();
}

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stripHtml(value) {
    if (typeof value !== 'string') {
        return value;
    }
    return value
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getOutputDirectory(lang) {
    return path.join(ROOT_DIR, lang === DEFAULT_LANGUAGE ? '.' : lang);
}

function getJsonPath(lang) {
    return path.join(__dirname, `${lang}.json`);
}

function getOutputPath(lang) {
    return path.join(getOutputDirectory(lang), 'index.html');
}

function getMissingTranslationFiles() {
    return LANGUAGES
        .map((lang) => ({ lang, jsonPath: getJsonPath(lang) }))
        .filter(({ jsonPath }) => !fs.existsSync(jsonPath));
}

function getPreviewImageUrl(lang) {
    const relative = lang === DEFAULT_LANGUAGE ? 'site_preview.png' : `${lang}/site_preview.png`;
    const absolute = path.join(ROOT_DIR, relative);
    const usePath = fs.existsSync(absolute) ? relative : 'site_preview.png';
    return `${SITE_URL}${usePath}`;
}

function getCanonicalUrl(meta, lang) {
    return (
        meta.canonical ||
        meta.alternate_url ||
        meta.altenate_url ||
        CANONICAL_URL_BY_LANGUAGE.get(lang) ||
        SITE_URL
    );
}

function removeAlternateMetaFields(meta) {
    for (const key of Object.keys(meta)) {
        if (key.startsWith('alternate_')) {
            delete meta[key];
        }
    }
}

function normalizeMeta(data, lang) {
    data.meta = data.meta || {};
    removeAlternateMetaFields(data.meta);

    const canonicalUrl = getCanonicalUrl(data.meta, lang);
    const previewUrl = getPreviewImageUrl(lang);

    data.meta.lang = data.meta.lang || lang;
    data.meta.html_lang = data.meta.html_lang || HTML_LANG_BY_CODE[lang] || data.meta.lang;
    data.meta.html_dir = data.meta.html_dir || (lang === 'he' ? 'rtl' : 'ltr');
    data.meta.version = BUILD_TIMESTAMP;
    data.meta.canonical = canonicalUrl;
    data.meta.alternate_default = SITE_URL;
    data.meta.alternate_languages = ALTERNATE_LANGUAGE_LINKS;
    data.meta.og_url = canonicalUrl;
    data.meta.twitter_url = canonicalUrl;
    data.meta.og_image = previewUrl;
    data.meta.twitter_image = previewUrl;
    data.meta.og_logo = data.meta.og_logo || DEFAULT_OG_LOGO;
    data.meta.og_site_name = data.meta.og_site_name || data.header?.app_name || DEFAULT_SITE_NAME;
    data.meta.og_locale = data.meta.og_locale || OG_LOCALE_BY_LANGUAGE[lang] || OG_LOCALE_BY_LANGUAGE.en;
    data.meta.last_updated_iso = HOME_UPDATED_ISO;
    // Localized App Store screenshots live in img/screenshots/<lang>/ when the store listing has them.
    data.meta.screenshot_base =
        lang !== DEFAULT_LANGUAGE && fs.existsSync(path.join(ROOT_DIR, 'img', 'screenshots', lang))
            ? `/img/screenshots/${lang}/`
            : '/img/screenshots/';
    data.meta.language_links = LANGUAGE_LINKS;
    Object.assign(data.meta, SHARED_SITE_META);

    data.nav = data.nav || {};
    data.nav.home_url = canonicalUrl;
}

function normalizeFooter(data) {
    if (!data.footer) {
        data.footer = {};
    }
    data.footer.privacy_url = FOOTER_PRIVACY_URL;
    data.footer.terms_url = FOOTER_TERMS_URL;
    if (typeof data.footer.copyright === 'string') {
        data.footer.copyright = data.footer.copyright.replace(/\{year\}/g, String(CURRENT_YEAR));
    }
    data.footer.last_updated_iso = HOME_UPDATED_ISO;
}

function ensureSeoShape(data) {
    data.seo = data.seo || {};
    data.seo.structured_data = data.seo.structured_data || {};
}

function applyAppStoreFromConstants(data) {
    data.meta = data.meta || {};
    data.header = data.header || {};
    data.header.download_url = APP_STORE_URL;

    function visit(node) {
        if (Array.isArray(node)) {
            for (const element of node) {
                visit(element);
            }
            return;
        }
        if (node && typeof node === 'object') {
            for (const key of Object.keys(node)) {
                const value = node[key];
                if (typeof value === 'string' && value.includes(APP_STORE_PLACEHOLDER)) {
                    node[key] = value.split(APP_STORE_PLACEHOLDER).join(APP_STORE_URL);
                } else {
                    visit(value);
                }
            }
        }
    }

    visit(data);
}

function localeTagForIntl(lang) {
    const ogLocale = OG_LOCALE_BY_LANGUAGE[lang];
    return ogLocale ? ogLocale.replace('_', '-') : lang;
}

function setSeoLastUpdatedFromBuild(data, lang) {
    data.seo.last_updated = formatIsoDate(HOME_UPDATED_ISO, localeTagForIntl(lang));
}

function buildWebPageStructuredData(data) {
    data.seo.structured_data.webpage = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: data.meta?.title,
        url: data.meta?.canonical,
        description: data.meta?.description,
        dateModified: HOME_UPDATED_ISO,
        inLanguage: data.meta?.lang
    };
}

function buildOrganizationStructuredData(data) {
    if (data.seo.structured_data.organization) {
        return;
    }
    data.seo.structured_data.organization = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: data.meta?.og_site_name || data.header?.app_name || DEFAULT_SITE_NAME,
        description: stripHtml(data.meta?.description),
        url: data.meta?.canonical || SITE_URL,
        logo: data.meta?.og_logo || DEFAULT_OG_LOGO
    };
}

function buildSoftwareApplicationStructuredData(data) {
    const app = data.seo.structured_data.software_application;
    if (!app || typeof app !== 'object') {
        return;
    }
    app.url = data.meta?.canonical;
    app.downloadUrl = data.header?.download_url;
    if (app.offers && typeof app.offers === 'object') {
        app.offers.url = APP_STORE_URL;
    }
    app.dateModified = HOME_UPDATED_ISO;
    if (SOFTWARE_APPLICATION_AGGREGATE_RATING) {
        app.aggregateRating = { ...SOFTWARE_APPLICATION_AGGREGATE_RATING };
    }
    app.image = data.meta?.og_logo || DEFAULT_OG_LOGO;
    const shots = Array.isArray(data.screenshots?.items) ? data.screenshots.items : [];
    if (shots.length) {
        app.screenshot = shots.map((shot) => absoluteSiteUrl(shot.src));
    }
}

function buildWebsiteStructuredData(data) {
    const fallbackName = data.meta?.og_site_name || data.header?.app_name || DEFAULT_SITE_NAME;
    if (!data.seo.structured_data.website) {
        data.seo.structured_data.website = {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: fallbackName,
            description: stripHtml(data.meta?.description),
            inLanguage: data.meta?.lang,
            url: data.meta?.canonical || SITE_URL
        };
        return;
    }
    if (typeof data.seo.structured_data.website === 'object') {
        const website = data.seo.structured_data.website;
        website.url = data.meta?.canonical;
        website.name = website.name || fallbackName;
        website.description = website.description || stripHtml(data.meta?.description);
        website.inLanguage = website.inLanguage || data.meta?.lang;
        delete website.potentialAction;
    }
}

function buildHowToStructuredData(data) {
    const howto = data.seo.structured_data.howto;
    if (!howto || typeof howto !== 'object') {
        return;
    }
    if (!Array.isArray(howto.step)) {
        howto.step = [];
    }
    if (howto.step[0] && typeof howto.step[0] === 'object') {
        howto.step[0].url = APP_STORE_URL;
    }
}

function buildFaqStructuredData(data) {
    const items = Array.isArray(data.seo?.faq) ? data.seo.faq : [];
    data.seo.structured_data.faqpage = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((faq) => ({
            '@type': 'Question',
            name: stripHtml(faq?.question),
            acceptedAnswer: {
                '@type': 'Answer',
                text: stripHtml(faq?.answer)
            }
        }))
    };
}

function buildBreadcrumbStructuredData(data) {
    data.seo.breadcrumb_home = data.seo.breadcrumb_home || data.meta?.title || 'Home';
    data.seo.structured_data.breadcrumb_list = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            {
                '@type': 'ListItem',
                position: 1,
                name: data.seo.breadcrumb_home,
                item: data.meta?.canonical
            }
        ]
    };
}

function preparePageData(data, lang) {
    normalizeMeta(data, lang);
    normalizeFooter(data);
    ensureSeoShape(data);
    applyAppStoreFromConstants(data);
    setSeoLastUpdatedFromBuild(data, lang);
    buildWebPageStructuredData(data);
    buildOrganizationStructuredData(data);
    buildSoftwareApplicationStructuredData(data);
    buildWebsiteStructuredData(data);
    buildHowToStructuredData(data);
    buildFaqStructuredData(data);
    buildBreadcrumbStructuredData(data);
    return data;
}

function getValue(obj, keyPath) {
    return keyPath.split('.').reduce((value, key) => {
        if (value && typeof value === 'object' && key in value) {
            return value[key];
        }
        return undefined;
    }, obj);
}

function getValueFromContext(context, keyPath) {
    const direct = getValue(context, keyPath);
    if (direct !== undefined) {
        return direct;
    }
    if (!keyPath.includes('.')) {
        return undefined;
    }
    const parts = keyPath.split('.');
    const first = parts[0];
    if (first in context) {
        const firstValue = context[first];
        if (firstValue && typeof firstValue === 'object' && firstValue !== null) {
            const rest = parts.slice(1).join('.');
            return rest ? getValue(firstValue, rest) : firstValue;
        }
    }
    return undefined;
}

function warnForTemplateIssue(lang, message) {
    console.warn(`Warning [${lang}]: ${message}`);
}

const LOOP_PLACEHOLDER_ROOTS = new Set([
    'item', 'feature', 'section', 'lang', 'screenshot', 'fact', 'row', 'faq', 'step', 'guide', 'para', 'tip', 'link', 'stat'
]);

function shouldWarnMissingVar(pathExpression) {
    if (pathExpression.startsWith('seo.structured_data.')) {
        return false;
    }
    const root = pathExpression.split('.')[0];
    return !LOOP_PLACEHOLDER_ROOTS.has(root);
}

function applyFilters(value, filters, rawKey, lang) {
    let output = value;
    for (const filter of filters) {
        if (filter === 'json') {
            output = JSON.stringify(output);
        } else if (filter === 'text') {
            output = stripHtml(String(output));
        } else if (filter === 'attr') {
            output = String(output).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        } else {
            warnForTemplateIssue(lang, `Unknown filter "${filter}" in ${rawKey}`);
        }
    }
    return output;
}

const BLOCK_TAG_RE = /\{\{\s*(#each\s+([^\s]+)\s+as\s+\|([^|]+)\||#if\s+([^}\s]+)|\/each|\/if)\s*\}\}/g;

function replaceVariables(template, context, lang) {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        const rawKey = key.trim();
        if (rawKey.startsWith('#') || rawKey.startsWith('/') || rawKey.startsWith('>')) {
            return match;
        }
        const [pathExpression, ...filters] = rawKey
            .split('|')
            .map((part) => part.trim())
            .filter(Boolean);

        const value = getValueFromContext(context, pathExpression);
        if (value === undefined) {
            if (shouldWarnMissingVar(pathExpression)) {
                warnForTemplateIssue(lang, `Variable ${pathExpression} not found in data`);
            }
            return match;
        }

        return applyFilters(value, filters, rawKey, lang);
    });
}

function cleanupJsonArtifacts(content) {
    return content
        .replace(/,\s*\n[\s\n]*\]/g, '\n            ]')
        .replace(/,\s*\]/g, ']');
}

function isTruthy(value) {
    if (value === undefined || value === null || value === false || value === '' || value === 0) {
        return false;
    }
    if (Array.isArray(value)) {
        return value.length > 0;
    }
    return true;
}

/**
 * Find the index of the closing tag that matches the block opened at `openEnd`.
 * Blocks of the same kind nest; `#if` inside `#each` (and vice versa) is fine.
 */
function findMatchingClose(template, openEnd, kind) {
    const re = new RegExp(BLOCK_TAG_RE.source, 'g');
    re.lastIndex = openEnd;
    let depth = 1;
    let m;
    while ((m = re.exec(template))) {
        const tag = m[1];
        if (tag.startsWith(`#${kind}`)) {
            depth += 1;
        } else if (tag === `/${kind}`) {
            depth -= 1;
            if (depth === 0) {
                return { start: m.index, end: m.index + m[0].length };
            }
        }
    }
    return null;
}

/**
 * Renders `{{#each path as |var|}}…{{/each}}` and `{{#if path}}…{{/if}}` blocks recursively,
 * then interpolates `{{path|filter}}` variables.
 */
function renderBlocks(template, context, lang) {
    let output = '';
    let cursor = 0;
    const re = new RegExp(BLOCK_TAG_RE.source, 'g');
    let m;

    while ((m = re.exec(template))) {
        const [full, tag, eachPathRaw, eachVarRaw, ifPathRaw] = m;
        if (tag.startsWith('/')) {
            warnForTemplateIssue(lang, `Unbalanced closing tag ${full}`);
            continue;
        }
        const kind = tag.startsWith('#each') ? 'each' : 'if';
        const close = findMatchingClose(template, m.index + full.length, kind);
        if (!close) {
            warnForTemplateIssue(lang, `Missing closing tag for ${full}`);
            break;
        }

        output += replaceVariables(template.slice(cursor, m.index), context, lang);
        const inner = template.slice(m.index + full.length, close.start);

        if (kind === 'each') {
            const arrayPath = eachPathRaw.trim();
            const variableName = eachVarRaw.trim();
            const array = getValueFromContext(context, arrayPath);
            if (Array.isArray(array)) {
                output += cleanupJsonArtifacts(
                    array
                        .map((item, index) =>
                            renderBlocks(
                                inner,
                                { ...context, [variableName]: item, [`${variableName}_index`]: index + 1, [`${variableName}_is_first`]: index === 0 },
                                lang
                            )
                        )
                        .join('')
                );
            } else if (array != null) {
                warnForTemplateIssue(lang, `${arrayPath} is not an array (got ${typeof array})`);
            } else if (!arrayPath.includes('.')) {
                warnForTemplateIssue(lang, `${arrayPath} is not an array or not found`);
            }
        } else {
            const value = getValueFromContext(context, ifPathRaw.trim());
            if (isTruthy(value)) {
                output += renderBlocks(inner, context, lang);
            }
        }

        cursor = close.end;
        re.lastIndex = close.end;
    }

    output += replaceVariables(template.slice(cursor), context, lang);
    return output;
}

const PARTIALS_DIR = path.join(__dirname, 'partials');
const partialCache = new Map();

/** Inline `{{> name}}` partials from `build/partials/name.html` (recursive). */
function inlinePartials(template, depth = 0) {
    if (depth > 10) {
        throw new Error('Partial nesting too deep (cycle?)');
    }
    return template.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
        if (!partialCache.has(name)) {
            const partialPath = path.join(PARTIALS_DIR, `${name}.html`);
            if (!fs.existsSync(partialPath)) {
                throw new Error(`Missing partial: ${partialPath}`);
            }
            partialCache.set(name, fs.readFileSync(partialPath, 'utf8'));
        }
        return inlinePartials(partialCache.get(name), depth + 1);
    });
}

function renderTemplate(template, data, lang) {
    return cleanupJsonArtifacts(renderBlocks(inlinePartials(template), data, lang));
}

/* ------------------------------------------------------------------ */
/* Locale fallback                                                     */
/* ------------------------------------------------------------------ */

/**
 * Keys that must never be copied from `en.json` into another locale. `guides` stays English-only
 * (hidden on locale pages via `{{#if guides.items}}`) until it is translated.
 */
const NO_FALLBACK_TOP_LEVEL_KEYS = new Set(['guides']);
// Paths that must never be filled from English: they act as feature switches that only make
// sense together with locale-specific array content.
const NO_FALLBACK_PATHS = new Set([]);
// Non-linguistic structured-data values: falling back to English here is expected and not reported.
const SILENT_FALLBACK_PATHS = new Set([
    'seo.structured_data.software_application.alternateName',
    'seo.structured_data.software_application.applicationSubCategory',
    'seo.structured_data.software_application.offers.category',
    'seo.structured_data.software_application.author',
    'seo.structured_data.software_application.inLanguage',
    'seo.structured_data.howto.totalTime',
]);

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Fills keys missing from `target` with values from `defaults` (deep). Arrays are copied only
 * when the key is absent, so locale arrays (FAQ, stats, rows) are never mixed with English.
 */
function fillMissingFromDefaults(target, defaults, pathPrefix = '', report = []) {
    for (const key of Object.keys(defaults)) {
        if (!pathPrefix && NO_FALLBACK_TOP_LEVEL_KEYS.has(key)) {
            continue;
        }
        const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        if (NO_FALLBACK_PATHS.has(fullPath)) {
            continue;
        }
        if (!(key in target)) {
            target[key] = JSON.parse(JSON.stringify(defaults[key]));
            if (!SILENT_FALLBACK_PATHS.has(fullPath)) {
                report.push(fullPath);
            }
            continue;
        }
        if (isPlainObject(target[key]) && isPlainObject(defaults[key])) {
            fillMissingFromDefaults(target[key], defaults[key], fullPath, report);
        }
    }
    return report;
}

function applyEnglishFallback(data, lang, defaultRaw) {
    if (lang === DEFAULT_LANGUAGE) {
        return data;
    }
    const filled = fillMissingFromDefaults(data, defaultRaw);
    if (filled.length) {
        console.warn(`Warning [${lang}]: ${filled.length} key(s) fell back to English: ${filled.slice(0, 8).join(', ')}${filled.length > 8 ? ', …' : ''}`);
    }
    return data;
}

/* ------------------------------------------------------------------ */
/* Homepage                                                            */
/* ------------------------------------------------------------------ */

function guideCardItems(guides, lang) {
    return guides.map((guide) => ({
        slug: guide.slug,
        url: guideUrlForSlug(guide.slug, lang),
        title: guide.card_title || guide.h1,
        summary: guide.card_summary || guide.quick_answer,
        eyebrow: guide.eyebrow,
        screenshot_src: guide.screenshot?.src,
        screenshot_alt: guide.screenshot?.alt
    }));
}

/**
 * Homepage guide cards and FAQ "Learn more" links. Only for languages that have their own guide set
 * (`guidesByLang[lang]`); a locale JSON without a `guides` block keeps the section hidden.
 */
function attachGuideCards(data, guidesByLang, lang) {
    const guides = guidesByLang?.[lang];
    if (!Array.isArray(guides) || guides.length === 0 || !data.guides) {
        return;
    }
    data.guides.items = guideCardItems(guides, lang);
    data.guides.hub_url = guideHubUrl(lang);

    const bySlug = new Map(guides.map((guide) => [guide.slug, guide]));
    for (const faq of data.seo?.faq || []) {
        // `guide` may carry an anchor ("slug#section-id") to deep-link the matching section.
        const [slug, anchor] = String(faq.guide || '').split('#');
        if (slug && bySlug.has(slug)) {
            faq.learn_more_url = guideUrlForSlug(slug, lang) + (anchor ? `#${anchor}` : '');
            faq.learn_more_title = bySlug.get(slug).h1;
        } else if (slug) {
            console.warn(`Warning [${lang}]: FAQ links to unknown guide "${slug}"`);
        }
        // Otherwise an explicit `learn_more_url` / `learn_more_title` in the locale JSON is kept as-is.
        // Link text: per-item `learn_more_label` (e.g. for an App Store link), else the section default.
        faq.link_label = faq.learn_more_label || data.faq_section?.learn_more_label || 'Learn more';
    }
}

function buildPage(template, lang, { defaultRaw, guidesByLang }) {
    const outputDir = getOutputDirectory(lang);
    const outputPath = getOutputPath(lang);
    const jsonPath = getJsonPath(lang);

    ensureDirectoryExists(outputDir);
    const raw = applyEnglishFallback(readJsonFile(jsonPath), lang, defaultRaw);
    const data = preparePageData(raw, lang);
    attachGuideCards(data, guidesByLang, lang);
    fs.writeFileSync(outputPath, renderTemplate(template, data, lang), 'utf8');

    console.log(`✅ Successfully built index.html from template and ${lang}.json`);
    console.log(`📁 Output saved to: ${outputPath}`);
}

/* ------------------------------------------------------------------ */
/* Guides                                                              */
/* ------------------------------------------------------------------ */

const GUIDE_TEMPLATE_PATH = path.join(__dirname, 'guide-template.html');
const GUIDES_HUB_TEMPLATE_PATH = path.join(__dirname, 'guides-hub-template.html');

function readGuides(lang = DEFAULT_LANGUAGE) {
    const dir = lang === DEFAULT_LANGUAGE ? GUIDES_DIR : path.join(GUIDES_DIR, lang);
    return getGuideSlugs(lang).map((slug) => {
        const guide = readJsonFile(path.join(dir, `${slug}.json`));
        if (guide.slug && guide.slug !== slug) {
            throw new Error(`Guide file ${lang}/${slug}.json declares slug "${guide.slug}"`);
        }
        guide.slug = slug;
        return guide;
    }).sort((a, b) => {
        // Lower `priority` first (search demand / conversion intent); ties fall back to slug.
        const pa = Number.isFinite(a.priority) ? a.priority : 100;
        const pb = Number.isFinite(b.priority) ? b.priority : 100;
        return pa - pb || a.slug.localeCompare(b.slug);
    });
}

function guidePageMeta(siteData, lang) {
    return {
        html_lang: HTML_LANG_BY_CODE[lang] || lang,
        html_dir: lang === 'he' ? 'rtl' : 'ltr',
        lang,
        language_links: null
    };
}

function guideLabels(siteData) {
    return siteData.guides?.labels || {};
}

function buildGuideStructuredData(guide, siteData, lang) {
    const url = guideUrlForSlug(guide.slug, lang);
    const homeUrl = siteData.nav?.home_url || SITE_URL;
    const appName = siteData.header?.app_name || DEFAULT_SITE_NAME;
    const labels = guideLabels(siteData);
    const publisher = {
        '@type': 'Organization',
        name: siteData.seo?.structured_data?.organization?.name || 'c-basso',
        url: SITE_URL,
        logo: { '@type': 'ImageObject', url: DEFAULT_OG_LOGO }
    };
    const image = guide.screenshot?.src ? absoluteSiteUrl(guide.screenshot.src) : DEFAULT_OG_LOGO;

    return {
        article: {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: stripHtml(guide.h1),
            description: stripHtml(guide.description),
            image: [image],
            author: publisher,
            publisher,
            datePublished: guide.published || guideUpdatedIso(guide),
            dateModified: guideUpdatedIso(guide),
            mainEntityOfPage: url,
            inLanguage: lang,
            about: { '@type': 'MobileApplication', name: appName, url: homeUrl, operatingSystem: 'iOS' }
        },
        howto: {
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: stripHtml(guide.steps?.heading || guide.h1),
            description: stripHtml(guide.steps?.intro || guide.quick_answer),
            image,
            totalTime: guide.steps?.total_time || 'PT2M',
            inLanguage: lang,
            tool: [{ '@type': 'HowToTool', name: appName }],
            step: (guide.steps?.items || []).map((step, index) => ({
                '@type': 'HowToStep',
                position: index + 1,
                name: stripHtml(step.name),
                text: stripHtml(step.text),
                url: `${url}#step-${index + 1}`
            }))
        },
        faqpage: {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            inLanguage: lang,
            mainEntity: (guide.faq || []).map((faq) => ({
                '@type': 'Question',
                name: stripHtml(faq.question),
                acceptedAnswer: { '@type': 'Answer', text: stripHtml(faq.answer) }
            }))
        },
        webpage: {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: guide.title,
            url,
            description: stripHtml(guide.description),
            dateModified: guideUpdatedIso(guide),
            inLanguage: lang,
            isPartOf: { '@type': 'WebSite', name: appName, url: homeUrl }
        },
        breadcrumb_list: {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: labels.home || 'Home', item: homeUrl },
                { '@type': 'ListItem', position: 2, name: labels.guides || 'Guides', item: guideHubUrl(lang) },
                { '@type': 'ListItem', position: 3, name: stripHtml(guide.h1), item: url }
            ]
        }
    };
}

/** "N min read" from the guide's visible text (~220 words per minute, min 1). */
function readingTimeLabel(guide, siteData) {
    const collect = (node) => typeof node === 'string' ? [node]
        : Array.isArray(node) ? node.flatMap(collect)
        : node && typeof node === 'object' ? Object.entries(node)
            .filter(([key]) => !['slug', 'keywords', 'related', 'published', 'updated', 'priority', 'src', 'total_time', 'title', 'description'].includes(key))
            .flatMap(([, value]) => collect(value))
        : [];
    const words = collect(guide).join(' ').split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.round(words / 220));
    const template = siteData.guides?.labels?.reading_time || '{n} min read';
    return template.replace('{n}', String(minutes));
}

function prepareGuideData(guide, guides, siteData, lang) {
    const url = guideUrlForSlug(guide.slug, lang);
    const bySlug = new Map(guides.map((item) => [item.slug, item]));
    const related = (guide.related || [])
        .filter((slug) => bySlug.has(slug))
        .map((slug) => {
            const item = bySlug.get(slug);
            return { slug, url: guideUrlForSlug(slug, lang), title: item.card_title || item.h1, eyebrow: item.eyebrow };
        });
    const missingRelated = (guide.related || []).filter((slug) => !bySlug.has(slug));
    if (missingRelated.length) {
        console.warn(`Warning [guide:${lang}:${guide.slug}]: unknown related guide(s): ${missingRelated.join(', ')}`);
    }

    const previewImage = getPreviewImageUrl(lang);
    const steps = guide.steps
        ? { ...guide.steps, items: (guide.steps.items || []).map((step, index) => ({ ...step, number: index + 1 })) }
        : null;
    const sections = (guide.sections || []).map((section) => ({
        ...section,
        id: section.id || slugifyHeading(section.heading),
        ordered: Boolean(section.list && section.ordered),
        unordered: Boolean(section.list && !section.ordered)
    }));
    const cta = guide.cta || siteData.guides?.default_cta || {};
    const alternates = getGuideAlternates(guide.slug, lang);
    const xDefault = alternates.find((alt) => alt.lang === DEFAULT_LANGUAGE)?.url || url;

    return {
        ...siteData,
        page_type: 'guide',
        guide: {
            ...guide,
            url,
            // `screenshot.hide_in_article`: keep the image for hub cards / OG, but show the
            // caption as a text callout in the article instead of an unrelated store screenshot.
            figure: guide.screenshot && !guide.screenshot.hide_in_article ? guide.screenshot : null,
            callout: guide.screenshot?.hide_in_article && guide.screenshot.caption
                ? { text: guide.screenshot.caption }
                : null,
            steps,
            sections,
            related,
            cta,
            reading_time: readingTimeLabel(guide, siteData),
            updated_iso: guideUpdatedIso(guide),
            updated_label: formatIsoDate(guideUpdatedIso(guide), localeTagForIntl(lang))
        },
        guides: { ...(siteData.guides || {}), hub_url: guideHubUrl(lang) },
        meta: {
            ...siteData.meta,
            title: guide.title,
            description: guide.description,
            keywords: guide.keywords || siteData.meta.keywords,
            canonical: url,
            og_url: url,
            twitter_url: url,
            og_title: guide.og_title || guide.h1,
            og_description: guide.og_description || guide.description,
            twitter_title: guide.og_title || guide.h1,
            twitter_description: guide.og_description || guide.description,
            og_image: previewImage,
            twitter_image: previewImage,
            og_image_alt: guide.screenshot?.alt || siteData.meta.og_image_alt,
            twitter_image_alt: guide.screenshot?.alt || siteData.meta.twitter_image_alt,
            og_type: 'article',
            alternate_languages: alternates.map((alt) => ({ ...alt, lang: alt.hreflang })),
            alternate_default: xDefault,
            ...guidePageMeta(siteData, lang)
        },
        seo: {
            ...siteData.seo,
            structured_data: buildGuideStructuredData(guide, siteData, lang)
        }
    };
}

function buildGuides(guides, siteData, lang = DEFAULT_LANGUAGE) {
    if (guides.length === 0) {
        return;
    }
    const template = fs.readFileSync(GUIDE_TEMPLATE_PATH, 'utf8');
    for (const guide of guides) {
        const outputPath = guideOutputPathFor(guide.slug, lang);
        ensureDirectoryExists(path.dirname(outputPath));
        const data = prepareGuideData(guide, guides, siteData, lang);
        fs.writeFileSync(outputPath, renderTemplate(template, data, `guide:${lang}:${guide.slug}`), 'utf8');
        console.log(`✅ Built guide ${lang}/${guide.slug}`);
    }
    console.log();
}

function buildGuidesHub(guides, siteData, lang = DEFAULT_LANGUAGE) {
    if (guides.length === 0 || !fs.existsSync(GUIDES_HUB_TEMPLATE_PATH)) {
        return;
    }
    const template = fs.readFileSync(GUIDES_HUB_TEMPLATE_PATH, 'utf8');
    const hub = siteData.guides?.hub || {};
    const labels = guideLabels(siteData);
    const hubUrl = guideHubUrl(lang);
    const homeUrl = siteData.nav?.home_url || SITE_URL;
    const previewImage = getPreviewImageUrl(lang);
    const items = guideCardItems(guides, lang);
    const alternates = getGuideHubAlternates();

    const data = {
        ...siteData,
        page_type: 'hub',
        guides: { ...siteData.guides, items, hub_url: hubUrl, hub },
        meta: {
            ...siteData.meta,
            title: hub.title,
            description: hub.description,
            keywords: hub.keywords || siteData.meta.keywords,
            canonical: hubUrl,
            og_url: hubUrl,
            twitter_url: hubUrl,
            og_title: hub.h1,
            og_description: hub.description,
            twitter_title: hub.h1,
            twitter_description: hub.description,
            og_image: previewImage,
            twitter_image: previewImage,
            alternate_languages: alternates.map((alt) => ({ ...alt, lang: alt.hreflang })),
            alternate_default: GUIDES_HUB_URL,
            ...guidePageMeta(siteData, lang)
        },
        seo: {
            ...siteData.seo,
            structured_data: {
                collection: {
                    '@context': 'https://schema.org',
                    '@type': 'CollectionPage',
                    name: hub.h1,
                    description: stripHtml(hub.description),
                    url: hubUrl,
                    dateModified: guides.map(guideUpdatedIso).sort().pop() || HOME_UPDATED_ISO,
                    inLanguage: lang,
                    isPartOf: { '@type': 'WebSite', name: siteData.header?.app_name || DEFAULT_SITE_NAME, url: homeUrl }
                },
                item_list: {
                    '@context': 'https://schema.org',
                    '@type': 'ItemList',
                    itemListElement: items.map((item, index) => ({
                        '@type': 'ListItem',
                        position: index + 1,
                        name: stripHtml(item.title),
                        url: item.url
                    }))
                },
                breadcrumb_list: {
                    '@context': 'https://schema.org',
                    '@type': 'BreadcrumbList',
                    itemListElement: [
                        { '@type': 'ListItem', position: 1, name: labels.home || 'Home', item: homeUrl },
                        { '@type': 'ListItem', position: 2, name: labels.guides || 'Guides', item: hubUrl }
                    ]
                }
            }
        }
    };

    const outputPath = guideHubOutputPath(lang);
    ensureDirectoryExists(path.dirname(outputPath));
    fs.writeFileSync(outputPath, renderTemplate(template, data, `guides-hub:${lang}`), 'utf8');
    console.log(`✅ Built guides hub (${lang}) -> ${outputPath}`);
    console.log();
}

/* ------------------------------------------------------------------ */

function main() {
    const missing = getMissingTranslationFiles();
    if (missing.length > 0) {
        console.error(
            `❌ Missing translation files: ${missing.map((item) => `${item.lang}: ${path.basename(item.jsonPath)}`).join(', ')}`
        );
        process.exit(1);
    }

    assertStyleCssExists();
    syncWebManifest();
    writeUrlsFile();

    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const guidesByLang = Object.fromEntries(GUIDE_LANGUAGES.map((lang) => [lang, readGuides(lang)]));
    const guides = guidesByLang[DEFAULT_LANGUAGE] || [];
    const defaultRaw = readJsonFile(getJsonPath(DEFAULT_LANGUAGE));
    const defaultData = preparePageData(JSON.parse(JSON.stringify(defaultRaw)), DEFAULT_LANGUAGE);
    const localizedGuides = Object.fromEntries(
        Object.entries(guidesByLang).filter(([lang]) => lang !== DEFAULT_LANGUAGE)
    );
    writeLlmsFile(defaultData, guides, localizedGuides);

    for (const lang of LANGUAGES) {
        try {
            buildPage(template, lang, { defaultRaw, guidesByLang });
        } catch (error) {
            console.error(`❌ Error building ${lang}:`, error.message);
            process.exit(1);
        }
    }
    console.log();

    try {
        for (const lang of GUIDE_LANGUAGES) {
            const siteData = lang === DEFAULT_LANGUAGE
                ? defaultData
                : preparePageData(applyEnglishFallback(readJsonFile(getJsonPath(lang)), lang, defaultRaw), lang);
            if (!siteData.guides?.labels) {
                throw new Error(`build/${lang}.json has guides in build/guides/${lang}/ but no "guides" block`);
            }
            buildGuides(guidesByLang[lang], siteData, lang);
            buildGuidesHub(guidesByLang[lang], siteData, lang);
        }
    } catch (error) {
        console.error('❌ Error building guides:', error.message);
        process.exit(1);
    }
}

main();
