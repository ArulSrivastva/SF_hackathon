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

async function runProbe() {
  try {
    // Login to our registered test hospital
    console.log("Logging in...");
    const login = await request('POST', '/auth/login', {
      email: 'admin@citygeneral.com',
      password: 'securepassword123'
    });
    
    if (login.status !== 200) {
      console.log("Login failed. Registration might be needed.");
      return;
    }
    
    const token = login.data.token;
    const authHeader = { 'Authorization': `Bearer ${token}` };

    console.log("\nProbing POST /resources...");
    const postRes = await request('POST', '/resources', {
      type: 'icu_bed',
      label: 'ICU Bed Probe A',
      status: 'available',
      department: 'ICU',
      metadata: { ventilator: true }
    }, authHeader);
    
    console.log("POST /resources status:", postRes.status);
    console.log("POST /resources response:", JSON.stringify(postRes.data, null, 2));

    console.log("\nProbing GET /resources again...");
    const getRes = await request('GET', '/resources', null, authHeader);
    console.log("GET /resources count:", getRes.data.length);
  } catch (e) {
    console.error("Probe error:", e);
  }
}

runProbe();
