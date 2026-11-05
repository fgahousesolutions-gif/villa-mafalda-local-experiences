# Villa Mafalda · Simonetta operativa

Preparazione D1 TEST del 5 novembre 2026: [guida semplice](docs/TEST-CLOUDFLARE.md). La configurazione separata `wrangler.test.jsonc` contiene il database TEST già creato (`f330dfd4-1724-40b3-b8c3-a73ec8e4056b`). Migrazioni e bundle verificati localmente con Wrangler; nessun deploy o migrazione remota. Per il TEST seguire questa guida, che aggiorna le indicazioni generali qui sotto.

Sviluppo nella branch `feature/simonetta-online`, a partire dal commit approvato `f10ad9d401b936d2da87f6fc1a6a9dd902da4b0b` e dal prototipo `prototype/simonetta-v3-approvata.html`.

L'applicazione è in `app/` e rimane separata dai file del sito pubblico. Il prototipo, la Guest Guide e tutte le pagine esistenti sono conservati. Nessun deploy, merge su main, attivazione di servizi o invio email reale è stato effettuato.

Da questa directory, con Node 24:

```sh
npm test
npm run check
npm run dev
```

Aprire `http://127.0.0.1:8787`. Il server locale usa dati **fittizi**, un database SQLite in memoria e un'identità Laura sintetica. Si azzera al riavvio e **non invia email**. Non esporre questo server su Internet. Il Worker di produzione verifica invece firma, issuer, audience, scadenza e allowlist del JWT Cloudflare Access; non contiene bypass per Laura.

- `/`: pagina ospiti derivata dalla V3, cinque lingue, menu integrali, calendario e invio al server.
- `/confirm#<token>`: riepilogo personale della chef e seconda azione per confermare/rifiutare.
- `/admin`: richieste, periodi di indisponibilità, menu multilingua, prezzi, condizioni, rendiconti, pagamenti parziali e cronologia.
- `/privacy?lang=it`: informativa parametrica, in cinque lingue.

Le email sono accodate in modo transazionale insieme alle operazioni. La pagina dichiara la **registrazione**, mai la consegna dell'email. Una conferma non equivale a esperienza svolta e pagata. La commissione matura solo nello stato `completed` per cene in villa; per pasta resta zero. Gli importi sono registrati in centesimi. I codici `VM-SIM-<UUID>` sono univoci, non sequenziali.

## Stato del rilascio

Il codice e i test locali sono disponibili. Il collegamento all'account Cloudflare, il database D1 remoto, le policy Access, il dominio e l'adattatore per il sistema email già usato devono ancora essere configurati e verificati. Il nome “Twover” non identifica nel repository un provider o un'API utilizzabile: nessun endpoint o segreto esterno è stato inventato.

Il percorso di rilascio rimane deliberatamente disattivato: `PRIVACY_READY=false`, `EMAIL_MODE=disabled`, nessun dominio o route, `workers_dev=false`, ID D1 da sostituire. Non impostare i parametri di produzione finché l'utente non autorizza il rilascio.

Documentazione:

- [Architettura e sicurezza](docs/ARCHITETTURA.md)
- [Configurazione e rilascio successivo](docs/RILASCIO.md)
- [Verifiche eseguite e limiti](docs/TEST.md)
