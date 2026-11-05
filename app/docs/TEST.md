# Verifiche del 5 novembre 2026 — preparazione D1 TEST

## Esito aggiornato

- Base recuperata con connettore GitHub e verificata file per file tramite hash Git; albero `c0efe0aa573f6c4a1b9ef89ad0a5e21cba81c807` e commit esatto `7162a991b279ac3fddc1728cbe7e68601e46a797`. Checkout isolato in `codex/simonetta-d1-test`; nessuna modifica ai file pubblici fuori da `app/`.
- Node 24.22.1, Wrangler 4.158.0, Miniflare 5.20261104.0-beta e workerd 1.20261104.1. Versioni di sviluppo fissate e lockfile incluso. Nessuna dipendenza nel Worker di produzione.
- **19 gruppi workflow superati su SQLite nativo**, **gli stessi 19 superati sul vero binding D1 locale di workerd**, più **2 verifiche** della configurazione separata e del blocco assoluto invio TEST. `npm test`, `npm run test:d1`, `npm run check` completati senza errori.
- `npm run d1:test:local`: `0001.sql` e `0002_seed.sql` applicate con Wrangler esclusivamente in `.local/d1-test`. Ripetizione senza migrazioni da applicare; nessun duplicato. Nessuna modifica necessaria ai file SQL esistenti.
- `npm run d1:test:verify`: 8 tabelle applicative (`settings`, `menus`, `blocks`, `requests`, `payments`, `audit`, `outbox`, `rate_limits`) più `d1_migrations`; trigger `booking_guard`, `payment_guard`, `correction_guard`; nessuna violazione `foreign_key_check`.
- Seed: 3 menu attivi, ciascuno 220 €, solo `summer` stagionale; pasta 200 €, riferimento 220 €; condizioni IT/EN/DE/FR/ES. Portate e traduzioni confrontate con le fixture; Laura può spegnere estate via API senza modifiche al codice. Il seed non aggiunge richieste o dati personali.
- `npm run build:test`: bundle generato localmente (45,41 KiB nella prova), binding DB TEST e asset validi, nessun upload. `workers_dev=false`, `preview_urls=false`, nessuna route, servizio email o cron.
- Worker effettivo in `wrangler dev --local`, porta 8788: `/`, `/confirm`, `/api/config` rispondono 200; menu e prezzi corretti; `/admin`, `/admin.html`, API private e PDF rispondono 401 senza Access; creazione richieste risponde 503 finché privacy non pronta. Nessun bypass amministrativo nel bundle.
- `node tests/browser.mjs`: superato nuovamente su Chromium locale, ospiti 390×844, gestione 360×800, desktop 1440×1000; cinque lingue, tre menu, pasta/max 6, totale, richiesta e archivio Laura, indisponibilità, rendiconti e conferma con importo modificato. Nessuna eccezione JavaScript o overflow nei layout controllati.
- PDF locale `.local/report-test.pdf`: verificato con `pdfinfo` e `pdftotext`, PDF 1.4 A4, nessun JavaScript. Importo 1.200 €, commissione 120 €, versato 70 €, saldo 50 €.

Le migrazioni sono state applicate tramite il comando D1 locale reale e tutti i workflow sono stati ripetuti contro l'API D1 locale, oltre all'adattatore SQLite. I test JWT usano sempre chiavi RSA e identità sintetiche; non simulano l'avvenuta configurazione del tenant Access reale.

## Problemi risolti e limiti attuali

Separazione TEST/produzione prima assente: aggiunto manifest dedicato con UUID fornito, comandi locali espliciti, SQL di verifica, guida remota e variabili documentate. Rafforzata la disabilitazione email: `APP_ENV=test` blocca anche un binding attivato per errore, verificato da test dedicato.

Il trasporto Git e le operazioni npm nel sandbox iniziale non raggiungevano il proxy o non potevano scrivere la cache predefinita. Recupero tramite connettore GitHub, checkout isolato verificato, cache temporanea e rete autorizzata per installazione e server locali hanno consentito di completare i controlli. Non sono stati richiesti segreti o credenziali Cloudflare e non sono stati aggirati blocchi di destinazione. Il solo avviso Wrangler sul recupero di `Request.cf` ha usato il fallback locale e non ha impedito i test.

Non eseguiti: accesso account Cloudflare, verifica dello stato effettivo del D1 remoto, migrazioni remote, deploy, creazione Access, modifica DNS, email reali, servizi a pagamento o merge su main. La ricerca in sola lettura sui repository FGA accessibili non ha identificato il provider indicato come “Twover”: evidenze e limiti in [EMAIL.md](EMAIL.md). Configurazione e istruzioni pronte in [TEST-CLOUDFLARE.md](TEST-CLOUDFLARE.md).

Restano da verificare in seguito dominio e Access reali, permessi sul D1 remoto, provider email, informativa approvata e autorizzazione a pubblicare. Non sono stati eseguiti test su Safari/iOS fisico o screen reader. Le immagini/font esterni possono usare fallback nella rete limitata. Fixture giugno 2027 da aggiornare quando trascorse.

---

# Verifiche precedenti del 4 novembre 2026 (storico)

Le limitazioni su Wrangler e sulla ricerca email nelle sezioni storiche seguenti sono aggiornate dall'esito del 5 novembre sopra.

## Esito

- `npm test`: **19 gruppi di test superati**, nessun fallimento. Esecuzione reale del Worker contro SQLite nativo con adattatore dell'API D1, query SQL, trigger e transazioni. Nessuna chiamata a database o destinatari reali.
- `npm run check`: sintassi server e JavaScript browser verificata.
- `node tests/browser.mjs`: superato su Chromium locale. Pagina ospiti 390×844, gestione 360×800, desktop 1440×1000; nessuna eccezione JavaScript e nessuno scorrimento orizzontale nei layout verificati.
- PDF generato: `pdfinfo` conferma PDF 1.4, A4, una pagina, senza JavaScript; `pdftotext` legge codice, importo, commissione, versamenti e saldo corretti. Il generatore supporta più pagine e non richiede servizi esterni.

I 19 gruppi verificano: fedeltà delle portate V3 in cinque lingue e prezzi; registrazione e cifratura della coda; validazione di dati/date/partecipanti/prezzo; idempotenza; indisponibilità per esperienza e relativi motivi privati; conferma con importo diverso e timestamp; rifiuto/scadenza/rotazione link; JWT reali firmati generati in test e attacchi CSRF; aggiornamento menu e conservazione snapshot; commissioni e pagamenti parziali/PDF; pasta sempre a commissione zero; coda disabilitata; rate limit; conservazione; invii e conferme concorrenti; date malformate e blocchi sopraggiunti; retry email e idempotenza pagamenti; informativa in cinque lingue e configurazione incompleta; guardie SQL sulle scritture.

## Browser

Verificati click di selezione di tutti i menu, cinque selettori lingua, portate integrali, selezione pasta e limite sei, totale 3×200=600, compilazione del soggiorno, invio con dati fittizi e conferma di registrazione con codice. Verificata la presenza della richiesta in Laura, inserimento di indisponibilità, editor menu e pannello rendiconti. Provato il link personale di una richiesta fittizia nella pagina Simonetta: apertura senza modifica, token rimosso dalla barra URL, importo modificato e conferma solo dopo il pulsante esplicito.

Le immagini QA prodotte nell'ambiente di lavoro sono `/tmp/vm-qa/mobile.png`, `desktop.png`, `admin-mobile.png`, `confirmation-mobile.png`. Il PDF fittizio è `/tmp/vm-qa/report.pdf`. Non contengono dati reali e non vengono pubblicati con l'app.

Per ripetere la verifica browser, avviare `npm run dev`, poi un Chromium locale con debugging sulla porta 9222 e un profilo temporaneo, e infine `node tests/browser.mjs`. Lo script usa soltanto il protocollo DevTools locale, senza dipendenze npm. Il server locale scrive un token **fittizio** in `/tmp/vm-qa-confirm.json` per questa prova, fuori dagli asset serviti. Il database è in memoria e riparte vuoto con una richiesta fittizia predisposta per la chef.

## Limiti espliciti

Non sono stati eseguiti deploy né migrazioni D1 remote. Non è stata provata l'autenticazione contro il tenant Cloudflare reale: i test verificano l'algoritmo JWT con chiavi RSA e issuer sintetici. Non è stato disponibile un compilatore Wrangler installato; la verifica del bundle sul runtime Cloudflare resta da eseguire prima del rilascio. Le API sono standard Web Worker, senza moduli Node nel codice di produzione.

Il servizio indicato come “Twover” non è identificabile nel repository. Sono stati provati coda cifrata, retry, idempotenza e un service binding fittizio, **non il recapito email reale**. Non sono state inviate email a Simonetta, Laura o ospiti.

L'informativa richiede identità, contatti, provider e verifica del titolare prima di abilitare le richieste. Nessuna integrazione esterna o conformità legale è dichiarata verificata.

Il browser dell'ambiente non ha caricato i font e la fotografia esterni durante la prova di rete limitata: sono rimasti i fallback locali previsti dal prototipo. Le famiglie CSS Playfair Display e DM Sans e l'immagine originali sono conservate; prima del rilascio verificare disponibilità, autorizzazione d'uso della foto e scelta di eventuale hosting locale dei font con il titolare.

Non è stato effettuato un test su Safari/iOS fisico, accessibilità con screen reader o carico su D1 remoto. I test browser riguardano le dimensioni dichiarate su Chromium. Le date fittizie dei test sono giugno 2027: aggiornare il calendario delle fixture quando trascorso.
