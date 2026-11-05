# Email: ricerca e collegamento futuro

## Ricerca in sola lettura del 5 novembre 2026

Sono stati elencati i repository accessibili di `fgahousesolutions-gif`. Sono stati ispezionati alberi e file pertinenti senza modificare altri progetti né leggere segreti:

| Repository | File controllati |
| --- | --- |
| [Gestione-Master](https://github.com/fgahousesolutions-gif/Gestione-Master) | `wrangler.jsonc`, `src/main.py`, `src/legacy_app.py`, `server.py` |
| [ContoGestioneFGA](https://github.com/fgahousesolutions-gif/ContoGestioneFGA) | `wrangler.toml`, `server.py` |
| [Gestione_Biancheria](https://github.com/fgahousesolutions-gif/Gestione_Biancheria) | `worker.js`, `wrangler.jsonc`, `functions/api/config.js` |
| [Gestione360](https://github.com/fgahousesolutions-gif/Gestione360) | `server.py` |
| [ecosistema-fga](https://github.com/fgahousesolutions-gif/ecosistema-fga) | `README.md`, `index.html` |
| Villa Mafalda Local Experiences | Configurazione e sorgenti `app/` della branch di sviluppo |

Nessun file ispezionato identifica un provider operativo “Twover”, endpoint SMTP/API o un binding di invio riutilizzabile. I riferimenti a email in Gestione-Master riguardano identità degli utenti, non l'invio. Questo esito riguarda solo i file accessibili esaminati: non dimostra l'assenza di un servizio nell'account Cloudflare o in configurazioni esterne non collegate.

## Codice già pronto

`src/mail.mjs` cifra e accoda i messaggi, gestisce retry e usa un service binding `EMAIL_SERVICE`. Il contratto esistente è:

```text
POST https://email-adapter.internal/send
Content-Type: application/json
Idempotency-Key: UUID dell'outbox
JSON: {to, from, replyTo, subject, text, html}
```

L'host è interno al binding, non è un provider inventato. Quando il servizio sarà identificato, il suo adattatore dovrà accettare questo contratto, tradurlo nell'API documentata, conservare l'idempotenza e rispondere 2xx solo dopo accettazione. Segreti del provider soltanto nel servizio autorizzato, mai copiati da altri progetti. Testare con sandbox o destinatari controllati prima di collegare la produzione. Non è possibile realizzare onestamente la traduzione verso un provider ancora sconosciuto.

Per la futura configurazione di produzione, dopo autorizzazione, dichiarare `services` con binding `EMAIL_SERVICE` e nome reale del servizio autorizzato, e i valori reali di `SIMONETTA_EMAIL`, `LAURA_EMAIL`, `MAIL_FROM`. Poi verificare mittente, reply-to, retry e idempotenza. Le email attuali sono in italiano; il sito è in cinque lingue.

Nel TEST `APP_ENV=test` impedisce comunque la consegna, anche con `EMAIL_MODE=service` e binding presenti. Non rimuovere questo blocco per pubblicare l'anteprima. I test di consegna usano esclusivamente un servizio fittizio senza chiamate esterne. Le code TEST non devono essere trasferite in produzione o inviate in seguito a destinatari reali.
