# Configurazione e rilascio (da eseguire solo dopo autorizzazione)

> Aggiornamento 11 novembre 2026: [preparazione email e TEST](PREPARAZIONE-EMAIL-TEST.md) descrive il codice attuale, Resend isolato, finestra estiva e procedura successiva. Le indicazioni storiche sottostanti non verificano lo stato del Worker pubblicato e non prevalgono sulla configurazione TEST reale.


Aggiornamento TEST, 5 novembre 2026: usare [TEST-CLOUDFLARE.md](TEST-CLOUDFLARE.md) e `wrangler.test.jsonc`, già collegato al database esistente. Non creare un altro D1. Il manifest `wrangler.jsonc` e la tabella seguente restano relativi alla futura produzione. Per esito della ricerca email e adattatore vedere [EMAIL.md](EMAIL.md). Nel TEST `APP_ENV=test` impedisce gli invii anche in caso di modalità email configurata male.

Nessuna istruzione qui è stata eseguita su infrastruttura remota. Non fare merge su main, non modificare Pages né la Guest Guide. Non collegare automaticamente questa branch a una pubblicazione di produzione.

## Configurazioni mancanti

| Parametro | Origine necessaria |
| --- | --- |
| `DB` / `database_id` | Database D1 dedicato nell'account Cloudflare esistente; UUID reale, non presente nel repository |
| `PUBLIC_ORIGIN` | Origine HTTPS esatta scelta dall'utente, senza slash finale; non il dominio della Guest Guide |
| `APP_SECRET` | Segreto casuale di almeno 32 caratteri per challenge e rate limit |
| `OUTBOX_KEY` | Segreto casuale distinto di almeno 32 caratteri per cifrare le email; conservarne backup sicuro |
| `ACCESS_ISSUER` | `https://<team-reale>.cloudflareaccess.com`, ottenuto dall'account esistente |
| `ACCESS_AUD` | Audience dell'applicazione Access che protegge la gestione |
| `ADMIN_EMAILS` | Lista email di Laura e amministratori autorizzati, separata da virgole |
| `SIMONETTA_EMAIL` | Confermare il recapito: nel prototipo è `simonettagarelli@yahoo.it`; nessun test è stato inviato lì |
| `LAURA_EMAIL` | Recapito reale di Laura per le notifiche |
| `MAIL_FROM` | Mittente già verificato nel servizio email esistente |
| `EMAIL_SERVICE` | Service binding verso l'adattatore dell'invio email già disponibile |
| `EMAIL_MODE` | `disabled` durante preparazione; `service` solo con adattatore verificato |
| `PRIVACY_CONTROLLER`, `PRIVACY_CONTACT` | Identità completa e contatto del titolare |
| `PRIVACY_ADDITIONAL` | Informazioni approvate su responsabili, provider email reale, trasferimenti e garanzie applicabili |
| `PRIVACY_VERSION` | Versione dell'informativa approvata, salvata con ogni richiesta |
| `RETENTION_DAYS` | Periodo approvato (30–3650 giorni, default 365) e gestione documentata delle pendenze |
| `TOKEN_HOURS` | Durata link, default 168 ore; impostare un intero positivo ragionevole |
| `PRIVACY_READY` | Resta `false` fino a informativa, ruoli e configurazioni verificati |

Nessuna password è necessaria per Simonetta. Laura usa il provider di identità autorizzato in Access; nessuna password è nel browser.

## Email esistente: contratto da collegare

Il nome “Twover” non è risolvibile dai file. Servono nome del servizio effettivo, documentazione e modalità di invio già adottata negli altri progetti. Non usare credenziali di un altro progetto senza autorizzazione, non creare account nuovi e non acquistare servizi.

Il codice chiama un **service binding interno**, non un endpoint Twover inventato:

```text
POST https://email-adapter.internal/send
Content-Type: application/json
Idempotency-Key: <UUID della voce outbox>
```

Il JSON contiene `to`, `from`, `replyTo`, `subject`, `text`, `html`. L'adattatore deve tradurlo nell'API reale, usare i segreti nel proprio ambiente, onorare `Idempotency-Key` e rispondere 2xx solo dopo accettazione del provider. Il nome host è una convenzione interna del binding, non un servizio esterno da attivare. Le email riutilizzano il codice richiesta nell'oggetto, senza promettere raggruppamento automatico dei client.

Il cron riprova ogni 5 minuti con backoff e lease; consegna al provider ed elaborazione D1 non sono una transazione distribuita. Per prevenire duplicati dopo crash, l'adattatore deve garantire l'idempotenza. La voce `sent` significa accettata dal servizio, non consegna certificata alla casella. In caso di problemi Laura vede coda, tentativi e stato; nessun testo email o token appare nei log. Non cambiare `OUTBOX_KEY` con email pendenti: prima svuotare la coda o implementare una migrazione delle chiavi.

Le email sono redatte in italiano, con menu e dati concordati e codice riconoscibile. L'interfaccia ospiti e l'informativa sono in cinque lingue. Per email tradotte secondo la lingua dell'ospite è prevista `requests.lang`, ma i template email multilingua non sono inclusi in questa versione.

## Sequenza di rilascio successiva

1. Verificare branch e test. Salvare un backup dell'infrastruttura esistente. Scegliere con l'utente un'origine separata e controllare che nessuna integrazione Git pubblichi questa branch automaticamente.
2. Nell'account Cloudflare esistente predisporre D1, Access e binding email secondo disponibilità e autorizzazioni effettive. Inserire l'ID reale nel manifest; non riusare il database di altri progetti.
3. Configurare variabili e segreti in Cloudflare. Configurare Access con login e allowlist su **entrambi** `/admin*` e `/api/admin/*`; usare la stessa audience nel Worker. Non rendere indiscriminatamente privata tutta l'app, perché ospiti e link chef devono essere raggiungibili.
4. In un ambiente isolato applicare in ordine `0001.sql` e `0002_seed.sql` al database di prova; registrare che il seed mantiene inizialmente tutti e tre i menu attivi, estate compresa. Laura deve spegnere il menu estivo prima dell'apertura se fuori stagione. Le modifiche successive avvengono nel pannello.
5. Con il Wrangler già approvato nel proprio ambiente, dopo revisione del manifest:

   ```sh
   npx wrangler d1 migrations apply DB --remote --config wrangler.jsonc
   npx wrangler deploy --dry-run --config wrangler.jsonc
   ```

   Questi comandi non sono stati eseguiti qui; il primo scrive sul database remoto. Non eseguirlo contro un database esistente senza backup e verifica dell'ID. Non installare servizi a pagamento per completare la procedura.
6. Verificare in un ambiente isolato con destinatari fittizi/sandbox del provider: richieste, link, Access reale, disponibilità, importi, coda/retry, PDF, cron, fuso Europe/Rome, cancellazione dati e backup/ripristino. I test locali non sostituiscono questa prova sull'infrastruttura reale.
7. Completare e approvare l'informativa: identità, ruoli Villa/chef, basi giuridiche, responsabili, trasferimenti, conservazione e diritti. Il testo parametrico fornito è una base da verificare. Registrare la nuova versione; soltanto allora impostare `PRIVACY_READY=true`.
8. Ottenuta l'autorizzazione al rilascio, pubblicare il Worker sull'origine scelta con binding corretti e `EMAIL_MODE=service`. Aprire una richiesta fittizia e verificarne l'intero percorso. Collegare la pagina pubblica solo con esplicita autorizzazione successiva, preservando gli altri partner e la Guest Guide.

## Gestione quotidiana

Laura consulta la richiesta e i dettagli. Per imprevisti modifica lo stato/importo motivando l'intervento; la cronologia conserva prima e dopo. Una conferma iniziale accoda automaticamente la notifica ospite e Laura; rettifiche amministrative successive vengono registrate e richiedono comunicazione manuale se rilevanti per l'ospite.

Dopo l'esperienza Laura registra **Effettuata e pagata** soltanto quando entrambe le condizioni sono vere. Nel rendiconto del mese registra ogni versamento di Simonetta, anche parziale, con data e riferimento. Scarica il PDF e lo allega volontariamente alla propria email: il download non invia messaggi.

Se il link chef scade, la funzione “Invia un nuovo collegamento” crea un link diverso e invalida il precedente. Non inoltrare i link personali ad altre persone. Le indisponibilità sono inclusive di inizio e fine; l'esperienza deve essere compresa tra check-in incluso e check-out escluso. Il limite cena è 20 come nel prototipo; pasta massimo 6.
