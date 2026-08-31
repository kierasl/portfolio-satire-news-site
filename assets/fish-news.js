/* ============================================================
   FISH NEWS — SITE SCRIPT
   ============================================================ */

'use strict';

/* ------------------------------------------------------------
   1. CONFIGURATION
   ------------------------------------------------------------ */

const CONFIG = {

  /* Where the article folders live. Root-absolute so it still resolves
     correctly from the per-article pages under /story/<id>/.
     Local:  '/content/'
     GitHub: 'https://raw.githubusercontent.com/USER/REPO/main/content/' */
  contentBase: '/content/',

  /* How the site works out what has been published.

     'auto'      try to list the content folder, fall back to index.json.
                 Works on any server with directory listing switched on,
                 including python3 -m http.server. Nothing to maintain.
     'directory' list the content folder and nothing else. Fails loudly.
     'github'    list the folder through the GitHub API. Set github below.
     'index'     read content/index.json only. Fastest, and the only option
                 that scales past a hundred or so stories — see the README. */
  discovery: 'auto',

  github: { owner: '', repo: '', branch: 'main', path: 'content' },

  /* Optional global override for where images, posters and video files load
     from. Leave blank to resolve assets against each article's own folder.
     Point it at a CDN to serve every asset from there instead, e.g.
     'https://cdn.example.com/fish-news/' */
  assetBase: '',

  /* How much appears on the front page. Everything older goes to the archive. */
  frontPage: { articles: 6, videos: 3 },

  /* The site's own public URL, used to build absolute links for article
     link previews (Open Graph). Include the trailing slash. */
  siteUrl: 'https://fish-news.tacteam.dev/',

  /* Where the Sponsored Deals page reads its sections/cards from. See the
     SPONSORED_DEALS comment below for the shape of that file. */
  sponsoredDealsUrl: '/content/sponsored-deals.json',
};

/* Sponsor logos shown in the footer strip. Empty by default — add entries
   like { name: 'Example Co', logo: 'example.png', url: 'https://example.com' }
   with logo files placed in assets/sponsors/. */
const SPONSORS = [
  {name: 'tacteam', logo: 'tacteam-colour.png', url: 'https://www.roblox.com/communities/33115459/tacteam'},
  {name: 'slimestore', logo: 'slimestore.png', url: 'https://www.roblox.com/communities/15152355/slimestore'},
  {name: 'RhymeyStudios', logo: 'rhymeystudios.png', url: 'https://www.roblox.com/communities/7156667/RhymeyStudios'},
  {name: 'OSA Fried Chicken', logo: 'osaFriedChicken.png', url: 'https://www.roblox.com/communities/33115459/tacteam'},
];

/* Sponsored deal cards shown on the Sponsored Deals page (linked from the
   footer) are read from CONFIG.sponsoredDealsUrl, grouped into sections.
   Each section gets its own centred logo header above a grid of its deal
   cards — add or remove as many sections, and as many deals within each,
   as you like in that JSON file; a section with no deals is skipped
   automatically, so there's no minimum.

   Section fields: name (used as alt text/fallback heading), logo (optional
   — filename in assets/sponsors/, or omit for a plain text heading), url
   (optional — makes the logo/heading a link).

   Deal fields: title, description, url (required — where the card links),
   image (optional square/1:1 image, filename in assets/sponsors/ or an
   absolute URL — omit to fall back to generated cover art). */

const SECTIONS = [
  { id: 'home',       name: 'Home',       blurb: '' },
  { id: 'news',       name: 'News',       blurb: 'The stories that matter, selected by whoever was on shift.' },
  { id: 'conflict',   name: 'Conflict', blurb: 'Balanced reporting from both sides, whenever both sides return our calls.' },
  { id: 'local-news', name: 'Local News',      blurb: 'Division news, reported as if we know which one you\'re in.' },
  { id: 'policy',     name: 'Policy',     blurb: 'The rules as written, the rules as enforced, and the gap between the two that Fish News declines to comment on.' },
  { id: 'development',name: 'Development News',    blurb: 'Progress, reported faithfully, and defined loosely.' },
  { id: 'video',      name: 'Watch',      blurb: 'Video reporting fronted by Chunce Whatney, who Fish News continues to insist is impartial.'},
  { id: 'tags',       name: 'Tags',       blurb: 'Every tag Fish News has used, busiest first.' },
  { id: 'archive',    name: 'Archive',    blurb: 'Everything that has come off the front page.' }
];

/* ------------------------------------------------------------
   2. STATE
   ------------------------------------------------------------ */

const state = {
  items: [],        // index metadata for every item
  full: {},         // id -> complete article, cached after first fetch
  sponsoredDeals: null, // cached after first fetch of CONFIG.sponsoredDealsUrl
  ready: false,
  error: null
};

/* ------------------------------------------------------------
   3. SMALL HELPERS
   ------------------------------------------------------------ */

const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sectionName(id){
  const s = SECTIONS.find(x => x.id === id);
  return s ? s.name : id;
}

function byNewest(list){
  return list.slice().sort((a, b) => new Date(b.published) - new Date(a.published));
}

function timeOf(iso){
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function dateOf(iso){
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function shortDate(iso){
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function monthKey(iso){
  const d = new Date(iso);
  return isNaN(d) ? 'undated' : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function monthLabel(key){
  if(key === 'undated') return 'Undated';
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function relative(iso){
  const d = new Date(iso);
  if(isNaN(d)) return '';
  const mins = Math.round((Date.now() - d) / 60000);
  if(mins < 1)  return 'just now';
  if(mins < 60) return mins + ' min ago';
  const hrs = Math.round(mins / 60);
  if(hrs < 24)  return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
  const days = Math.round(hrs / 24);
  if(days < 7)  return days + (days === 1 ? ' day ago' : ' days ago');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/* ------------------------------------------------------------
   4. ASSET RESOLUTION
   ------------------------------------------------------------
   A src is used as-is when it is absolute (http://, https://, //, or /).
   Anything else is treated as a filename inside the article's own folder,
   which by default is content/<id>/.

   Precedence for that folder:
     1. the article's own "assetBase"
     2. CONFIG.assetBase
     3. CONFIG.contentBase + <id> + '/'
   ------------------------------------------------------------ */

function isAbsolute(src){
  return /^(https?:)?\/\//i.test(src) || src.charAt(0) === '/';
}

function withSlash(s){
  return s && s.charAt(s.length - 1) !== '/' ? s + '/' : s;
}

function assetBaseFor(item){
  if(item.assetBase) return withSlash(item.assetBase);
  if(CONFIG.assetBase) return withSlash(CONFIG.assetBase);
  return withSlash(CONFIG.contentBase) + item.id + '/';
}

function resolveAsset(item, src){
  if(!src) return '';
  return isAbsolute(src) ? src : assetBaseFor(item) + src;
}

/* Generated cover art — layered brand waves, deterministic per item.
   Used when an article has no image, and as the fallback when one fails. */
function coverArt(id, dark){
  let h = 0;
  const s = String(id);
  for(let i = 0; i < s.length; i++){ h = (h * 31 + s.charCodeAt(i)) & 0xffff; }
  const sets = [
    ['#121862', '#6B7BE0', '#5696E6', '#9CA8D8'],
    ['#1B2A8C', '#5696E6', '#9CA8D8', '#6B7BE0'],
    ['#121862', '#5696E6', '#6B7BE0', '#9CA8D8'],
    ['#1B2A8C', '#6B7BE0', '#9CA8D8', '#5696E6']
  ];
  const c = sets[h % sets.length];
  const o = (h % 7) * 26;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" preserveAspectRatio="none">' +
    '<rect width="640" height="360" fill="' + (dark ? '#121862' : c[0]) + '"/>' +
    '<path fill="' + c[1] + '" d="M0,' + (150 + o % 40) + ' C160,' + (110 + o % 50) + ' 320,' + (200 - o % 50) + ' 480,' + (150 + o % 30) + ' C560,' + (125 + o % 20) + ' 600,' + (165 + o % 25) + ' 640,' + (145 + o % 30) + ' V360 H0 Z"/>' +
    '<path fill="' + c[2] + '" d="M0,' + (210 + o % 30) + ' C160,' + (175 + o % 40) + ' 320,' + (255 - o % 40) + ' 480,' + (210 + o % 25) + ' C560,' + (190 + o % 20) + ' 600,' + (225 + o % 20) + ' 640,' + (205 + o % 25) + ' V360 H0 Z"/>' +
    '<path fill="' + c[3] + '" d="M0,' + (272 + o % 22) + ' C160,' + (245 + o % 30) + ' 320,' + (305 - o % 30) + ' 480,' + (272 + o % 20) + ' C560,' + (256 + o % 15) + ' 600,' + (285 + o % 15) + ' 640,' + (268 + o % 20) + ' V360 H0 Z"/>' +
    '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* Returns { src, alt, fallback } for an item's lead image. */
function imageFor(item){
  const img = item.image || {};
  const fallback = coverArt(item.id, item.type === 'video');
  const src = img.src ? resolveAsset(item, img.src) : fallback;
  return { src: src, alt: img.alt || '', credit: img.credit || '', fallback: fallback };
}

/* An <img> that quietly swaps to generated artwork if the file is missing,
   so a wrong path or an unreachable repo never leaves a broken image. */
function imgTag(src, alt, fallback, cls){
  return '<img src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy"' +
    (cls ? ' class="' + cls + '"' : '') +
    ' onerror="this.onerror=null;this.src=\'' + fallback.replace(/'/g, '%27') + '\'">';
}

function embedUrl(v){
  if(!v || !v.url) return null;
  if(v.provider === 'youtube'){
    const m = v.url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
    return m ? 'https://www.youtube.com/embed/' + m[1] : null;
  }
  if(v.provider === 'vimeo'){
    const m = v.url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return m ? 'https://player.vimeo.com/video/' + m[1] : null;
  }
  return null;
}

/* ------------------------------------------------------------
   5. LOADING CONTENT
   ------------------------------------------------------------ */

async function fetchJson(url){
  const res = await fetch(url, { cache: 'no-cache' });
  if(!res.ok) throw new Error(res.status + ' ' + res.statusText + ' — ' + url);
  return res.json();
}

/* Lists the subfolders of a URL by reading whatever the server sends back
   for the directory itself. Handles nginx's JSON autoindex and the HTML
   listings produced by Apache, python3 -m http.server and most others. */
async function listDirectory(url){
  const res = await fetch(url, { cache: 'no-cache' });
  if(!res.ok) throw new Error(res.status + ' ' + res.statusText + ' — ' + url);

  const type = res.headers.get('content-type') || '';
  const text = await res.text();

  if(type.indexOf('json') !== -1){
    const data = JSON.parse(text);
    return data
      .filter(e => e.type === 'directory' || e.type === 'dir')
      .map(e => e.name);
  }

  const doc = new DOMParser().parseFromString(text, 'text/html');
  return Array.from(doc.querySelectorAll('a[href]'))
    .map(a => a.getAttribute('href'))
    .filter(function(h){
      return h && h.charAt(h.length - 1) === '/' &&
        h.indexOf('..') === -1 && h.charAt(0) !== '/' && h !== './';
    })
    .map(h => decodeURIComponent(h.replace(/\/$/, '')));
}

/* Lists the content folder through the GitHub API. Unauthenticated calls are
   limited to 60 an hour per IP, which is one page load each — fine for a small
   site, not for a busy one. */
async function listGithub(){
  const g = CONFIG.github;
  if(!g.owner || !g.repo) throw new Error('CONFIG.github needs an owner and a repo');
  const url = 'https://api.github.com/repos/' + g.owner + '/' + g.repo +
    '/contents/' + g.path + '?ref=' + g.branch;
  const data = await fetchJson(url);
  return data.filter(e => e.type === 'dir').map(e => e.name);
}

/* Opens every article named in a list of ids. Folders without an article.json
   are skipped quietly, so an images folder alongside the stories is harmless. */
async function fetchAll(ids){
  const loaded = await Promise.all(ids.map(async function(id){
    try{
      return await loadItem(id);
    }catch(err){
      console.warn('Skipping ' + id + ': ' + err.message);
      return null;
    }
  }));
  return loaded.filter(i => i && i.id && i.headline);
}

async function loadIndex(){
  const url = withSlash(CONFIG.contentBase) + 'index.json';
  const data = await fetchJson(url);
  const entries = Array.isArray(data) ? data : (data.items || []);

  /* An entry may be a bare id string or an object of index metadata.
     Objects are used as they stand — no article is opened until someone
     clicks into it, which is what keeps large sites quick. */
  const ids = entries.filter(e => typeof e === 'string');
  const objects = entries.filter(e => e && typeof e === 'object');
  const fetched = ids.length ? await fetchAll(ids) : [];

  return objects.concat(fetched).filter(i => i && i.id && i.headline);
}

async function loadContent(){
  const mode = CONFIG.discovery || 'auto';
  const dirUrl = withSlash(CONFIG.contentBase);
  let items = null;

  if(mode === 'github' || mode === 'auto' && CONFIG.github.owner){
    try{
      items = await fetchAll(await listGithub());
    }catch(err){
      if(mode === 'github'){ state.error = err.message; return; }
      console.warn('GitHub listing unavailable, falling back: ' + err.message);
    }
  }

  if(!items && (mode === 'directory' || mode === 'auto')){
    try{
      items = await fetchAll(await listDirectory(dirUrl));
    }catch(err){
      if(mode === 'directory'){ state.error = err.message; return; }
      console.warn('Directory listing unavailable, falling back to index.json: ' + err.message);
    }
  }

  if(!items || !items.length){
    try{
      items = await loadIndex();
    }catch(err){
      state.error = err.message;
      return;
    }
  }

  state.items = items;
}

async function loadItem(id){
  if(state.full[id]) return state.full[id];
  const url = withSlash(CONFIG.contentBase) + id + '/article.json';
  const data = await fetchJson(url);
  if(!data.id) data.id = id;
  state.full[id] = data;
  return data;
}

async function loadSponsoredDeals(){
  if(state.sponsoredDeals) return state.sponsoredDeals;
  const data = await fetchJson(CONFIG.sponsoredDealsUrl);
  state.sponsoredDeals = Array.isArray(data) ? data : [];
  return state.sponsoredDeals;
}

/* Every sponsored deal across every section, flattened, each one counting
   as a single equally-weighted entry — a section with five deals is five
   times as likely to turn up as one with a single deal, deliberately, so
   the front-page ad slot isn't picking sponsors, it's picking deals. */
function allSponsoredItems(){
  const sections = state.sponsoredDeals || [];
  const items = [];
  sections.forEach(function(s){
    (s.deals || []).forEach(function(d){
      items.push({ deal: d, section: s.section || {} });
    });
  });
  return items;
}

/* Every sponsored deal, shuffled (full Fisher-Yates). The front page shows
   the whole shuffled set — the ad slot is a CSS grid that wraps onto as
   many rows as it needs, so it always fills the available width and simply
   grows as more sponsors or deals are added to sponsored-deals.json. */
function shuffledSponsoredItems(){
  const items = allSponsoredItems();
  for(let i = items.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = items[i]; items[i] = items[j]; items[j] = tmp;
  }
  return items;
}

/* ------------------------------------------------------------
   6. FRONT PAGE / ARCHIVE SPLIT
   ------------------------------------------------------------ */

function frontPageSets(){
  const articles = byNewest(state.items.filter(i => i.type !== 'video')).slice(0, CONFIG.frontPage.articles);
  const videos   = byNewest(state.items.filter(i => i.type === 'video')).slice(0, CONFIG.frontPage.videos);
  return { articles: articles, videos: videos };
}

function frontPageIds(){
  const sets = frontPageSets();
  return new Set(sets.articles.concat(sets.videos).map(i => i.id));
}

function archiveItems(){
  const front = frontPageIds();
  return byNewest(state.items.filter(i => !front.has(i.id)));
}

/* Every tag in use, deduped case-insensitively (first-seen casing wins),
   sorted by how many stories carry it, most used first. */
function tagCounts(){
  const counts = new Map();
  state.items.forEach(function(item){
    (item.tags || []).forEach(function(t){
      const key = t.toLowerCase();
      if(!counts.has(key)) counts.set(key, { name: t, count: 0 });
      counts.get(key).count++;
    });
  });
  return Array.from(counts.values()).sort(function(a, b){
    return b.count - a.count || a.name.localeCompare(b.name);
  });
}

function matches(item, term){
  const hay = [item.headline, item.standfirst, item.byline, item.kicker, sectionName(item.section)]
    .concat(item.tags || []).join(' ').toLowerCase();
  return hay.indexOf(term) !== -1;
}

/* ------------------------------------------------------------
   7. COMPONENTS
   ------------------------------------------------------------ */

function mediaBlock(item){
  const img = imageFor(item);
  let extra = '';
  if(item.type === 'video'){
    const poster = item.video && item.video.poster ? resolveAsset(item, item.video.poster) : null;
    if(poster && !(item.image && item.image.src)) img.src = poster;
    extra = '<span class="play-badge" aria-hidden="true"><svg viewBox="0 0 10 12"><path d="M0 0 L10 6 L0 12 Z"/></svg></span>' +
      (item.video && item.video.duration ? '<span class="duration">' + esc(item.video.duration) + '</span>' : '');
  }
  return '<div class="media">' + imgTag(img.src, img.alt, img.fallback) + extra + '</div>';
}

function metaLine(item){
  return '<div class="meta byline">' +
    (item.byline ? '<b>' + esc(item.byline) + '</b> · ' : '') +
    esc(sectionName(item.section)) + ' · ' + esc(relative(item.published)) +
    '<span class="view-count" data-id="' + esc(item.id) + '"></span>' +
  '</div>';
}

function leadCard(item){
  return '<a class="lead" href="' + pathFor('item', item.id) + '">' +
    mediaBlock(item) +
    '<div class="lead-body">' +
      (item.kicker ? '<span class="kicker">' + esc(item.kicker) + '</span>' : '') +
      '<h2 class="h-xl">' + esc(item.headline) + '</h2>' +
      (item.standfirst ? '<p class="standfirst">' + esc(item.standfirst) + '</p>' : '') +
      '<div style="margin-top:16px">' + metaLine(item) + '</div>' +
    '</div>' +
  '</a>';
}

function card(item, size){
  const h = size === 'large' ? 'h-lg' : (size === 'small' ? 'h-sm' : 'h-md');
  return '<a class="card' + (item.type === 'video' ? ' video' : '') + '" href="' + pathFor('item', item.id) + '">' +
    mediaBlock(item) +
    (item.kicker ? '<span class="kicker">' + esc(item.kicker) + '</span>' : '') +
    '<h3 class="' + h + '">' + esc(item.headline) + '</h3>' +
    (size !== 'small' && item.standfirst ? '<p class="dek">' + esc(item.standfirst) + '</p>' : '') +
    metaLine(item) +
  '</a>';
}

function latestRail(items){
  const rows = items.slice(0, 9).map(function(it){
    return '<li><a href="' + pathFor('item', it.id) + '">' +
      '<span class="time"><span class="d">' + esc(shortDate(it.published)) + '</span>' +
        '<span class="t">' + esc(timeOf(it.published)) + '</span></span>' +
      '<span class="lt">' + esc(it.headline) +
        '<span class="sec">' + esc(sectionName(it.section)) + (it.type === 'video' ? ' · Video' : '') + '</span>' +
      '</span></a></li>';
  }).join('');
  return '<aside class="latest" aria-label="Latest updates"><h2>Latest</h2><ol>' + rows + '</ol></aside>';
}

function sectionHead(title, count, opts){
  opts = opts || {};
  return '<div class="section-head' + (opts.accent ? ' accent' : '') + '">' +
    '<h2>' + esc(title) + '</h2>' +
    (count ? '<span class="count">' + esc(count) + '</span>' : '') +
    (opts.link ? '<a class="more-link" href="' + opts.link + '">' + esc(opts.linkText || 'See all') + ' &rarr;</a>' : '') +
  '</div>';
}

function archiveRow(item, flagFrontPage){
  return '<li><a href="' + pathFor('item', item.id) + '">' +
    '<span class="adate">' + esc(shortDate(item.published)) + '</span>' +
    '<span class="at">' + esc(item.headline) +
      (item.standfirst ? ' <span class="adek">' + esc(item.standfirst) + '</span>' : '') +
    '</span>' +
    '<span class="asec">' +
      (flagFrontPage ? 'Front page · ' : '') +
      esc(sectionName(item.section)) + (item.type === 'video' ? ' · Video' : '') +
    '</span>' +
  '</a></li>';
}

function groupByMonth(items, frontSet){
  const groups = new Map();
  items.forEach(function(i){
    const k = monthKey(i.published);
    if(!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  });
  return Array.from(groups.entries()).map(function(entry){
    return '<h2 class="month-head">' + esc(monthLabel(entry[0])) + '</h2>' +
      '<ul class="archive-list">' +
        entry[1].map(i => archiveRow(i, frontSet && frontSet.has(i.id))).join('') +
      '</ul>';
  }).join('');
}

function emptyState(title, body){
  return '<div class="empty"><h2>' + title + '</h2>' + body + '</div>';
}

/* ------------------------------------------------------------
   8. PAGES
   ------------------------------------------------------------ */

function renderHome(){
  document.title = 'Fish News — With Chunce Whatney';

  if(!state.items.length){
    return emptyState('No stories loaded', '<p>The content index is empty. Add an article folder and list its id in ' +
      '<code>' + esc(withSlash(CONFIG.contentBase)) + 'index.json</code>.</p>');
  }

  const sets = frontPageSets();
  const articles = sets.articles;
  const videos = sets.videos;

  const lead = articles.find(i => i.rank === 'lead') || articles[0];
  const rest = articles.filter(i => i.id !== lead.id);
  const secondary = rest.slice(0, 2);
  const remainder = rest.slice(2);

  let html = '<div class="top-grid">' +
    '<div>' + leadCard(lead) +
      (secondary.length ? '<div class="sub-grid">' + secondary.map(i => card(i, 'large')).join('') + '</div>' : '') +
    '</div>' +
    latestRail(byNewest(state.items)) +
  '</div>';

  if(remainder.length){
    html += sectionHead('Also this week', remainder.length + ' stories') +
      '<div class="more-grid">' + remainder.map(i => card(i, 'small')).join('') + '</div>';
  }

  const ads = shuffledSponsoredItems();
  if(ads.length){
    html += sectionHead('Sponsored', '') +
      '<div class="ad-slot">' + ads.map(a => adCard(a.deal, a.section)).join('') + '</div>';
  }

  if(videos.length){
    html += sectionHead('Watch', videos.length + (videos.length === 1 ? ' film' : ' films'),
      { accent: true, link: pathFor('section', 'video'), linkText: 'All films' }) +
      '<div class="video-rail">' + videos.map(i => card(i)).join('') + '</div>';
  }

  const archived = archiveItems();
  if(archived.length){
    html += sectionHead('From the archive', archived.length + ' older stories',
      { link: pathFor('archive'), linkText: 'Search the archive' }) +
      '<ul class="archive-list">' + archived.slice(0, 5).map(i => archiveRow(i)).join('') + '</ul>';
  }

  return html;
}

function renderSection(id){
  const sec = SECTIONS.find(s => s.id === id);
  if(!sec) return renderNotFound();
  document.title = sec.name + ' — Fish News';

  const items = byNewest(state.items.filter(i => i.section === id));
  let html = '<div class="page-head"><h1>' + esc(sec.name) + '</h1>' +
    (sec.blurb ? '<p>' + esc(sec.blurb) + '</p>' : '') + '</div>';

  if(!items.length){
    return html + emptyState('Nothing filed under ' + esc(sec.name) + ' yet',
      '<p>Set <code>"section": "' + esc(id) + '"</code> in an article\u2019s JSON to file it here.</p>');
  }
  return html + '<div class="listing">' + items.map(i => card(i)).join('') + '</div>';
}

function renderTag(tag){
  const term = decodeURIComponent(tag || '');
  document.title = term + ' — Fish News';

  const items = byNewest(state.items.filter(i => (i.tags || []).some(t => t.toLowerCase() === term.toLowerCase())));
  let html = '<div class="page-head"><h1>' + esc(term) + '</h1>' +
    '<p>' + items.length + (items.length === 1 ? ' story' : ' stories') + ' tagged ' + esc(term) + '.</p></div>';

  if(!items.length){
    return html + emptyState('Nothing tagged ' + esc(term),
      '<p>Add it to the <code>tags</code> array in an article\u2019s JSON.</p>');
  }
  return html + '<div class="listing">' + items.map(i => card(i)).join('') + '</div>';
}

function renderTagsIndex(){
  document.title = 'Tags — Fish News';
  const tags = tagCounts();
  let html = '<div class="page-head"><h1>Tags</h1>' +
    '<p>Every tag Fish News has used, busiest first.</p></div>';

  if(!tags.length){
    return html + emptyState('No tags yet',
      '<p>Add entries to an article’s <code>tags</code> array to see them here.</p>');
  }

  html += '<ul class="tag-cloud">' + tags.map(function(t){
    return '<li><a class="tag" href="' + pathFor('tag', t.name) + '">' + esc(t.name) +
      '<span class="tag-count">' + t.count + '</span></a></li>';
  }).join('') + '</ul>';
  return html;
}

function renderArchive(params){
  document.title = 'Archive — Fish News';
  const q = (params.q || '').trim();
  const term = q.toLowerCase();
  const section = params.section || '';
  const front = frontPageIds();

  /* The archive lists every story on the site, newest first, until a
     search term or section filter is used to narrow it down. */
  let pool = byNewest(state.items);
  if(section) pool = pool.filter(i => i.section === section);
  if(term)    pool = pool.filter(i => matches(i, term));

  let html = '<div class="page-head"><h1>Archive</h1>' +
    '<p>Every story Fish News has ever run, newest first. Search or filter by section to narrow it down.</p>' +
    '<form class="archive-search" id="archiveSearch" role="search">' +
      '<input type="search" id="archiveQ" name="q" value="' + esc(q) + '" ' +
        'placeholder="Search headlines, reporters and tags" aria-label="Search the archive">' +
      '<select id="archiveSection" aria-label="Filter by section">' +
        '<option value="">All sections</option>' +
        SECTIONS.filter(s => s.id !== 'home' && s.id !== 'archive').map(s =>
          '<option value="' + s.id + '"' + (section === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') +
      '</select>' +
      '<button class="btn" type="submit">Search</button>' +
      (q || section ? '<a class="btn ghost" href="' + pathFor('archive') + '">Clear</a>' : '') +
    '</form>' +
  '</div>';

  html += '<div class="archive-bar"><span class="tally">' +
    pool.length + (pool.length === 1 ? ' result' : ' results') +
    (q ? ' for &ldquo;' + esc(q) + '&rdquo;' : '') + '</span></div>';

  if(!pool.length){
    return html + emptyState('Nothing found',
      '<p>Try a shorter search term, or clear the section filter.</p>');
  }

  return html + groupByMonth(pool, front);
}

async function renderItem(id){
  let item;
  try{
    item = await loadItem(id);
  }catch(err){
    return renderNotFound(err.message);
  }

  document.title = item.headline + ' — Fish News';
  const img = imageFor(item);

  let html = '<article class="article">' +
    '<a class="back" href="' + pathFor('section', item.section) + '">&larr; ' + esc(sectionName(item.section)) + '</a>' +
    (item.kicker ? '<span class="kicker">' + esc(item.kicker) + '</span>' : '') +
    '<h1 class="h-xl">' + esc(item.headline) + '</h1>' +
    (item.standfirst ? '<p class="standfirst">' + esc(item.standfirst) + '</p>' : '') +
    '<div class="article-meta">' +
      '<span class="byline">' + (item.byline ? '<b>' + esc(item.byline) + '</b>' : 'Fish News') + '</span>' +
      (item.location ? '<span class="byline">' + esc(item.location) + '</span>' : '') +
      '<span class="byline">' + esc(dateOf(item.published)) + ', ' + esc(timeOf(item.published)) + '</span>' +
      '<span class="byline" id="viewCount"></span>' +
    '</div>';

  if(item.type === 'video'){
    html += videoPlayer(item);
  }else{
    html += '<figure class="figure">' + imgTag(img.src, img.alt, img.fallback) +
      (img.alt || img.credit
        ? '<figcaption>' +
            (img.credit ? '<span class="credit">' + esc(img.credit) + '</span>' : '') +
            '<span>' + esc(img.alt) + '</span>' +
          '</figcaption>'
        : '') +
    '</figure>';
  }

  if(item.body && item.body.length){
    html += '<div class="body-copy">' + item.body.map(b => renderBlock(item, b)).join('') + '</div>';
  }

  if(item.tags && item.tags.length){
    html += '<div class="tag-row">' + item.tags.map(t =>
      '<a class="tag" href="' + pathFor('tag', t) + '">' + esc(t) + '</a>').join('') + '</div>';
  }
  html += '</article>';

  const related = byNewest(state.items.filter(i => i.section === item.section && i.id !== item.id)).slice(0, 4);
  if(related.length){
    html += sectionHead('More from ' + sectionName(item.section), '',
      { link: pathFor('section', item.section), linkText: 'All ' + sectionName(item.section) }) +
      '<div class="more-grid">' + related.map(i => card(i, 'small')).join('') + '</div>';
  }
  return html;
}

/* Counts this page load against the article's visit total (content/views.json,
   served through api/visit.php) and fills in #viewCount once it responds.
   Fails silently — a dev server with no PHP, or the endpoint being offline,
   should never break the article itself. */
function recordVisit(id){
  fetch('/api/visit.php?id=' + encodeURIComponent(id))
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if(!data || typeof data.views !== 'number') return;
      const el = $('#viewCount');
      if(el) el.textContent = data.views.toLocaleString() + (data.views === 1 ? ' view' : ' views');
    })
    .catch(() => {});
}

function viewLabel(n){
  return n.toLocaleString() + (n === 1 ? ' view' : ' views');
}

/* Fills in the view counts on every card/lead on the current page in one
   request, reading content/views.json directly rather than hitting
   api/visit.php per card (which would also increment them). Silently does
   nothing if the file can't be fetched. */
function hydrateViewCounts(){
  const spots = $$('.view-count[data-id]');
  if(!spots.length) return;
  fetch('/content/views.json')
    .then(r => r.ok ? r.json() : null)
    .then(counts => {
      if(!counts) return;
      spots.forEach(el => {
        const n = counts[el.dataset.id];
        if(typeof n === 'number' && n > 0) el.textContent = ' · ' + viewLabel(n);
      });
    })
    .catch(() => {});
}

/* Keeps the sponsored-ad grid to a single row: the CSS grid already works
   out how many cards fit the current width, so this just hides whatever
   spilled into a second row by comparing each card's offsetTop to the
   first one's. Re-run on resize so it grows back as space returns. */
function layoutSponsoredRow(){
  const cards = $$('.ad-card');
  if(!cards.length) return;
  const top = cards[0].offsetTop;
  cards.forEach(c => { c.hidden = c.offsetTop !== top; });
}

function renderBlock(item, b){
  const type = b.type || (b.text ? 'paragraph' : '');
  switch(type){
    case 'paragraph':
      return '<p>' + inline(b.text) + '</p>';
    case 'heading':
      return '<h3>' + esc(b.text) + '</h3>';
    case 'quote':
      return '<blockquote class="pullquote">&ldquo;' + esc(b.text) + '&rdquo;' +
        (b.attribution ? '<cite>' + esc(b.attribution) + '</cite>' : '') + '</blockquote>';
    case 'list':
      return '<ul>' + (b.items || []).map(li => '<li>' + inline(li) + '</li>').join('') + '</ul>';
    case 'image': {
      const src = resolveAsset(item, b.src);
      const fb = coverArt(item.id + (b.src || ''), false);
      return '<figure class="figure">' + imgTag(src, b.alt || '', fb) +
        (b.alt || b.credit
          ? '<figcaption>' +
              (b.credit ? '<span class="credit">' + esc(b.credit) + '</span>' : '') +
              '<span>' + esc(b.alt || '') + '</span>' +
            '</figcaption>'
          : '') + '</figure>';
    }
    default:
      return '';
  }
}

/* Minimal inline formatting inside body text: **bold**, *italic*, [text](url). */
function inline(text){
  return esc(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

function videoPlayer(item){
  const v = item.video || {};
  const embed = embedUrl(v);
  if(embed){
    return '<div class="player"><iframe src="' + esc(embed) + '" title="' + esc(item.headline) +
      '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>';
  }
  if(v.provider === 'file' && v.url){
    const src = resolveAsset(item, v.url);
    const poster = v.poster ? resolveAsset(item, v.poster) : '';
    return '<div class="player"><video controls preload="metadata"' +
      (poster ? ' poster="' + esc(poster) + '"' : '') + '><source src="' + esc(src) + '"></video></div>';
  }
  const poster = v.poster ? resolveAsset(item, v.poster) : coverArt(item.id, true);
  return '<div class="player"><div class="player-fallback">' +
    '<img src="' + esc(poster) + '" alt="">' +
    '<div class="inner">' +
      '<span class="kicker on-dark">Video' + (v.duration ? ' · ' + esc(v.duration) : '') + '</span>' +
      (v.url
        ? '<a class="btn" href="' + esc(v.url) + '" target="_blank" rel="noopener">Watch the film</a>'
        : '<p style="color:#fff;margin:0">No video URL set on this item.</p>') +
    '</div>' +
  '</div></div>';
}

function dealCard(deal){
  const fallback = coverArt(deal.title, false);
  const src = deal.image ? (isAbsolute(deal.image) ? deal.image : '/assets/sponsors/' + deal.image) : fallback;
  return '<a class="card deal-card" href="' + esc(deal.url) + '" target="_blank" rel="noopener sponsored">' +
    '<div class="media">' + imgTag(src, deal.title, fallback) + '</div>' +
    '<h3 class="h-md">' + esc(deal.title) + '</h3>' +
    (deal.description ? '<p class="dek">' + esc(deal.description) + '</p>' : '') +
  '</a>';
}

/* A single sponsored deal, presented on the front page as an "ad" card —
   same shape as a deal-page card, plus a "Sponsored" label up top and the
   sponsor's own logo along the bottom so it's never mistaken for a story. */
function adCard(deal, section){
  const fallback = coverArt(deal.title, false);
  const src = deal.image ? (isAbsolute(deal.image) ? deal.image : '/assets/sponsors/' + deal.image) : fallback;
  const logo = section && section.logo
    ? '<div class="ad-sponsor-foot">' +
        imgTag(isAbsolute(section.logo) ? section.logo : '/assets/sponsors/' + section.logo,
          section.name || '', coverArt(section.name || 'sponsor', false)) +
      '</div>'
    : '';
  return '<a class="card ad-card" href="' + esc(deal.url) + '" target="_blank" rel="noopener sponsored">' +
    '<span class="kicker ad-kicker">Sponsored</span>' +
    '<div class="media">' + imgTag(src, deal.title, fallback) + '</div>' +
    '<h3 class="h-md">' + esc(deal.title) + '</h3>' +
    (deal.description ? '<p class="dek">' + esc(deal.description) + '</p>' : '') +
    logo +
  '</a>';
}

/* Centred logo (or plain text) heading for one deal section. Falls back to
   a text heading when the section has no logo, and to a bare span (rather
   than a link) when it has no url — so every field beyond name is optional. */
function dealSectionHead(section){
  const inner = section.logo
    ? '<img src="' + esc(isAbsolute(section.logo) ? section.logo : '/assets/sponsors/' + section.logo) + '" alt="' + esc(section.name || '') + '">'
    : '<span class="deal-section-name">' + esc(section.name || '') + '</span>';
  return '<div class="deal-section-head">' +
    (section.url ? '<a href="' + esc(section.url) + '" target="_blank" rel="noopener sponsored">' + inner + '</a>' : inner) +
  '</div>';
}

async function renderSponsoredDeals(){
  document.title = 'Sponsored Deals — Fish News';
  let html = '<div class="page-head"><h1>Sponsored Deals</h1>' +
    '<p>Offers and links from the people who keep the lights on at Fish News.</p></div>';

  let all;
  try{
    all = await loadSponsoredDeals();
  }catch(err){
    return html + emptyState('Could not load the deals',
      '<p>Nothing came back from <code>' + esc(CONFIG.sponsoredDealsUrl) + '</code>.</p>' +
      '<p><code>' + esc(err.message) + '</code></p>');
  }

  const sections = (all || []).filter(s => s.deals && s.deals.length);
  if(!sections.length){
    return html + emptyState('No deals right now', '<p>Check back later.</p>');
  }

  return html + sections.map(function(s){
    return '<div class="deal-section">' +
      (s.section ? dealSectionHead(s.section) : '') +
      '<div class="listing deal-grid">' + s.deals.map(dealCard).join('') + '</div>' +
    '</div>';
  }).join('');
}

function renderStatic(kind){
  if(kind === 'about'){
    document.title = 'About us — Fish News';
    return '<div class="page-head"><h1>About us</h1>' +
      '<p>Fish News reports on the sea and other shit we think is important.</p></div>' +
      '<div class="article" style="padding-top:0"><div class="body-copy">' +
      '<p>We report on Chunce\'s continued war crimes trials.</p>' +
      '<h3>Corrections</h3><p>We are never wrong.</p>' +
      '<h3>Funding</h3><p>You think we get paid for this?</p>' +
        '<h3>Ownership</h3><p>Part of <a href="https://www.roblox.com/communities/33115459/tacteam">tacteam</a></p>' +
        '<p>Alongside <a href="https://www.roblox.com/communities/15152355/slimestore">slimestore</a> and slimeshop our clothing and sportswear brands</p>' +
        '<p>And <a href="https://www.roblox.com/communities/7156667/RhymeyStudios">RhymeyStudios</a> Our milsim development group</p>' +
      '</div></div>';
  }
  document.title = 'Contact — Fish News';
  return '<div class="page-head"><h1>Contact</h1>' +
    '<p>Tips, corrections and complaints all go to the same inbox and get read by a person.</p></div>' +
    '<div class="article" style="padding-top:0"><div class="body-copy">' +
    '<p><strong>Newsdesk</strong><br>Do not contact us</p>' +
    '<p><strong>Post</strong><br>Fish News Ltd, Milky Way</p>' +
    '<h3>Sending something sensitive</h3><p>See above</p>' +
    '</div></div>';
}

function renderNotFound(detail){
  document.title = 'Not found — Fish News';
  return '<div style="padding-top:40px">' + emptyState('That page is not here',
    '<p>The story may have been removed from the index, or the link may be wrong.</p>' +
    (detail ? '<p><code>' + esc(detail) + '</code></p>' : '') +
    '<p><a class="btn" href="/">Back to the front page</a></p>') + '</div>';
}

function renderLoadError(){
  document.title = 'Fish News';
  return '<div style="padding-top:40px">' + emptyState('Could not load any content',
    '<p>Nothing came back from <code>' + esc(withSlash(CONFIG.contentBase)) + '</code> ' +
    'in <code>' + esc(CONFIG.discovery) + '</code> mode.</p>' +
    '<p><code>' + esc(state.error || '') + '</code></p>' +
    '<p>If you opened this file straight off the disk, the browser blocks those requests. ' +
    'Serve the folder over HTTP instead — <code>python3 -m http.server</code> or ' +
    '<code>jwebserver</code> from the site directory, then open the address it prints.</p>' +
    '<p>If the server is running, it may have directory listing switched off. ' +
    'Turn it on for the content folder, or set <code>discovery: \'index\'</code> ' +
    'and keep <code>index.json</code> up to date.</p>') + '</div>';
}

/* ------------------------------------------------------------
   9. CHROME: NAV
   ------------------------------------------------------------ */

function buildNav(active){
  $('#navInner').innerHTML = SECTIONS.map(function(s){
    const href = s.id === 'home' ? '/' : (s.id === 'archive' ? pathFor('archive') :
      (s.id === 'tags' ? pathFor('tags') : pathFor('section', s.id)));
    return '<a href="' + href + '"' + (s.id === active ? ' aria-current="page"' : '') + '>' + esc(s.name) + '</a>';
  }).join('');
}

function buildSponsors(){
  const wrap = $('#sponsors');
  if(!wrap || !SPONSORS.length){ if(wrap) wrap.hidden = true; return; }
  wrap.hidden = false;
  $('#sponsorsRow').innerHTML = SPONSORS.map(function(s){
    const src = isAbsolute(s.logo) ? s.logo : '/assets/sponsors/' + s.logo;
    const img = '<img src="' + esc(src) + '" alt="' + esc(s.name) + '" loading="lazy">';
    return s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener sponsored">' + img + '</a>' : img;
  }).join('');
}

/* ------------------------------------------------------------
   10. ROUTER
   ------------------------------------------------------------ */

/* Every page has a real path — / for home, /section/news/, /archive/,
   /tag/<name>/, /story/<id>/, /about/, /contact/ — rather than a hash, so
   every one of them is a URL a crawler or a hard reload can actually fetch.
   The server has an .htaccess fallback that serves index.html for any path
   that isn't a real file, so this is the only place that needs to know the
   route shape; navigation happens via history.pushState (see wireNav()),
   with a real link as the fallback for anything that isn't intercepted. */
function parsePath(){
  const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const params = {};
  const query = location.search.replace(/^\?/, '');
  if(query){
    query.split('&').forEach(function(pair){
      const [k, v] = pair.split('=');
      params[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' '));
    });
  }
  if(parts[0] === 'story' && parts[1]) return { parts: ['item', parts[1]], params: params };
  return { parts: parts, params: params };
}

/* Turns an internal route into the path used to link to it. Kept in sync
   with parsePath()'s route shape above. */
function pathFor(){
  const args = Array.prototype.slice.call(arguments);
  if(args[0] === 'item') return '/story/' + encodeURIComponent(args[1]) + '/';
  if(args[0] === 'section') return '/section/' + encodeURIComponent(args[1]) + '/';
  if(args[0] === 'tag') return '/tag/' + encodeURIComponent(args[1]) + '/';
  if(args[0] === 'archive') return '/archive/' + (args[1] ? '?' + args[1] : '');
  if(args[0] === 'tags') return '/tags/';
  if(args[0] === 'sponsored-deals') return '/sponsored-deals/';
  if(args[0] === 'about' || args[0] === 'contact') return '/' + args[0] + '/';
  return '/';
}

/* Navigates to an internal path via the History API and re-renders, so
   in-app clicks never trigger a full page reload. Falls back to a normal
   navigation for anything that isn't a plain left-click on a same-origin
   link (a new tab, a modified click, an external site, a same-page
   fragment like the skip link, and — importantly — the browser's own back
   and forward buttons, which go through popstate instead). */
function go(url){
  history.pushState(null, '', url);
  route();
}

function wireNav(){
  document.addEventListener('click', function(e){
    if(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if(!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if(!href || href.charAt(0) === '#' || a.origin !== location.origin) return;
    e.preventDefault();
    go(a.href);
  });
  window.addEventListener('popstate', route);

  let resizeTimer = null;
  window.addEventListener('resize', function(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layoutSponsoredRow, 120);
  });

  /* The top-bar search lives outside #view (it's part of the permanent
     chrome, not re-rendered per route), so it's wired once here rather
     than in wirePage(). It always sends to the archive, which does the
     actual filtering. */
  const topSearch = $('#topSearch');
  if(topSearch){
    topSearch.addEventListener('submit', function(e){
      e.preventDefault();
      const q = $('#topSearchQ').value.trim();
      go(pathFor('archive', q ? 'q=' + encodeURIComponent(q) : ''));
    });
  }
}

async function route(){
  const { parts, params } = parsePath();
  const view = $('#view');

  if(state.error){
    view.innerHTML = renderLoadError();
    buildNav('');
    return;
  }

  let html = '';
  let active = 'home';

  if(!parts.length){
    html = renderHome();
  }else if(parts[0] === 'section'){
    active = parts[1];
    html = parts[1] === 'home' ? renderHome() : renderSection(parts[1]);
  }else if(parts[0] === 'tag'){
    active = '';
    html = renderTag(parts[1]);
  }else if(parts[0] === 'tags'){
    active = 'tags';
    html = renderTagsIndex();
  }else if(parts[0] === 'archive'){
    active = 'archive';
    html = renderArchive(params);
  }else if(parts[0] === 'item'){
    view.innerHTML = '<div class="loading">Loading</div>';
    html = await renderItem(parts[1]);
    const meta = state.items.find(i => i.id === parts[1]);
    if(meta) active = meta.section;
    recordVisit(parts[1]);
  }else if(parts[0] === 'sponsored-deals'){
    active = '';
    view.innerHTML = '<div class="loading">Loading</div>';
    html = await renderSponsoredDeals();
  }else if(parts[0] === 'about' || parts[0] === 'contact'){
    active = '';
    html = renderStatic(parts[0]);
  }else{
    html = renderNotFound();
  }

  view.innerHTML = html;
  buildNav(active);
  wirePage();
  hydrateViewCounts();
  layoutSponsoredRow();
  window.scrollTo({ top: 0, behavior: 'auto' });

  const topSearchQ = $('#topSearchQ');
  if(topSearchQ) topSearchQ.value = parts[0] === 'archive' ? (params.q || '') : '';
}

function wirePage(){
  const form = $('#archiveSearch');
  if(form){
    form.addEventListener('submit', function(e){
      e.preventDefault();
      const q = $('#archiveQ').value.trim();
      const s = $('#archiveSection').value;
      const parts = [];
      if(q) parts.push('q=' + encodeURIComponent(q));
      if(s) parts.push('section=' + encodeURIComponent(s));
      go(pathFor('archive', parts.join('&')));
    });
    $('#archiveSection').addEventListener('change', function(){
      form.dispatchEvent(new Event('submit'));
    });
  }
}

/* ------------------------------------------------------------
   11. BOOT
   ------------------------------------------------------------ */

(async function init(){
  $('#mastDate').textContent = new Date().toLocaleDateString('en-GB',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  //$('#mastEdition').textContent = CONFIG.edition;

  $('#view').innerHTML = '<div class="loading">Loading Fish News</div>';

  await Promise.all([
    loadContent(),
    loadSponsoredDeals().catch(err => console.warn('Sponsored deals unavailable: ' + err.message))
  ]);
  state.ready = true;
  buildSponsors();

  wireNav();
  route();
})();
