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

async function testStJude() {
  console.log("Registering admin@hospital.com as St. Jude...");
  const reg = await request('POST', '/hospitals/register', {
    name: 'St. Jude Emergency Command Center',
    email: 'admin@hospital.com',
    password: 'password123'
  });
  console.log("Register Status:", reg.status);
  console.log("Register Data:", reg.data);

  console.log("\nLogging in admin@hospital.com...");
  const login = await request('POST', '/auth/login', {
    email: 'admin@hospital.com',
    password: 'password123'
  });
  console.log("Login Status:", login.status);
  
  if (login.status === 200) {
    const token = login.data.token;
    const authHeader = { 'Authorization': `Bearer ${token}` };
    const res = await request('GET', '/resources', null, authHeader);
    console.log("Resources Count for admin@hospital.com:", res.data.length);
    if (res.data.length > 0) {
      console.log("Sample resource:", res.data[0]);
    }
  }
}

testStJude();
