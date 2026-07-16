const http = require('https');

const API_BASE = 'multiagenthealthtechbackend.onrender.com';

function request(method, path) {
  return new Promise((resolve) => {
    const options = {
      hostname: API_BASE,
      port: 443,
      path: path,
      method: method
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', () => resolve({ status: 500, data: 'Error' }));
    req.end();
  });
}

async function probe() {
  const paths = [
    '/swagger.json',
    '/api-docs',
    '/docs',
    '/openapi.json',
    '/resources/seed',
    '/seed',
    '/hospitals/seed',
    '/setup'
  ];

  for (const path of paths) {
    const res = await request('GET', path);
    console.log(`Path: ${path} | Status: ${res.status}`);
    if (res.status === 200 && typeof res.data === 'object') {
      console.log(`Data for ${path}:`, JSON.stringify(res.data).substring(0, 500));
    }
  }
}

probe();
