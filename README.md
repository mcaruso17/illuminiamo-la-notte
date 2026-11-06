# Vogliono la notte, la illumineremo di stelle

Un cielo nero. Ogni persona accende una stella e ci lascia il proprio pensiero sullo
sciopero generale del 20 novembre. Alla fine il cielo è stellato.

Sito per hosting **Plesk con PHP 7.4 o superiore**. Nessun database: le stelle sono
salvate in un file sul server.

## File

```
index.html           pagina
style.css            stile
app.js               interfaccia: disegno, lettura, scrittura, comandi admin
api.php              backend: elenco, aggiunta, login admin, eliminazione
config.example.php   modello della configurazione (password admin)
fonts/               Montserrat in locale (licenza OFL), niente Google Fonts
data/                stelle e limiti anti-spam (creati dal server, esclusi da Git)
.htaccess            blocca l'accesso a file interni
```

## Comportamento

- La dimensione di una stella cresce con la lunghezza del pensiero (da 2 a 8 px).
- Il pulsante *Leggi il manifesto* apre il testo del manifesto in un pannello laterale.
  Il testo è in `index.html`.

## Messa online su Plesk

1. **Git**: in Plesk > *Git*, collega questa repository e imposta come cartella di
   destinazione la document root del dominio (es. `httpdocs`). Modalità di deploy:
   automatica.
2. **PHP**: in *Impostazioni PHP* scegli PHP 8.x (7.4 minimo).
3. **Password admin**: in *File Manager*, nella document root, crea `config.local.php`
   copiando `config.example.php` e inserisci l'hash della password. L'hash si genera con:
   `php -r 'echo password_hash("LA-TUA-PASSWORD", PASSWORD_DEFAULT), "\n";'`
   Il file non è su GitHub e non va messo: la repository è pubblica.
4. **Permessi**: la cartella `data/` deve essere scrivibile da PHP. Su Plesk di norma lo
   è già (PHP gira con l'utente dell'abbonamento).
5. **HTTPS**: attiva il certificato Let's Encrypt (*SSL/TLS*), altrimenti la password
   admin viaggia in chiaro.

## Amministrazione

- Apri il sito con `#admin` in fondo all'indirizzo (es. `https://dominio.it/#admin`).
- Dopo il login compare una barra rossa: clicca una stella e poi *Elimina stella*.
- L'eliminazione è reversibile: la stella resta in `data/stars.php` con il campo
  `deleted`. Per ripristinarla, togli quel campo dal file.
- 5 password sbagliate in 15 minuti bloccano il login da quell'IP.

## Anti-spam

- Massimo 280 caratteri per pensiero, 40 per la firma.
- Dallo stesso IP: una stella ogni 30 secondi, al massimo 30 al giorno. Gli IP sono
  salvati solo come hash.
- Campo nascosto "trappola" per i bot semplici.

Limiti: chi cambia rete (es. dati mobili) aggira il limite per IP, e più persone
dietro lo stesso Wi-Fi (scuola, ufficio) condividono lo stesso limite.

## Backup

Le stelle esistono solo in `data/stars.php` sul server. Scaricalo ogni tanto dal File
Manager, soprattutto prima e dopo il 20 novembre.
