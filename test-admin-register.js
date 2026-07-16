const http = require('https');

const API_BASE = 'multiagenthealthtechbackend.onrender.com';

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const dataStr = body ? JSON.stringify(body) : '';
    const options = {
      hostname: API_BASE,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr),
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

    req.on('error', (e) => reject(e));
    if (dataStr) {
      req.write(dataStr);
    }
    req.end();
  });
}

async function testAdmin() {
  // Try registering admin@citygeneral.com
  console.log("Registering admin@citygeneral.com...");
  const reg = await request('POST', '/hospitals/register', {
    name: 'City General Hospital',
    email: 'admin@citygeneral.com',
    password: 'securepassword123'
  });
  console.log("Register Status:", reg.status);
  console.log("Register Data:", reg.data);

  // If it works or conflicts, try logging in
  console.log("\nLogging in admin@citygeneral.com...");
  const login = await request('POST', '/auth/login', {
    email: 'admin@citygeneral.com',
    password: 'securepassword123'
  });
  console.log("Login Status:", login.status);
  console.log("Login Data:", login.data);

  if (login.status === 200) {
    const token = login.data.token;
    const authHeader = { 'Authorization': `Bearer ${token}` };
    const res = await request('GET', '/resources', null, authHeader);
    console.log("Resources Count for admin@citygeneral.com:", res.data.length);
    if (res.data.length > 0) {
      console.log("Sample resource:", res.data[0]);
    }
  }
}

testAdmin();
