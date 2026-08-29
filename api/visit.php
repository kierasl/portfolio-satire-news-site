<?php
/**
 * Fish News visit counter.
 *
 * Increments and returns the view count for one article. No database —
 * counts live in a single JSON file (content/views.json) next to the
 * content it describes, guarded by a file lock so concurrent requests
 * can't clobber each other.
 *
 * GET /api/visit.php?id=<article-id>
 *   -> increments the count for <article-id> and returns the new total.
 *
 * GET /api/visit.php?id=<article-id>&peek=1
 *   -> returns the current total without incrementing it.
 */

header('Content-Type: application/json');

// Same-origin only; the site never calls this cross-domain.
header('Access-Control-Allow-Origin: ' . (isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '*'));

$id = isset($_GET['id']) ? $_GET['id'] : '';

// Article ids are URL-safe slugs (see README): lowercase letters, digits
// and hyphens. Reject anything else outright rather than trying to sanitise it.
if (!preg_match('/^[a-z0-9-]{1,120}$/', $id)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid id']);
    exit;
}

$storeFile = __DIR__ . '/../content/views.json';
$peek = isset($_GET['peek']) && $_GET['peek'] === '1';

$fp = fopen($storeFile, 'c+');
if ($fp === false) {
    http_response_code(500);
    echo json_encode(['error' => 'could not open store']);
    exit;
}

flock($fp, LOCK_EX);

$raw = stream_get_contents($fp);
$counts = json_decode($raw, true);
if (!is_array($counts)) {
    $counts = [];
}

if (!$peek) {
    $counts[$id] = (isset($counts[$id]) ? (int)$counts[$id] : 0) + 1;

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($counts, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    fflush($fp);
}

flock($fp, LOCK_UN);
fclose($fp);

echo json_encode(['id' => $id, 'views' => isset($counts[$id]) ? (int)$counts[$id] : 0]);
