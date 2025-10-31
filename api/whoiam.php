<?php
// whoami.php
header('Content-Type: application/json; charset=utf-8');

// >>> TROQUE AQUI: listas de usuários (sem @)
$ALLOWED_USERS = ['-'];
$ADMIN_USERS   = ['-'];

$DOMAIN = '-.br';

// Se o Apache/PAM não autenticou, não haverá REMOTE_USER
if (empty($_SERVER['REMOTE_USER'])) {
  http_response_code(401);
  echo json_encode([
    'ok' => false,
    'error' => 'Access denied (no REMOTE_USER).'
  ]);
  exit;
}

$user = $_SERVER['REMOTE_USER'];
list($userOnly) = explode('@', $user, 2);
$userOnly = strtolower(trim($userOnly));
$email    = $userOnly . '@' . $DOMAIN;

$isAllowed = in_array($userOnly, $ALLOWED_USERS, true);
$isAdmin   = in_array($userOnly, $ADMIN_USERS, true);

if (!$isAllowed) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'error' => 'User not authorized']);
  exit;
}

echo json_encode([
  'ok'      => true,
  'user'    => $userOnly,   
  'email'   => $email,      
  'isAdmin' => $isAdmin
]);
