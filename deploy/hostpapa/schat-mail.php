<?php
// S-Chat mail relay — put on normal web hosting (HostPapa). The S-Chat server posts login-code
// emails here over HTTPS because cloud servers often can't use SMTP ports.
// Set the same secret as MAIL_RELAY_TOKEN in S-Chat's settings.
$TOKEN = '__TOKEN__';
$FROM  = 'Satin Connect <noreply@satingraphic.ca>';

header('Content-Type: application/json');
$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in) || !isset($in['token']) || !hash_equals($TOKEN, (string)$in['token'])) { http_response_code(403); echo '{"ok":false,"error":"forbidden"}'; exit; }
$to = filter_var($in['to'] ?? '', FILTER_VALIDATE_EMAIL);
if (!$to) { http_response_code(400); echo '{"ok":false,"error":"bad to"}'; exit; }
$subject = '=?UTF-8?B?' . base64_encode(mb_substr((string)($in['subject'] ?? 'S-Chat'), 0, 150)) . '?=';
$text = (string)($in['text'] ?? '');
$html = (string)($in['html'] ?? nl2br(htmlspecialchars($text)));
$b = 'b' . bin2hex(random_bytes(8));
$headers = "From: $FROM\r\nReply-To: $FROM\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=\"$b\"";
$body = "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text))
      . "--$b\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "--$b--\r\n";
$ok = mail($to, $subject, $body, $headers, '-fnoreply@satingraphic.ca');
echo json_encode(['ok' => (bool)$ok, 'error' => $ok ? '' : 'mail() failed']);
