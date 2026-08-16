// Runtime compatibility adapter for WORK//ROOM on Render.
// 1) Loads the daily partner vacancy scheduler/importers.
// 2) Loads the hh.ru + Instagram reliability watchdog.
// 3) Routes the app's existing HTTPS mail call through Brevo.
// 4) Normalizes same-origin browser form requests behind Render's proxy.

require('./partner-job-imports');
require('./source-watchdog');

const http = require('http');
const originalEmit = http.Server.prototype.emit;

http.Server.prototype.emit = function workroomServerEmit(event, ...args) {
  if (event === 'request') {
    const req = args[0];
    const headers = req && req.headers;
    const fetchSite = String(headers?.['sec-fetch-site'] || '').toLowerCase();

    if (headers?.origin && fetchSite === 'same-origin') {
      const host = String(headers['x-forwarded-host'] || headers.host || '')
        .split(',')[0]
        .trim();
      const proto = String(headers['x-forwarded-proto'] || 'https')
        .split(',')[0]
        .trim();
      if (host) headers.origin = `${proto}://${host}`;
    }
  }

  return originalEmit.call(this, event, ...args);
};

const originalFetch = global.fetch;

if (typeof originalFetch === 'function' && process.env.BREVO_API_KEY) {
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
