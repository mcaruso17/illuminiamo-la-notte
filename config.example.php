<?php
// Copia questo file come config.local.php SUL SERVER (non su GitHub: è escluso da .gitignore).
// Genera l'hash della password con:  php -r 'echo password_hash("LA-TUA-PASSWORD", PASSWORD_DEFAULT), "\n";'
return [
    'admin_password_hash' => '',
    // Stringa casuale qualsiasi: serve a non salvare gli IP in chiaro nei limiti anti-spam.
    'ip_salt' => '',
];
