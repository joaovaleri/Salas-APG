<?php
/****************************************************
 * API proxy para o Apps Script (JSON-only, com proxy)
 * Autor: João / IMECC Unicamp
 ****************************************************/

error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Content-Type: application/json; charset=utf-8');

// ======= CONFIG =======
// URL do /exec do seu GAS (publique como Web App)
$GAS_EXEC_URL = "https://script.google.com/macros/s/-/exec";

// >>> TROQUE AQUI: listas por USERNAME (sem @)
$ALLOWED_USERS = ['-'
];
$ADMIN_USERS   = ['-'
];

$DOMAIN = '-.br';

$SHARED_SECRET = '-';

// ======= LOGIN VIA PAM (htaccess) =======
if (empty($_SERVER['REMOTE_USER'])) {
  http_response_code(401);
  echo json_encode(['ok' => false, 'error' => 'Acesso negado (sem REMOTE_USER).']);
  exit;
}

$user = $_SERVER['REMOTE_USER'];
list($userOnly) = explode('@', $user, 2);
$userOnly = strtolower(trim($userOnly));
$email    = $userOnly . '@' . $DOMAIN;

// Bloqueia logo aqui se não for user permitido
if (!in_array($userOnly, $ALLOWED_USERS, true)) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'error' => 'Não autorizado (user)']);
  exit;
}
$isAdmin = in_array($userOnly, $ADMIN_USERS, true);

// ======= AÇÃO =======
$action = $_GET['action'] ?? '';
if (!$action) {
  echo json_encode(['ok' => false, 'error' => 'Nenhuma ação especificada']);
  exit;
}

// ======= TRATAMENTO LOCAL (sem ir ao GAS) =======
if ($action === 'whoami') {
  echo json_encode(['ok' => true, 'email' => $email, 'user' => $userOnly, 'isAdmin' => $isAdmin]);
  exit;
}

if ($action === 'ping') {
  echo json_encode(['ok' => true, 'msg' => 'pong', 'user' => $userOnly, 'time' => date('c')]);
  exit;
}

// ======= PROXY PARA O GAS =======
$params = $_GET;
unset($params['action']);

$params['action']   = $action;
$params['authUser'] = $userOnly;       
$params['secret']   = $SHARED_SECRET;  
$params['format']   = 'json';          


$query = http_build_query($params);
$url = $GAS_EXEC_URL . '?' . $query;


$ch = curl_init();
curl_setopt_array($ch, [
  CURLOPT_URL => $url,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 30,
  CURLOPT_FOLLOWLOCATION => true
]);
$resp = curl_exec($ch);
$err  = curl_error($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);


if ($err) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'Erro cURL: ' . $err]);
  exit;
}

if ($code !== 200) {
  http_response_code($code);
  echo json_encode(['ok' => false, 'error' => 'HTTP ' . $code, 'body' => $resp]);
  exit;
}

if (strpos($resp, 'Moved Temporarily') !== false && preg_match('/href="([^"]+)"/i', $resp, $m)) {
  $redir = html_entity_decode($m[1]);
  $redirResp = @file_get_contents($redir);
  if ($redirResp !== false) {
    echo $redirResp;
    exit;
  }
}

header('Content-Type: application/json; charset=utf-8');
echo $resp;
