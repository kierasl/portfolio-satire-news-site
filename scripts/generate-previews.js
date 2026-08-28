#!/usr/bin/env node
/* ============================================================
   FISH NEWS — LINK PREVIEW GENERATOR
   ============================================================
   The site itself uses hash routing (#/item/<id>), which crawlers
   for Slack/Discord/iMessage/etc. cannot see — they only ever get
   the same index.html with the same Open Graph tags, whatever the
   hash says.

   This script writes a small static stub page per article at
   story/<id>/index.html, carrying that article's own headline,
   standfirst and image as Open Graph tags, then redirects a human
   visitor straight into the app at #/item/<id>.

   Share the /story/<id>/ link instead of the #/item/<id> one and
   the preview will pull from that article.

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

function pageFor(id, article){
  const headline = article.headline || 'Fish News';
  const desc = article.standfirst || article.kicker || 'Fish News: with Chunce Whatney.';
  const image = resolveImage(id, article);
  const canonical = SITE_URL + '/story/' + encodeURIComponent(id) + '/';
  const appUrl = SITE_URL + '/#/item/' + encodeURIComponent(id);

  return '<!DOCTYPE html>\n' +
'<html lang="en-GB">\n' +
'<head>\n' +
'<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<title>' + esc(headline) + ' — Fish News</title>\n' +
'<meta name="description" content="' + esc(desc) + '">\n' +
'<link rel="canonical" href="' + esc(canonical) + '">\n' +
'<meta property="og:site_name" content="Fish News">\n' +
'<meta property="og:type" content="article">\n' +
'<meta property="og:title" content="' + esc(headline) + '">\n' +
'<meta property="og:description" content="' + esc(desc) + '">\n' +
'<meta property="og:image" content="' + esc(image) + '">\n' +
'<meta property="og:url" content="' + esc(canonical) + '">\n' +
'<meta name="twitter:card" content="summary_large_image">\n' +
'<meta http-equiv="refresh" content="0; url=' + esc(appUrl) + '">\n' +
'<script>location.replace(' + JSON.stringify(appUrl) + ');</script>\n' +
'</head>\n' +
'<body>\n' +
'<p>Loading <a href="' + esc(appUrl) + '">' + esc(headline) + '</a> on Fish News&hellip;</p>\n' +
'</body>\n' +
'</html>\n';
}

function main(){
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
    const dir = path.join(OUT_DIR, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), pageFor(id, article));
    count++;
  }

  console.log('Generated ' + count + ' preview page(s) in ' + path.relative(ROOT, OUT_DIR) + '/ for ' + SITE_URL);
}

main();
