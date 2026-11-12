# Preparazione locale del 11 novembre 2026

Questo documento aggiorna le indicazioni precedenti. Branch: `feature/simonetta-online`. La configurazione reale `wrangler.test.jsonc`, già modificata dall’utente, è stata letta ma non modificata né inclusa nel commit. Nessun push, deploy, migrazione remota, modifica segreti o invio reale. Nessuna modifica alla Tower, a main o al sito pubblico.

## Funzioni e verifiche

- Richiesta ospite e due notifiche (Simonetta e ricevuta) salvate in un’unica transazione D1; rollback se cifratura/configurazione fallisce. Token originale solo nell’email cifrata, hash nel database, link nel fragment e scadenza. Apertura senza modifica; conferma/rifiuto espliciti con controllo versione.
- Importo finale modificabile; iniziale e snapshot conservati. Conferma/rifiuto preparano email ospite e Laura una sola volta. Idempotenza della richiesta, aggiornamenti concorrenti e rotazione link verificati.
- Laura dispone già di richieste, indisponibilità, menu multilingua, prezzi, cronologia, pagamenti parziali della commissione e rendiconto PDF protetto da Access.
- La commissione è `round(importo_finale_in_centesimi / 10)` solo per cena nello stato `completed`, denominato «Effettuata e pagata». Questo stato è l’attestazione manuale di Laura che l’esperienza si è svolta e l’ospite ha pagato Simonetta; la motivazione è obbligatoria e registrata nell’audit. Non esiste una verifica bancaria automatica. `payments` registra invece le liquidazioni della commissione a Villa Mafalda, non il pagamento dell’ospite. Zero commissione per pasta, richieste, conferme, annullamenti e rifiuti.
- Summer Modena Experience resta sempre visibile. Laura configura una finestra con date complete e inclusive in «Menu e prezzi». Nessuna data predefinita o ricorrenza annuale automatica: scaduta la finestra serve configurare quella nuova. Senza finestra non si può richiedere il menu. Verifica nel Worker e trigger SQL anche per cambi concorrenti; portate e traduzioni conservate.
- `/api/config` espone solo lo stato pubblico delle richieste. Il frontend non richiede il challenge quando il servizio è disabilitato: il TEST resta consultabile anche senza segreti. Avvisi chiari in cinque lingue e pulsante disabilitato.

## Resend indipendente

La ricerca locale ha trovato il vecchio contratto `EMAIL_SERVICE` e la documentazione storica, nessuna prova dell’effettivo provider del Worker Tower pubblicato. Il nome della variabile locale `resend` nella vecchia route indica soltanto la rigenerazione del link. Nessuna credenziale Tower letta o riutilizzata.

L’adattatore diretto in `src/mail.mjs` usa esclusivamente `POST https://api.resend.com/emails`, chiave Bearer `RESEND_API_KEY`, `reply_to` e `Idempotency-Key` uguale all’UUID persistente della riga outbox. Non richiede binding o servizi Tower. Si abilita solo con **APP_ENV=production**, **EMAIL_MODE=resend** e chiave dedicata presente. In **APP_ENV=test** il ritorno avviene prima di leggere il DB o usare qualsiasi trasporto, anche con chiave e modalità errate. Il contratto service precedente rimane compatibile, ma non serve per Resend.

La chiave dedicata va creata successivamente con permesso di invio e dominio autorizzato, poi inserita come secret Cloudflare esclusivamente nel Worker di produzione. Non aggiungerla a TEST o nel repository. Servono inoltre mittente verificato, indirizzi Simonetta/Laura e origine pubblica HTTPS reali; nessun valore è stato inventato. Il sito è in cinque lingue; le email esistenti rimangono in italiano.

Outbox AES-GCM con nonce casuale, cifrata prima della transazione. Lease di due minuti e timeout HTTP di 20 secondi; retry con backoff da un minuto fino a un’ora; stessa chiave e stesso corpo a ogni retry. Dopo accettazione il payload è cancellato e rimane l’ID provider. `sent` indica accettazione API, **non recapito verificato**: non sono implementati webhook di consegna o bounce.

Resend conserva l’idempotenza per 24 ore: prima del limite, a 23 ore dal primo tentativo, i retry passano in `review`. Anche errori permanenti 4xx (esclusi 408/409/429) richiedono revisione. Non esiste un reinvio automatico da `review`: controllare il provider prima di qualsiasi intervento per evitare duplicati. Un crash dopo invio e prima del salvataggio DB può lasciare esito incerto; non viene promessa consegna exactly-once illimitata. I tentativi legacy pendenti vengono portati in revisione dalla migrazione. Non trasferire né spedire code TEST in produzione. Non cambiare provider su una coda già tentata senza riconciliazione manuale.

Per futura produzione servono anche un trigger pianificato per eseguire `scheduled` e i retry in assenza di nuove richieste; il TEST non riceve cron. Nessuna configurazione di produzione viene attivata da questo lavoro.

Riferimenti verificati: [Send Email](https://resend.com/docs/api-reference/emails/send-email), [Idempotency Keys, conservazione 24 ore](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Test eseguiti

- `npm test`: 28 test con SQLite locale, inclusi due test dello script ospiti su DOM simulato.
- `npm run test:d1`: 24 test sul vero runtime workerd/D1, con database locali isolati.
- `npm run check`: controlli sintattici.
- `npm run build:test`: bundle Wrangler in dry-run, senza pubblicazione.

Casi coperti: registrazione, rollback, ricevute cifrate, contenuto e destinatari delle notifiche, token, importi, conferma/rifiuto, Access/JWT/CSRF, duplicati e concorrenza, rendiconto/PDF, commissioni e liquidazioni, estate senza finestra/estremi/revoca/corsa SQL, Resend simulato con 429/401/timeout, retry e quarantena oltre finestra, TEST mai inviante. Nessuna chiamata reale a Resend.

I primi tentativi di workerd e logging Wrangler sono stati limitati dalla sandbox (porta localhost e percorso log); ripetuti con autorizzazione e superati. Il browser grafico non è disponibile nell’ambiente: non è stata eseguita una nuova verifica visiva o end-to-end nel browser. I test DOM non sostituiscono la verifica visiva responsive. I file CSS/HTML e i contenuti dei menu non sono stati modificati.

**Blocco preventivo richieste (aggiornamento successivo al rilascio TEST):** la UI e l'endpoint POST usano lo stesso controllo. Online le richieste si possono abilitare solo con `APP_ENV=production`, privacy completa e `EMAIL_MODE=resend` con `RESEND_API_KEY` configurata, oppure `EMAIL_MODE=service` con binding `EMAIL_SERVICE` presente. Il TEST resta chiuso anche se `PRIVACY_READY` fosse attivato per errore. Le prove locali usano `APP_ENV=development`, `LOCAL_DEV=true` e `EMAIL_MODE=capture`, soltanto con origine HTTP di loopback. La presenza del trasporto non certifica la consegna: effettuare un test reale controllato prima del rilascio.

## Decisioni operative privacy — 12 novembre 2026

- **Titolare indicato dall'utente per raccolta, inoltro e amministrazione delle richieste sul sito:** Francesco Cocchi, persona fisica titolare di partita IVA individuale, che opera con il nome commerciale F.G.A. House Solutions. La denominazione legale da indicare è **Francesco Cocchi**, non una società F.G.A. distinta. Restano da verificare l'eventuale dicitura completa risultante dai documenti fiscali, la P. IVA da esporre dove necessario e un recapito privacy ufficiale.
- **Laura:** mantiene l'accesso completo all'area amministrativa, compresi dati degli ospiti, stati delle richieste, prezzi, calendario, liquidazioni e rendiconti. È una persona da autorizzare espressamente al trattamento nell'ambito del ruolo svolto; non va oscurata l'area Laura.
- **Simonetta Garelli:** riceve da Francesco/FGA soltanto i dati necessari per valutare, confermare, organizzare ed eseguire il proprio servizio. Secondo il flusso operativo descritto dall'utente, Simonetta decide autonomamente come usare i dati per la propria prestazione: il modello da documentare è quello di **titolari autonomi per trattamenti distinti**, non di contitolarità presunta. La responsabilità di Francesco sulla raccolta/inoltro originari non cessa per il solo fatto che i dati vengono comunicati a Simonetta; Simonetta risponde dei suoi trattamenti e deve fornire le informazioni dovute agli interessati. Verificare concretamente il rapporto prima del rilascio.
- **Proprietà Villa Mafalda:** non inserita automaticamente come titolare per il solo fatto di possedere l'immobile.
- **Prima di pubblicare l'informativa definitiva:** inserire il titolare **Francesco Cocchi** (P. IVA personale, nome commerciale F.G.A. House Solutions) e il recapito privacy confermato; disciplinare l'accesso completo di Laura; spiegare la comunicazione dei dati a Simonetta quale destinataria e titolare autonoma del proprio servizio; valutare come Simonetta fornisce la sua informativa; verificare basi giuridiche, Resend/Cloudflare, conservazione ed eventuali trasferimenti. Serve convalida dei ruoli effettivi e della documentazione applicabile.
- **Nessuna attivazione tecnica da questa decisione:** lasciare `PRIVACY_READY=false` e non aggiungere dati personali a `wrangler.test.jsonc` di GitHub, che non è la configurazione reale del Mac.

## Aggiornare successivamente il solo TEST online

Operazioni future, **non eseguite**, da fare solo dopo autorizzazione:

1. Conservare copia della configurazione TEST reale e verificare branch, diff, nome Worker e ID del solo database TEST. Tenere `APP_ENV=test`, `EMAIL_MODE=disabled`, `PRIVACY_READY=false`, dominio e Access attuali. Non usare `wrangler.jsonc` e non sovrascrivere `wrangler.test.jsonc` con una versione Git precedente.
2. Ripetere i quattro controlli locali sopra. Verificare backup/Time Travel del D1 TEST e migrazioni già applicate; applicare con il gestore migrazioni Wrangler al **solo D1 TEST remoto** la nuova `0003_email_summer.sql` (e precedenti solo se realmente mancanti). Non usare il seed per sovrascrivere dati esistenti. La migrazione aggiunge due colonne outbox e un trigger, rende il menu estivo visibile e sospende i vecchi tentativi incerti; non imposta date.
3. Pubblicare esclusivamente il Worker TEST con `npx wrangler deploy --config wrangler.test.jsonc`. Non cambiare segreti, cron, policy Access o configurazioni del sito pubblico per questo aggiornamento.
4. Controllare sul dominio TEST i tre menu, cinque lingue, avviso richieste disattivate, menu estivo e protezione `/admin`. Da Laura verificare che la finestra sia vuota finché non viene definita. Verificare che nessuna email sia partita. Il flusso attivo continua a essere provato localmente con dati fittizi: pubblicare questi cambi non abilita le richieste online.

La produzione e il recapito reale restano separati: richiederanno autorizzazione, dominio/mittente Resend verificati, secret dedicato, dati privacy approvati, configurazione dei retry e una prova reale controllata.
