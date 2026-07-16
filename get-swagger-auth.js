const http = require('https');

const API_BASE = 'multiagenthealthtechbackend.onrender.com';

function request(method, path, headers = {}) {
  return new Promise((resolve) => {
    const options = {
      hostname: API_BASE,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
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
  console.log("Logging in...");
  const login = await request('POST', '/auth/login', {
    email: 'admin@citygeneral.com',
    password: 'securepassword123'
  });
  
  if (login.status !== 200) {
    console.log("Login failed.");
    return;
  }
  
  const token = login.data.token;
  const authHeader = { 'Authorization': `Bearer ${token}` };

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
    const res = await request('GET', path, authHeader);
    console.log(`Path: ${path} | Status: ${res.status}`);
    if (res.status === 200) {
      console.log(`Data for ${path}:`, typeof res.data === 'object' ? JSON.stringify(res.data).substring(0, 500) : res.data.substring(0, 500));
    }
  }
}

probe();
