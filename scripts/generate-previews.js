#!/usr/bin/env node
/* ============================================================
   FISH NEWS — STORY PERMALINK GENERATOR
   ============================================================
   The site is a client-rendered SPA, so a hash link like
   #/item/<id> never shows a crawler (Discord, Slack, iMessage…)
   anything but the homepage — the hash never reaches the server,
   and crawlers don't run the JavaScript that would read it.

   This script solves that by writing a real static page per
   article at story/<id>/index.html: an exact copy of the site
   shell with that article's own <title> and Open Graph tags
   swapped in between the FISHNEWS:META markers in index.html.
   A crawler sees the right preview immediately; a browser loads
   the same app, which recognises the /story/<id>/ path (see
   parseHash() in assets/fish-news.js) and renders that article
   directly — no redirect involved.

   Run: node scripts/generate-previews.js
   Optional: SITE_URL=https://example.com node scripts/generate-previews.js
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const OUT_DIR = path.join(ROOT, 'story');
const SITE_URL = (process.env.SITE_URL || 'https://fish-news.tacteam.dev/').replace(/\/$/, '');
const FALLBACK_IMAGE = SITE_URL + '/assets/Fish%20News%20Logo.png';

const META_START = '<!-- FISHNEWS:META:START -->';
const META_END = '<!-- FISHNEWS:META:END -->';

function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isAbsolute(src){
  return /^(https?:)?\/\//i.test(src) || src.charAt(0) === '/';
}

function resolveImage(id, article){
  const img = article.image || {};
  if(!img.src) return FALLBACK_IMAGE;
  if(isAbsolute(img.src)) return img.src;
  return SITE_URL + '/content/' + encodeURIComponent(id) + '/' + img.src;
}

function findArticleIds(){
  return fs.readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(id => fs.existsSync(path.join(CONTENT_DIR, id, 'article.json')));
}

function metaBlockFor(id, article){
  const headline = article.headline || 'Fish News';
  const desc = article.standfirst || article.kicker || 'Fish News: with Chunce Whatney.';
  const image = resolveImage(id, article);
  const canonical = SITE_URL + '/story/' + encodeURIComponent(id) + '/';

  return META_START + '\n' +
'<meta name="description" content="' + esc(desc) + '">\n' +
'<link rel="canonical" href="' + esc(canonical) + '">\n' +
'<meta property="og:site_name" content="Fish News">\n' +
'<meta property="og:title" content="' + esc(headline) + '">\n' +
'<meta property="og:description" content="' + esc(desc) + '">\n' +
'<meta property="og:type" content="article">\n' +
'<meta property="og:url" content="' + esc(canonical) + '">\n' +
'<meta property="og:image" content="' + esc(image) + '">\n' +
'<meta name="twitter:card" content="summary_large_image">\n' +
META_END;
}

function main(){
  const template = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const markerRe = new RegExp(META_START + '[\\s\\S]*?' + META_END);
  if(!markerRe.test(template)){
    throw new Error('index.html is missing the ' + META_START + ' / ' + META_END + ' markers');
  }

  const ids = findArticleIds();

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let count = 0;
  for(const id of ids){
    let article;
    try{
      article = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, id, 'article.json'), 'utf8'));
    }catch(err){
      console.warn('Skipping ' + id + ': ' + err.message);
      continue;
    }

    const headline = article.headline || 'Fish News';
    const page = template
      .replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(headline) + ' — Fish News</title>')
      .replace(markerRe, metaBlockFor(id, article));

    const dir = path.join(OUT_DIR, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), page);
    count++;
  }

  console.log('Generated ' + count + ' story permalink page(s) in ' + path.relative(ROOT, OUT_DIR) + '/ for ' + SITE_URL);
}

main();
