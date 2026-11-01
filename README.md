# Vogliono la notte, la illumineremo di stelle

Un cielo nero. Ogni persona accende una stella e ci lascia il proprio pensiero sullo
sciopero generale del 20 novembre. Alla fine il cielo è stellato.

Sito statico (HTML, CSS, JS senza dipendenze) per GitHub Pages, con un database
gratuito su [Supabase](https://supabase.com) per condividere le stelle tra tutti.

## File

```
.nojekyll      dice a GitHub Pages di servire i file così come sono
index.html     pagina
style.css      stile
app.js         logica: disegno, lettura e scrittura delle stelle
config.js      URL e chiave di Supabase (vuoti = modalità demo)
supabase.sql   tabella e permessi da creare su Supabase
```

## Messa online

### 1. Database (Supabase, piano gratuito)
1. Crea un progetto su supabase.com.
2. *SQL Editor* > *New query*: incolla `supabase.sql` e premi *Run*.
3. *Project Settings* > *API*: copia **Project URL** e la chiave **publishable** (o `anon`).
4. Incollali in `config.js`.

La chiave publishable è pubblica per design: la sicurezza è nei permessi definiti in
`supabase.sql` (chiunque può leggere e aggiungere stelle, nessuno può modificarle o
cancellarle tranne te dalla dashboard).

### 2. GitHub Pages
1. *Settings* > *Pages* > *Deploy from a branch* > `main` / `(root)`.
2. Il sito sarà su https://mcaruso17.github.io/illuminiamo-la-notte/

## Moderazione

Messaggi anonimi su un tema politico attirano spam e insulti. Per nascondere una stella:
Supabase > *Table Editor* > `stars` > imposta `hidden = true`. Sparisce per tutti al
prossimo aggiornamento (ogni 20 secondi).

Protezioni presenti: massimo 280 caratteri, una stella al minuto per browser.
Il limite per browser si aggira facilmente: se il sito diventa virale serve un
controllo lato server (es. Cloudflare Turnstile o una Edge Function con rate limit).

## Limiti noti

- Le coordinate sono relative allo schermo: su schermi con proporzioni diverse il
  cielo si "stira", ma le stelle restano nello stesso punto relativo.
- Sopra qualche migliaio di stelle conviene passare dal DOM a un `<canvas>`.
- Piano gratuito Supabase: il progetto va in pausa dopo 7 giorni senza traffico.
