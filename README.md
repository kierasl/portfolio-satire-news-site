# Fish News

A static news site. Three files of code, one folder of content. No framework, no build step for the site itself.

```
fish-news/
├── index.html                     the shell — masthead, nav, footer
├── .htaccess                      SPA fallback so real URLs survive a hard reload (Apache)
├── api/
│   └── visit.php                  increments and returns an article's view count
├── assets/
│   ├── fish-news.css              all styling
│   └── fish-news.js               loading, routing and rendering
├── content/
│   ├── index.json                 the list of everything published
│   ├── views.json                 view counts per article id, written by api/visit.php
│   ├── bluefin-donegal-inshore/
│   │   ├── article.json           the story
│   │   └── (images live here)
│   └── … one folder per item
└── images/                        shared images used by more than one story
```

---

## Running it

The site loads content with `fetch`, which browsers block when a page is opened
straight off the disk. Serve the folder over HTTP:

```bash
cd fish-news
python3 -m http.server 8000      # or: jwebserver -p 8000   (JDK 18+)
```

Then open `http://localhost:8000`. Every page — home, a section, the archive,
a tag, an article — is a real path rather than a `#hash` (see **URLs and
routing** below), and in-app navigation (clicking around the site) works
fine under a plain dev server. A hard reload or a direct link to anything
other than `/` won't, though: a plain static server has no way to know that
`/section/news/` should serve `index.html`, and 404s. That's what
`.htaccess` fixes once the site is deployed to Apache — see below.

For deployment, an Apache host (the `.htaccess` at the repo root needs
`mod_rewrite`, on by default on Dreamhost) is what this is built for. A host
that doesn't read `.htaccess` — GitHub Pages, S3, Netlify — needs its own
equivalent SPA-fallback rule (Netlify: a `_redirects` file; GitHub Pages: a
`404.html` that's a copy of `index.html`) or only `/` and the pre-generated
`/story/<id>/` pages will survive a hard reload.

---

## Publishing a story

Create `content/<id>/article.json`, where `<id>` is a URL-safe slug. That is it
— the site finds it on the next page load.

### How it finds it

A browser cannot list a directory on its own. It can only request paths it
already knows about, so something has to tell it what exists. There are three
ways to do that, set by `CONFIG.discovery` in `assets/fish-news.js`:

| Mode | How it finds stories | Requests per page load |
|---|---|---|
| `auto` *(default)* | Lists the content folder, falls back to `index.json` | 1 + one per story |
| `directory` | Lists the content folder, and fails if it cannot | 1 + one per story |
| `github` | Lists the folder through the GitHub API | 1 + one per story |
| `index` | Reads `content/index.json` | 1 |

**`directory`** asks the server for `content/` itself and reads the folder
names out of whatever it sends back. It handles nginx's JSON autoindex and the
HTML listings produced by Apache, `python3 -m http.server` and most others.
Nothing to maintain — drop a folder in and it appears.

The catch is that directory listing has to be switched on. It is off by
default on nginx, and unavailable entirely on GitHub Pages, S3 static hosting
and Netlify. For nginx:

```nginx
location /content/ {
    autoindex on;
    autoindex_format json;
}
```

**`github`** works around that by listing the folder through the GitHub API
instead, which works from any host. Set:

```js
discovery: 'github',
github: { owner: 'you', repo: 'fish-news-content', branch: 'main', path: 'content' }
```

Unauthenticated API calls are capped at 60 an hour per visitor IP. That is one
page load each, so it suits an internal or low-traffic site and will fall over
on a busy one. The article files themselves come from `raw.githubusercontent.com`,
which is not rate limited — only the listing call is.

**`index`** is the one that scales. The reason is not the listing, it is what
comes after it: without a manifest the site has to open *every* article to
learn its headline and date before it can draw the front page. Fifteen stories
is fifteen requests and nobody notices. Three hundred stories is three hundred
requests on every single page load, and the site becomes unusable long before
you get there.

`index.json` holds that metadata in one file, so a page load is one request no
matter how much you have published. Use it once the site is past roughly a
hundred stories, and have the authoring tool regenerate it on every save so it
is never edited by hand.

`auto` tries the listing first and quietly falls back to `index.json` if the
server will not cooperate, which means the same files work locally under
`python3 -m http.server` and deployed behind a host that has listing disabled.

### The index format

Only needed in `index` mode, or as the fallback under `auto`.

```json
{
  "generated": "2026-08-04T10:00:00Z",
  "items": [
    {
      "id": "bluefin-donegal-inshore",
      "type": "article",
      "section": "open-ocean",
      "headline": "Bluefin tuna are feeding within sight of the Donegal coast",
      "standfirst": "A cold upwelling has pushed baitfish inshore.",
      "kicker": "Cold water surge",
      "byline": "Ríona Casey",
      "published": "2026-08-03T09:14:00Z",
      "tags": ["bluefin", "upwelling"],
      "rank": "lead",
      "image": { "src": "", "alt": "Boats at Killybegs", "credit": "Fish News" }
    }
  ]
}
```

An entry may also be a bare id string:

```json
{ "items": ["bluefin-donegal-inshore", "sussex-kelp-fifth-winter"] }
```

The site will then open each `article.json` to read its metadata. That is fine
for a handful of stories and slow for hundreds, so prefer full entries once the
site grows.

Items missing from the index do not appear anywhere, which makes the index a
usable publish switch: drop an entry to unpublish without deleting anything.

### An article

```json
{
  "id": "bluefin-donegal-inshore",
  "type": "article",
  "section": "open-ocean",
  "rank": "lead",
  "kicker": "Cold water surge",
  "headline": "Bluefin tuna are feeding within sight of the Donegal coast",
  "standfirst": "A cold upwelling has pushed baitfish inshore.",
  "byline": "Ríona Casey",
  "location": "Killybegs",
  "published": "2026-08-03T09:14:00Z",
  "tags": ["bluefin", "upwelling", "fisheries"],
  "assetBase": "",
  "image": { "src": "harbour.jpg", "alt": "Boats at Killybegs", "credit": "Fish News" },
  "body": [
    { "type": "paragraph", "text": "Skippers working out of Killybegs…" },
    { "type": "heading",   "text": "What the survey boats are seeing" },
    { "type": "quote",     "text": "We have modelled this happening.", "attribution": "Dr Maeve Ó Loingsigh" },
    { "type": "list",      "items": ["Released alive where possible", "Logged within 24 hours"] },
    { "type": "image",     "src": "chart.png", "alt": "Temperature profile", "credit": "Marine Institute" }
  ]
}
```

**Fields**

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Matches the folder name and appears in the URL |
| `type` | yes | `article` or `video` |
| `section` | yes | One of `reef`, `open-ocean`, `coast`, `policy`, `science`, `video` |
| `headline` | yes | |
| `published` | yes | ISO 8601. Drives ordering, the archive and the front-page cut |
| `standfirst` | no | One sentence, shown on cards and under the headline |
| `kicker` | no | Small magenta label above the headline |
| `byline`, `location` | no | |
| `rank` | no | `lead` pins a story to the top of the front page |
| `tags` | no | Array of strings. Each becomes a clickable tag page |
| `image` | no | Omit or leave `src` blank for generated brand artwork |
| `assetBase` | no | Per-article asset location, see below |
| `body` | no | Array of blocks |

**Body blocks:** `paragraph`, `heading`, `quote` (with optional `attribution`),
`list` (with `items`), `image` (with `src`, `alt`, `credit`).

Inside `paragraph` and `list` text you can use `**bold**`, `*italic*` and
`[link text](https://example.com)`. Nothing else is parsed.

### A video

Same shape, with `"type": "video"`, `"section": "video"` and a `video` object:

```json
"video": {
  "provider": "youtube",
  "url": "https://www.youtube.com/watch?v=XXXXXXXXXXX",
  "duration": "8:42",
  "poster": "poster.jpg"
}
```

`provider` is one of:

- `youtube` / `vimeo` — embeds an inline player
- `file` — plays a video file directly, with `url` pointing at an `.mp4`
- `link` — shows the poster and a **Watch the film** button linking out

`duration` is display only and appears on the thumbnail.

---

## Where images come from

Any `src` — the lead image, body images, video posters, video files — is
resolved with one rule:

- **Absolute** (`https://…`, `//…`, or starting with `/`) → used exactly as written.
- **Anything else** → treated as a filename inside that article's asset folder.

The asset folder is worked out in this order:

1. The article's own `assetBase`, if set.
2. `CONFIG.assetBase` in `assets/fish-news.js`, if set.
3. Otherwise `content/<id>/` — the article's own folder.

So all three of these work, and they can be mixed freely across the site:

```json
"image": { "src": "harbour.jpg" }
```
Local, sitting next to the `article.json`. This is the default and the simplest.

```json
"assetBase": "https://raw.githubusercontent.com/USER/REPO/main/photos/2026-08/",
"image": { "src": "harbour.jpg" }
```
That one article pulls its images from a GitHub repo.

```json
"image": { "src": "https://cdn.example.com/harbour.jpg" }
```
One image from anywhere, everything else local.

### Serving everything from a CDN

To keep images and video off the web server entirely, set one value in
`assets/fish-news.js`:

```js
assetBase: 'https://cdn.example.com/fish-news/'
```

Every `src` in every article that is not already absolute then resolves against
that, so `"src": "harbour.jpg"` becomes
`https://cdn.example.com/fish-news/harbour.jpg`.

Note that this flattens the per-article folders — `assetBase` replaces the
`content/<id>/` part rather than sitting in front of it, so two stories cannot
both have a `harbour.jpg`. Either give files unique names when you upload
them, or keep the folder structure on the CDN and write the path into the src:

```json
"image": { "src": "bluefin-donegal-inshore/harbour.jpg" }
```

The second is worth the small amount of extra typing. It keeps a story's assets
identifiable months later, and it means you can drop `assetBase` and move
everything back onto the server without touching any article.

Video files work the same way. With `"provider": "file"`, a `url` of
`"clips/herring-run.mp4"` resolves against the CDN like any other asset, while
an absolute URL bypasses it. So the JSON does not need to know or care whether
a given file is on the CDN, in the repo or on the origin server.

If an image fails to load — wrong path, repo offline, file not committed — the
site quietly substitutes generated wave artwork derived from the article id.
You will never see a broken image icon, so do check your paths.

---

## Front page and archive

Set in `CONFIG` at the top of `assets/fish-news.js`:

```js
frontPage: { articles: 6, videos: 3 }
```

The front page shows the **6 most recent articles** and the **3 most recent
videos**. The newest article leads unless one carries `"rank": "lead"`.

Everything older drops into the archive automatically. There is no separate
archiving step and no flag to set — it is purely a function of `published`
dates and those two numbers. Raise them and stories come back to the front.

**The archive page** lists what has come off the front, grouped by month, with:

- a search box covering headlines, standfirsts, reporters, kickers and tags
- a section filter

With a search term active, the archive searches the *whole* site rather than
just the archived items, and marks anything still on the front page. That
avoids the trap of searching for a story you read this morning and being told
it does not exist.

Section pages always show everything in that section, front page or not.

**Tags** don't have a nav rail — they exist only as the chips at the bottom of
an article, generated from its `tags` array, each linking to a page
(`/tag/<name>/`) of everything else carrying it.

---

## URLs and routing

Every page has a real path, not a `#hash`:

| Page | URL |
|---|---|
| Home | `/` |
| A section | `/section/<id>/` — e.g. `/section/news/` |
| The archive | `/archive/`, optionally `?q=<search>&section=<id>` |
| A tag | `/tag/<name>/` |
| An article | `/story/<id>/` |
| About / Contact | `/about/`, `/contact/` |

The site is still a client-rendered SPA — one `index.html`, one script — so
none of these exist as real files on the server except `/` and (see below)
`/story/<id>/`. `assets/fish-news.js` reads `location.pathname` to decide
what to render (`parsePath()`), builds every internal link with `pathFor()`,
and intercepts clicks on same-origin links to navigate via `history.pushState`
instead of a full page load (`wireNav()`), so browsing the site never
reloads it. Back/forward work normally through `popstate`.

That leaves a hard reload or a direct link to, say, `/archive/`: the browser
asks the server for that exact path, and there's no file there. `.htaccess`
at the repo root handles it — any request that isn't a real file or
directory falls back to `index.html`, which boots the app and
`parsePath()` renders the right page from the URL the browser already has.
See **Running it** above for what this means on a host that isn't Apache.

## Article permalinks and link previews

A shared link is a harder problem than a hard reload: a link-preview
crawler (Slack, Discord, iMessage, WhatsApp, X…) fetches the URL but never
runs the JavaScript that would read it and render the article, so on its
own the `.htaccess` fallback only gets a crawler the same generic
`<meta>` tags every page starts with.

Articles are worth solving that for. Run this whenever content changes:

```bash
node scripts/generate-previews.js
```

It writes `story/<id>/index.html` per article: an exact copy of the site
shell with that article's own title and Open Graph tags swapped in between
the `<!-- FISHNEWS:META:START/END -->` markers in `index.html`. Because
that's a real file at the article's own URL, a crawler sees the right
preview immediately, straight from those tags — no JavaScript required. A
real browser loads the same app, which renders that article from the path
exactly as it would via the `.htaccess` fallback.

It runs automatically in `.github/workflows/deploy.yml` before every deploy,
using `CONFIG.siteUrl` in `assets/fish-news.js` (override per-deploy with a
`SITE_URL` repository variable). `story/` is generated output — it is not
committed, and does not need to be.

---

## Visit counts

Every article page records a visit and shows a running total ("142 views")
next to the byline. No database — counts live in `content/views.json`, a
single `{ "article-id": count, ... }` file, updated by `api/visit.php` on
each page load.

- `assets/fish-news.js` calls `GET /api/visit.php?id=<article-id>` when an
  article renders (`recordVisit()`); the response fills in the view count
  once it arrives, and a failed or missing endpoint (e.g. a plain
  `python3 -m http.server` with no PHP) just leaves the count blank rather
  than breaking the page.
- `api/visit.php` validates the id, locks `content/views.json` with
  `flock()`, increments that id's count, writes the file back and returns
  the new total. `?peek=1` reads the count without incrementing it.
- This needs a PHP-capable host — Dreamhost runs PHP by default, which is
  why this works with no extra setup on the existing deploy. A static-only
  host (GitHub Pages, S3, Netlify) can't run `visit.php`; the count will
  just stay blank there.
- **Deploys must not overwrite live counts.** `.github/workflows/deploy.yml`
  rsyncs with `--delete`, mirroring the repo onto the server, so
  `content/views.json` is excluded from that sync (`--exclude=content/views.json`)
  — otherwise every deploy would reset every article back to whatever count
  is committed in git. The file in the repo is just a `{}` starting point
  for local dev; `visit.php` creates it on the server automatically if it's
  ever missing.

---

## Sponsor logos

The footer has a spot for sponsor logos, hidden until you add some. Edit the
`SPONSORS` array near the top of `assets/fish-news.js`:

```js
const SPONSORS = [
  { name: 'Example Co', logo: 'example.png', url: 'https://example.com' }
];
```

Logo files go in `assets/sponsors/`. `logo` can also be a full URL if the
image is hosted elsewhere. `url` is optional — omit it for a logo that isn't
a link.

---

## Building the authoring tool

Writing JSON by hand gets old quickly. Here is what a tool needs to do. Java
suits this well: it is a file-handling job with a form on the front.

### What it must produce

1. A folder `content/<id>/` containing `article.json`.
2. Any images the author selected, copied into that folder or uploaded to the CDN.
3. A rewritten `content/index.json` reflecting everything on disk.

Step 3 is only strictly needed in `index` mode, but write it anyway. It costs a
directory walk, it keeps the option open, and it gives you a single file to
diff when something looks wrong on the live site.

### Suggested build

**1. Model the article.** One class mirroring the schema above, plus a small
class hierarchy or a tagged record for body blocks. Jackson (`ObjectMapper`) or
Gson will serialise it; configure Jackson to omit nulls so optional fields stay
out of the output.

**2. Slug generation.** Derive `id` from the headline: lowercase, strip
accents (`Normalizer.normalize(s, Form.NFD)` then drop combining marks),
replace runs of non-alphanumerics with `-`, trim leading and trailing dashes,
cap at around 60 characters. If `content/<id>/` already exists, append `-2`,
`-3` and so on. Never silently overwrite.

**3. The editor.** A form with: type (article / video), headline, standfirst,
kicker, section (dropdown from the fixed list), byline, location, published
(defaulting to now, in ISO 8601 with an offset), tags (comma separated), rank,
and the video fields shown only when type is video.

For the body, a plain textarea using the same shorthand the old Markdown files
used is far quicker than a block-by-block form:

```
Plain text becomes a paragraph.

## becomes a heading

> becomes a quote — anything after an em dash becomes the attribution

- lines starting with a dash become a list

![alt text](filename.jpg) becomes an image block
```

Parse that into the `body` array on save. Splitting on blank lines and
switching on the first characters of each chunk is about thirty lines of code.

**4. Images.** A file picker that copies the chosen files into
`content/<id>/` and inserts the bare filename into the JSON — never an
absolute path from the author's machine. Offer a checkbox for "images hosted
elsewhere" that reveals an `assetBase` field instead.

**5. Rebuilding the index.** Do not append to `index.json`. Regenerate it:
walk `content/*/article.json` with `Files.newDirectoryStream`, read each one,
copy the metadata fields across (everything except `body`), sort by `published`
descending, and write the file. That way deleting a folder is enough to
unpublish, and the index can never drift out of step with what is on disk.

Write to a temporary file and move it into place with
`StandardCopyOption.ATOMIC_MOVE` so an interrupted save cannot leave a
half-written index and take the whole site down.

**6. Validation before writing.** Reject a save when: the headline is empty,
the section is not in the list, `published` will not parse as ISO 8601, the
type is `video` but no URL is set, or an image filename does not exist in the
folder. Show the problems together rather than one at a time.

### Two useful extras

- **Preview.** After saving, open `http://localhost:8000/story/<id>/` with
  `Desktop.getDesktop().browse(...)`. Starting a `com.sun.net.httpserver`
  instance on the content directory from inside the tool makes this one
  click — though a plain dev server needs `story/<id>/index.html` to already
  exist (run `node scripts/generate-previews.js` after saving, or serve `/`
  and follow a link to the article instead of opening its URL directly).
- **Rebuild-only mode.** A command-line flag that regenerates `index.json` and
  exits, so it can run in CI or a git hook after someone edits a JSON file by
  hand.

### Scope to skip

Do not build authentication, a database, or a draft workflow. Git already
handles history and review, and an unpublished story is one that is not in the
index.
