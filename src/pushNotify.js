const webpush = require('web-push');
const db = require('./db');

// VAPID keys for Web Push
const VAPID_PUBLIC = 'BKNM4-S0pC0vV6d6gPgsiL7QpAxpPUf9nvvF7z16MYbUItOvJcCRXL_m-HUHiPq3ldwCafPej4kERqiBFxk6uhU';
const VAPID_PRIVATE = '7KhkOM5ddRbZU6BWBJZ19oWfA5dEp8flbn-j-56eTjU';

webpush.setVapidDetails(
  'mailto:coach@augment.local',
  VAPID_PUBLIC,
  VAPID_PRIVATE
);

/**
 * Send a push notification to all stored subscriptions.
 */
async function sendPushToAll(title, body, type = 'insight') {
  const subs = db.getPushSubscriptions();
  if (!subs.length) return;

  const payload = JSON.stringify({
    title,
    body: body.substring(0, 200),
    type,
    timestamp: Date.now(),
  });

  const results = await Promise.allSettled(
    subs.map(sub => {
      const subscription = JSON.parse(sub.subscription_json);
      return webpush.sendNotification(subscription, payload).catch(err => {
        // If subscription expired/invalid, remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          db.removePushSubscription(sub.id);
        }
      });
    })
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  console.log(`[Push] Sent to ${sent}/${subs.length} subscriptions`);
}

module.exports = { sendPushToAll, VAPID_PUBLIC };
