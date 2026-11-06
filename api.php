<?php
// API del cielo stellato. Nessun database: i dati stanno in data/*.php
// (file PHP che terminano subito se aperti dal browser, quindi non leggibili dall'esterno).

declare(strict_types=1);

const MAX_MESSAGE = 280;
const MAX_NAME = 40;
const ADD_COOLDOWN = 30;       // secondi tra due stelle dallo stesso IP
const ADD_PER_DAY = 30;        // stelle al giorno dallo stesso IP
const LOGIN_FAILS = 5;         // tentativi di login falliti...
const LOGIN_WINDOW = 900;      // ...ogni 15 minuti per IP
const DATA_DIR = __DIR__ . '/data';
const GUARD = "<?php http_response_code(404); exit; ?>\n";

$config = is_file(__DIR__ . '/config.local.php') ? require __DIR__ . '/config.local.php' : [];
$adminHash = $config['admin_password_hash'] ?? '';
$ipSalt = $config['ip_salt'] ?? 'cambia-questo-valore';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

session_name('stelle_admin');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => dirname($_SERVER['SCRIPT_NAME']) === '/' ? '/' : dirname($_SERVER['SCRIPT_NAME']) . '/',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true,
    'samesite' => 'Strict',
]);

function out(int $status, array $body): void {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function ip_key(string $salt): string {
    return substr(hash('sha256', $salt . ($_SERVER['REMOTE_ADDR'] ?? '')), 0, 24);
}

// Legge e (opzionalmente) riscrive un file dati con lock esclusivo.
function with_store(string $name, callable $fn) {
    if (!is_dir(DATA_DIR) && !mkdir(DATA_DIR, 0750, true)) out(500, ['error' => 'Cartella dati non scrivibile']);
    $path = DATA_DIR . "/$name.php";
    $fh = fopen($path, 'c+');
    if (!$fh) out(500, ['error' => 'File dati non scrivibile']);
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $data = json_decode(substr($raw, strlen(GUARD)) ?: '[]', true) ?: [];
    [$result, $changed] = $fn($data);
    if ($changed) {
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, GUARD . json_encode($data, JSON_UNESCAPED_UNICODE));
        fflush($fh);
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    return $result;
}

function read_store(string $name): array {
    $path = DATA_DIR . "/$name.php";
    if (!is_file($path)) return [];
    $fh = fopen($path, 'r');
    flock($fh, LOCK_SH);
    $raw = stream_get_contents($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return json_decode(substr($raw, strlen(GUARD)) ?: '[]', true) ?: [];
}

// Registra un evento per IP e dice se è entro i limiti.
function rate_ok(string $bucket, string $ip, array $rules, bool $record): bool {
    return with_store('ratelimit', function (&$d) use ($bucket, $ip, $rules, $record) {
        $now = time();
        $maxWindow = max(array_keys($rules));
        $key = "$bucket:$ip";
        $events = array_values(array_filter($d[$key] ?? [], fn($t) => $t > $now - $maxWindow));
        foreach ($rules as $window => $limit) {
            if (count(array_filter($events, fn($t) => $t > $now - $window)) >= $limit) {
                $d[$key] = $events;
                return [false, true];
            }
        }
        if ($record) $events[] = $now;
        $d[$key] = $events;
        // Pulizia periodica delle chiavi scadute.
        if (random_int(1, 50) === 1) {
            foreach ($d as $k => $ev) if (!array_filter($ev, fn($t) => $t > $now - 86400)) unset($d[$k]);
        }
        return [true, true];
    });
}

function clean_text(string $s, int $max): string {
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';
    $s = trim(preg_replace("/\n{3,}/", "\n\n", str_replace("\r", '', $s)));
    return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
}

function is_admin(): bool {
    if (session_status() === PHP_SESSION_NONE && isset($_COOKIE[session_name()])) session_start();
    return !empty($_SESSION['admin']);
}

function require_admin(): void {
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_admin() || !hash_equals($_SESSION['csrf'] ?? '', $token)) out(403, ['error' => 'Non autorizzato']);
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$input = $method === 'POST' ? (json_decode(file_get_contents('php://input') ?: '', true) ?: []) : [];

// Le richieste POST devono arrivare dal sito stesso (difesa base contro CSRF e bot banali).
if ($method === 'POST' && strpos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
    out(415, ['error' => 'Content-Type non valido']);
}

switch ("$method $action") {
    case 'GET list':
        $stars = array_values(array_filter(read_store('stars'), fn($s) => empty($s['deleted'])));
        $public = array_map(fn($s) => [
            'id' => $s['id'], 'x' => $s['x'], 'y' => $s['y'],
            'message' => $s['message'], 'name' => $s['name'] ?? null, 'created_at' => $s['created_at'],
        ], $stars);
        $admin = is_admin();
        out(200, ['stars' => $public, 'admin' => $admin, 'csrf' => $admin ? $_SESSION['csrf'] : null]);

    case 'POST add':
        $x = $input['x'] ?? null;
        $y = $input['y'] ?? null;
        $message = clean_text((string)($input['message'] ?? ''), MAX_MESSAGE);
        $name = clean_text((string)($input['name'] ?? ''), MAX_NAME);
        if (!is_numeric($x) || !is_numeric($y) || $x < 0 || $x > 1 || $y < 0 || $y > 1) out(400, ['error' => 'Posizione non valida']);
        if ($message === '') out(400, ['error' => 'Scrivi un pensiero']);
        if (!empty($input['website'])) out(200, ['ok' => true]); // honeypot: i bot compilano campi nascosti
        if (!rate_ok('add', ip_key($ipSalt), [ADD_COOLDOWN => 1, 86400 => ADD_PER_DAY], true)) {
            out(429, ['error' => 'Troppe stelle in poco tempo. Riprova tra poco.']);
        }
        $star = with_store('stars', function (&$d) use ($x, $y, $message, $name) {
            $id = ($d ? max(array_column($d, 'id')) : 0) + 1;
            $s = [
                'id' => $id, 'x' => round((float)$x, 5), 'y' => round((float)$y, 5),
                'message' => $message, 'name' => $name !== '' ? $name : null,
                'created_at' => gmdate('c'),
            ];
            $d[] = $s;
            return [$s, true];
        });
        out(201, ['star' => $star]);

    case 'POST login':
        if ($adminHash === '') out(503, ['error' => 'Admin non configurato (manca config.local.php)']);
        $ip = ip_key($ipSalt);
        if (!rate_ok('login', $ip, [LOGIN_WINDOW => LOGIN_FAILS], false)) out(429, ['error' => 'Troppi tentativi. Riprova tra 15 minuti.']);
        if (!password_verify((string)($input['password'] ?? ''), $adminHash)) {
            rate_ok('login', $ip, [LOGIN_WINDOW => PHP_INT_MAX], true); // registra il fallimento
            out(401, ['error' => 'Password errata']);
        }
        session_start();
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
        out(200, ['ok' => true, 'csrf' => $_SESSION['csrf']]);

    case 'POST logout':
        if (is_admin()) {
            $_SESSION = [];
            session_destroy();
        }
        out(200, ['ok' => true]);

    case 'POST delete':
        require_admin();
        $id = (int)($input['id'] ?? 0);
        $found = with_store('stars', function (&$d) use ($id) {
            foreach ($d as &$s) {
                if ($s['id'] === $id && empty($s['deleted'])) {
                    $s['deleted'] = gmdate('c'); // cancellazione reversibile: resta nel file
                    return [true, true];
                }
            }
            return [false, false];
        });
        out($found ? 200 : 404, $found ? ['ok' => true] : ['error' => 'Stella non trovata']);

    default:
        out(404, ['error' => 'Azione sconosciuta']);
}
