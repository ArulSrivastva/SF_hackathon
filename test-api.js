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

async function runTests() {
  try {
    console.log("1. Checking health...");
    const health = await request('GET', '/health');
    console.log("Health:", health);

    console.log("\n2. Trying Login...");
    // Let's try default credentials
    const loginRes = await request('POST', '/auth/login', {
      email: 'admin@citygeneral.com',
      password: 'securepassword123'
    });
    console.log("Login Status:", loginRes.status);
    console.log("Login Data:", JSON.stringify(loginRes.data, null, 2));

    let token = '';
    if (loginRes.status === 200 && loginRes.data.token) {
      token = loginRes.data.token;
    } else {
      console.log("\nLogin failed, trying to register hospital...");
      const email = `hosp-${Date.now()}@test.com`;
      const regRes = await request('POST', '/hospitals/register', {
        name: 'Test Hospital',
        email: email,
        password: 'securepassword123'
      });
      console.log("Register Status:", regRes.status);
      console.log("Register Data:", JSON.stringify(regRes.data, null, 2));

      if (regRes.status === 201) {
        // Try login with newly registered hospital
        const loginRes2 = await request('POST', '/auth/login', {
          email: email,
          password: 'securepassword123'
        });
        token = loginRes2.data.token;
        console.log("Login 2 Token obtained.");
      }
    }

    if (!token) {
      console.log("No token obtained. Exiting test.");
      return;
    }

    const authHeader = { 'Authorization': `Bearer ${token}` };

    console.log("\n3. Fetching Resources...");
    const resources = await request('GET', '/resources', null, authHeader);
    console.log("Resources Status:", resources.status);
    console.log("Resources Count:", Array.isArray(resources.data) ? resources.data.length : 'Not an array');
    if (Array.isArray(resources.data) && resources.data.length > 0) {
      console.log("First Resource Sample:", JSON.stringify(resources.data[0], null, 2));
    }

    console.log("\n4. Declaring Emergency...");
    const emRes = await request('POST', '/emergencies', {
      scope: 'mass',
      department_reach: ['Emergency', 'ICU']
    }, authHeader);
    console.log("Declare Status:", emRes.status);
    console.log("Declare Data:", JSON.stringify(emRes.data, null, 2));

    if (emRes.status === 201 && emRes.data.id) {
      const emId = emRes.data.id;

      console.log("\n5. Fetching declared emergency details...");
      const emDetails = await request('GET', `/emergencies/${emId}`, null, authHeader);
      console.log("Emergency Details Status:", emDetails.status);
      console.log("Emergency Details Sample:", JSON.stringify(emDetails.data, null, 2));

      console.log("\n6. Adding a Case to this emergency...");
      const caseRes = await request('POST', `/emergencies/${emId}/cases`, {
        acuity_score: 4,
        required_resource_types: ['icu_bed', 'staff']
      }, authHeader);
      console.log("Add Case Status:", caseRes.status);
      console.log("Add Case Data:", JSON.stringify(caseRes.data, null, 2));
    }

  } catch (err) {
    console.error("Test error:", err);
  }
}

runTests();
