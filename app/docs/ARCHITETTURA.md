# Architettura

## Analisi della base

La branch remota è stata verificata tramite il connettore GitHub. Il checkout disponibile inizialmente conteneva `511902d`, precedente al prototipo. Il trasporto Git dell'ambiente non raggiunge il proxy. Il commit di partenza `f10ad9d...`, l'albero `d3be8d5...` e il blob V3 `659b6fdd...` sono stati recuperati con il connettore e ricostruiti localmente, verificando gli hash esatti prima di passare alla branch di sviluppo.

Il repository contiene solo HTML statico e istruzioni per GitHub Pages. Non sono presenti funzioni server, credenziali, configurazioni Cloudflare, workflow CI/CD o implementazioni email riutilizzabili. Le indicazioni su dominio/Cloudflare/“Twover” nel brief non permettono di identificare account, API o mittenti autorizzati.

## Componenti

`public/` contiene solo layout, traduzioni e JavaScript pubblico. Le pagine originali nella radice del repository non sono state modificate. Per il futuro rilascio si deve pubblicare l'app Worker separata, non copiare `public/` su GitHub Pages: senza server non esistono registrazione, autenticazione o indisponibilità operative.

`src/worker.mjs` gestisce le API e tutte le autorizzazioni. `migrations/` definisce il database privato D1. Il modello contiene partner `simonetta` per estensioni future; in questa fase non implementa flussi Rosola/Sereni.

`requests` conserva dati minimi, stato, importo originale, importo definitivo, menu e condizioni storicizzati, lingua e timestamp. Non memorizza conversazioni email. Una modifica a menu o prezzi non altera le richieste precedenti. Il prezzo del client è solo una verifica di coerenza: il server ricalcola l'importo dalla configurazione privata.

`outbox` conserva messaggi cifrati AES-GCM, con un segreto distinto da quello antispam. `token_hash` contiene solo SHA-256 del token personale casuale a 256 bit. Il token in chiaro compare solo nel messaggio cifrato per la chef, non nelle API Laura, nei log o nella risposta ospiti. Il link usa un frammento URL, trasferito dal browser all'API nell'header Authorization e immediatamente rimosso dalla barra degli indirizzi. La pagina non carica script esterni. Il GET non modifica lo stato.

## Consistenza

La richiesta, le due notifiche e l'audit vengono salvati nello stesso `DB.batch`, transazionale in D1. La chiave idempotente è un UUID indipendente dai dati personali, conservato nel solo sessionStorage con un'impronta dei dati. Retry identici restituiscono il codice esistente; riutilizzi con dati diversi vengono rifiutati. Il browser disabilita il pulsante dopo successo. Un nuovo dispositivo o una nuova sessione possono comunque creare una richiesta distinta: non si uniscono automaticamente richieste legittime dello stesso ospite.

I trigger SQL bloccano prenotazioni su periodi indisponibili e menu/prezzi modificati tra lettura e scrittura. Conferme e aggiornamenti usano una versione incrementale e una condizione compare-and-swap; solo il vincitore accoda notifiche e audit. Anche una data divenuta indisponibile dopo la richiesta viene verificata alla conferma.

La rotazione dei link invalida il precedente e annulla le vecchie email per la chef ancora in coda. Un messaggio già accettato dal provider non può essere ritirato; il vecchio link resta comunque invalido.

## Accesso e protezioni

Configurare Cloudflare Access su `/admin*` e `/api/admin/*`. Il Worker verifica autonomamente il JWT RS256 tramite JWKS dell'issuer configurato, audience esatta, scadenza, emissione e allowlist email. Header di identità non firmati non sono sufficienti. La pagina e tutte le API private falliscono chiuse se manca la configurazione. La connessione alla JWKS reale deve essere verificata prima del rilascio.

Scritture limitate alla stessa origine, query parametrizzate, escaping HTML/email/PDF, CSP senza script inline, frame bloccati, no-store e no-referrer. Limiti sulla dimensione dei body. Per le richieste pubbliche: honeypot, challenge HMAC con permanenza minima di 2 secondi e massima di 2 ore, limite D1 di 8 tentativi/ora per IP (hash HMAC con finestra oraria). Le aperture dei link hanno un limite separato. I visitatori dietro lo stesso NAT condividono il limite; ritoccare soltanto dopo misure reali. Per abusi distribuiti valutare le regole WAF già disponibili nell'account, senza attivare nuovi servizi autonomamente.

Le chiavi devono essere segreti Worker, mai HTML, Git, query string o log. `tests/` e `scripts/dev.mjs` contengono esclusivamente identità sintetiche e non sono importati dal Worker.

## Rendiconti e dati

Solo `completed` + `dinner` matura `round(final_cents / 10)`; pasta, confermate, annullate e rifiutate maturano zero. Il PDF mensile elenca le esperienze svolte, prezzi, commissioni, versamenti e saldo. I pagamenti sono singoli movimenti append-only con chiavi idempotenti, data e riferimento, allocati alla richiesta: il rendiconto segue il mese dell'esperienza anche se il versamento è successivo. Non si possono versare più commissioni del maturato. Una richiesta con versamenti non può essere annullata o cambiarne l'importo: un errore contabile richiede rettifica amministrativa documentata, non cancellazione della storia.

`RETENTION_DAYS` elimina richieste abbandonate, rifiutate, annullate e completate senza pendenze dopo il periodo indicato; i pagamenti e le email relative vengono rimossi per cascata. Le confermate ancora aperte e le cene con commissioni non saldate sono conservate per la gestione delle pendenze e richiedono revisione periodica. L'audit scade secondo lo stesso periodo. La policy va concordata con il titolare e con gli obblighi contabili prima dell'attivazione. Nessuna promessa di conformità automatica sostituisce tale verifica.
