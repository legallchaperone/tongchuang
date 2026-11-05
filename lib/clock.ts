/**
 * v1.11 R-006: one clock for every device. Phones and laptops can be minutes apart; timers started on one
 * and shown on another would drift by that much. The server reports its time with every focus sync and
 * this keeps the offset, so timestamps written by the app (and the "now" everything is drawn with) agree.
 */
let skew = 0;
let bestRtt = Infinity;

/** milliseconds on the server's clock */
export const serverNow = () => Date.now() + skew;
export const clockSkew = () => skew;

/** feed one round trip: local send time, local receive time, server time in between */
export function noteServerTime(sentAt: number, receivedAt: number, server: number) {
  const rtt = receivedAt - sentAt;
  if (!(server > 0) || rtt < 0 || rtt > 5000) return;
  // prefer the tightest round trip, but let a much older estimate be replaced (clocks get adjusted)
  if (rtt <= bestRtt * 1.5 || rtt < 300) {
    bestRtt = Math.min(bestRtt, rtt);
    skew = Math.round(server - (sentAt + receivedAt) / 2);
  }
}

/** tests only */
export function resetClock() { skew = 0; bestRtt = Infinity; }
