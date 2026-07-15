const https = require('https');
const querystring = require('querystring');

const AT_USERNAME = process.env.AT_USERNAME || '';
const AT_API_KEY = process.env.AT_API_KEY || '';
const AT_FROM = process.env.AT_FROM || '';

function sendSMS(to, message) {
  return new Promise((resolve) => {
    if (!AT_USERNAME || !AT_API_KEY) {
      console.log('[SMS] Skipped (no Africa\'s Talking credentials). Would send to', to, ':', message);
      return resolve(false);
    }
    const postData = querystring.stringify({
      username: AT_USERNAME,
      to: to.replace(/[^0-9]/g, ''),
      message: message,
      ...(AT_FROM ? { from: AT_FROM } : {})
    });
    const options = {
      hostname: 'api.africastalking.com',
      path: '/version1/messaging',
      method: 'POST',
      headers: {
        'apiKey': AT_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log('[SMS] Sent to', to, ':', data);
        resolve(true);
      });
    });
    req.on('error', (err) => {
      console.error('[SMS] Error:', err.message);
      resolve(false);
    });
    req.write(postData);
    req.end();
  });
}

module.exports = { sendSMS };