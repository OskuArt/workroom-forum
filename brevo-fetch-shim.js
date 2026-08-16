// Compatibility adapter: the app's existing mail branch calls the Resend HTTP API.
// On Render we preload this file and transparently route that one request to Brevo.
// All other fetch() calls (jobs, translation, etc.) pass through unchanged.

const originalFetch = global.fetch;

if (typeof originalFetch === 'function' && process.env.BREVO_API_KEY) {
  // Let the existing server enter its HTTPS-mail branch without exposing Brevo details there.
  process.env.RESEND_API_KEY = process.env.BREVO_API_KEY;
  process.env.RESEND_FROM = process.env.BREVO_FROM_EMAIL || '';

  global.fetch = async function workroomFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url;

    if (url === 'https://api.resend.com/emails') {
      let payload = {};
      try {
        payload = JSON.parse(init.body || '{}');
      } catch (_) {}

      const recipients = Array.isArray(payload.to) ? payload.to : [payload.to].filter(Boolean);
      const body = {
        sender: {
          name: process.env.SITE_NAME || 'WORK//ROOM',
          email: process.env.BREVO_FROM_EMAIL,
        },
        to: recipients.map(email => ({ email })),
        subject: payload.subject || 'WORK//ROOM',
        htmlContent: payload.html || undefined,
        textContent: payload.text || undefined,
        tags: ['account-verification'],
      };

      return originalFetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: init.signal,
      });
    }

    return originalFetch(input, init);
  };
}
