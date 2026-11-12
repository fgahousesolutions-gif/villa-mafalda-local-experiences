// Automated cleanup of concluded guest requests. Pending financial settlements
// are kept until reconciled; future experiences are never erased just for being
// booked early. See docs/PRIVACY-BOZZA.md for the disclosure requirements.
export async function cleanup(env, now=Date.now()) {
 const days=Number(env.RETENTION_DAYS);
 if(!Number.isInteger(days)||days<30||days>3650)return;
 const cutoff=now-days*86400000;
 // Date-only event fields have no hour/timezone. Requiring date < cutoffDate
 // is conservative: do not delete on the boundary date or before the experience.
 const cutoffDate=new Date(cutoff).toISOString().slice(0,10);
 const db=env.DB;
 await db.batch([
  db.prepare(`DELETE FROM requests WHERE
   (status IN ('declined','cancelled') AND COALESCE(closed_at,created)<?)
   OR (status='requested' AND created<? AND date<?)
   OR (status='confirmed' AND COALESCE(confirmed_at,created)<? AND date<?)
   OR (status='completed' AND COALESCE(completed_at,created)<? AND date<?
      AND (experience='pasta'
        OR COALESCE((SELECT SUM(cents) FROM payments WHERE request_id=requests.id),0)
           >=CAST(ROUND(final*0.1) AS INTEGER)))`)
    .bind(cutoff,cutoff,cutoffDate,cutoff,cutoffDate,cutoff,cutoffDate),
  // Keep historical audit only while its related request still exists.
  // This preserves the settlement trail for open financial balances.
  db.prepare(`DELETE FROM audit WHERE
   (request_id IS NULL AND created<?)
   OR (request_id IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM requests WHERE id=audit.request_id))`).bind(cutoff),
  db.prepare('DELETE FROM rate_limits WHERE expires<?').bind(now)
 ]);
}
