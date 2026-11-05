# Ambiente TEST Simonetta — guida semplice

Preparazione completata il 5 novembre 2026. Nessuna operazione remota è stata eseguita.
Il database già creato è collegato nella configurazione: non bisogna crearne un altro.

## 1. Aprire la versione di sviluppo

Nel terminale del progetto:

```sh
git switch feature/simonetta-online
cd app
npm ci
```

Usare Node 24 o successivo. Tutti i comandi TEST usano `wrangler.test.jsonc`.
Il file `wrangler.jsonc` resta riservato alla futura produzione e non va usato per queste prove.

## 2. Ripetere le prove sul computer (facoltativo)

```sh
npm test
npm run check
npm run test:d1
npm run d1:test:local
npm run d1:test:verify
npm run build:test
```

Questi comandi non scrivono sul database Cloudflare. Il controllo `build:test` prepara soltanto i file, senza pubblicarli.
`npm run dev` apre una dimostrazione locale con Laura fittizia: non pubblicarla su Internet.
`npm run dev:test` avvia invece il Worker Cloudflare locale con il database persistente in `.local/d1-test`, gestione bloccata e richieste disattivate per impostazione iniziale.
Per prove locali abilitate: copiare `.dev.vars.example` in `.dev.vars`, generare due segreti diversi di almeno 32 caratteri, completare i valori locali e impostare lì `PRIVACY_READY=true` solo con dati fittizi. Non salvare `.dev.vars` su GitHub. Questa modifica non abilita Laura: Access continua a essere obbligatorio nel Worker.

## 3. Accedere al proprio account Cloudflare

Solo quando si decide di inizializzare il TEST remoto:

```sh
npx --no-install wrangler login
npx --no-install wrangler whoami
npx --no-install wrangler d1 info villa-mafalda-simonetta-test --config wrangler.test.jsonc
```

Controllare che nome e ID siano esattamente:

```text
villa-mafalda-simonetta-test
f330dfd4-1724-40b3-b8c3-a73ec8e4056b
```

Serve l'account che contiene questo database e il permesso di modificarlo (D1 Edit). Non selezionare database di altri progetti. Il nome e l'ID provengono dalla richiesta dell'utente; l'account e lo stato remoto non sono stati ispezionati in questa sessione.

## 4. Inizializzare il database TEST già esistente

**I comandi di questo passaggio sono preparati, ma NON sono stati eseguiti. Il comando `apply --remote` modifica il database remoto.**

```sh
npx --no-install wrangler d1 migrations list DB --remote --config wrangler.test.jsonc
npx --no-install wrangler d1 migrations apply DB --remote --config wrangler.test.jsonc
npx --no-install wrangler d1 execute DB --remote --config wrangler.test.jsonc --file scripts/verify-d1.sql
npx --no-install wrangler d1 migrations list DB --remote --config wrangler.test.jsonc
```

Il risultato atteso: nessuna migrazione pendente; 8 tabelle dell'app più `d1_migrations`; 3 controlli automatici sui dati; 3 menu da 220 €, pasta da 200 € con riferimento 220 €, condizioni in 5 lingue e nessun errore nei collegamenti fra tabelle. Le migrazioni creano soltanto schema, menu e condizioni: non inseriscono ospiti, richieste, amministratori o pagamenti fittizi. Wrangler conserva le migrazioni applicate: ripetere `migrations apply` non deve reinserire il seed. Non eseguire direttamente il file seed più volte.

## 5. Scegliere un indirizzo separato per l'anteprima

Scegliere un nuovo sottodominio nell'account esistente, senza riutilizzare sito Local Experiences o Guest Guide. Il Worker avrà nome `villa-mafalda-simonetta-test`; non modificare Workers, domini o database degli altri progetti.

Nella configurazione TEST inserire l'indirizzo HTTPS esatto in `vars.PUBLIC_ORIGIN`, senza slash finale. Per la futura pubblicazione su quel sottodominio, sostituire `routes: []` con:

```json
"routes": [{"pattern": "SOTTODOMINIO-REALE", "custom_domain": true}]
```

`SOTTODOMINIO-REALE` è il nome scelto, senza `https://` né percorso. È un segnaposto, non un dominio già configurato. `workers_dev` e `preview_urls` restano `false`, così non si aprono indirizzi alternativi. La configurazione attuale non pubblica alcun indirizzo.

## 6. Proteggere Laura prima dell'anteprima

In Cloudflare Zero Trust → Access → Applications creare in seguito una sola applicazione per la gestione, con entrambi i percorsi dello stesso sottodominio:

1. `/admin*` (include `/admin` e `/admin.html`).
2. `/api/admin/*` (include richieste e PDF).

Inserire nella regola Allow soltanto gli indirizzi realmente autorizzati. Non sono stati inventati indirizzi né create applicazioni Access.
Trascrivere nella configurazione TEST:

| Campo | Dove trovare il valore |
| --- | --- |
| `ACCESS_ISSUER` | Indirizzo del proprio team, `https://TEAM-REALE.cloudflareaccess.com` |
| `ACCESS_AUD` | Application Audience dell'applicazione appena creata |
| `ADMIN_EMAILS` | Email autorizzate, separate da virgole; devono corrispondere alla regola Access |

Non applicare il login all'intero sito: `/`, `/api/config`, `/api/challenge`, `/api/requests`, `/privacy`, `/confirm` e `/api/confirm` restano i percorsi ospiti/chef. Il link personale della chef rimane obbligatorio sulle API di conferma; nessun token va condiviso pubblicamente.
Il Worker controlla anche firma e autorizzazione: se mancano questi valori, Laura e i PDF rispondono 401 e non espongono dati. Verificare in seguito sul dominio reale sia il login autorizzato sia il rifiuto di un account non autorizzato.

## 7. Inserire i segreti nel solo Worker TEST

Per la futura attivazione delle richieste servono due valori casuali diversi, di almeno 32 caratteri. Generarli con un gestore di password e conservarli in modo sicuro. Inserirli con i prompt, mai dentro il repository:

```sh
npx --no-install wrangler secret put APP_SECRET --config wrangler.test.jsonc
npx --no-install wrangler secret put OUTBOX_KEY --config wrangler.test.jsonc
```

I comandi sopra scrivono impostazioni remote e sono istruzioni per dopo, non azioni eseguite.
Per la sola anteprima di menu e pagine, le richieste possono restare disattivate. Per abilitarle, completare identità e contatto privacy, versione informativa approvata, periodo di conservazione e indirizzi del flusso. In TEST usare esclusivamente destinatari `example.test` e dati fittizi; tenere `PRIVACY_READY=false` fino alla verifica. Il modello completo è in `.dev.vars.example` e i parametri in `RILASCIO.md`.

## 8. Mantenere le email spente

`APP_ENV=test` blocca l'invio anche se viene selezionata per errore la modalità email attiva. Lasciare anche `EMAIL_MODE=disabled`. Non c'è un collegamento email né un timer nel TEST.
Le richieste abilitate accodano messaggi cifrati ma non li consegnano: non aspettarsi email o link nella casella. Il percorso completo con conferma è stato verificato localmente tramite fixture riservate. Non pubblicare strumenti per leggere token o accedere come Laura fittizia.
Il servizio chiamato “Twover” non è stato identificato: serve il nome del provider reale e l'autorizzazione a collegare il suo servizio per Simonetta. La ricerca e il contratto già pronto sono descritti in `EMAIL.md`. Nessuna credenziale degli altri progetti è stata usata.

## 9. Pubblicare soltanto in un intervento successivo autorizzato

Nessun deploy è stato eseguito. Quando indirizzo e Access sono configurati, ripetere `npm run build:test` e verificare il nome Worker e l'ID D1. La futura pubblicazione userà esclusivamente:

```sh
npx --no-install wrangler deploy --config wrangler.test.jsonc
```

Non eseguire ora. Non collegare questa branch a Pages o ad automazioni di produzione. Non fare merge su `main`. Prima di aprire richieste verificare Access reale, privacy e i segreti; lasciare le email spente. Spegnere il menu estivo dall'area Laura quando fuori stagione (il seed lo crea attivo).

## Cosa manca effettivamente

- Accesso all'account che contiene il D1 indicato e autorizzazione all'inizializzazione remota.
- Scelta del sottodominio TEST, autorizzazione alla futura pubblicazione e permessi Worker/DNS necessari solo per quell'indirizzo.
- Team e applicazione Access con audience e indirizzi amministratori reali.
- Due segreti dedicati e, prima di abilitare richieste, dati e informativa privacy approvati.
- Identificazione del provider email e autorizzazione specifica al collegamento futuro; nessuna email reale nel TEST.

Non manca un nuovo database, né codice per menu/prezzi, conferma, calendario, commissioni o PDF.
