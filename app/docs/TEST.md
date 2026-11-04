# Verifiche del 4 novembre 2026

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
