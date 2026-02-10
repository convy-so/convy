import dns from 'dns';
import net from 'net';
import https from 'https';

const API_HOST = 'api.deepgram.com';
const API_KEY = '7646ba60f5513247622106244f30c681d8942879';

console.log('--- Deepgram Connectivity Diagnostic ---');
console.log(`Time: ${new Date().toISOString()}`);
console.log(`API Key set: ${!!API_KEY} (Length: ${API_KEY?.length})`);

async function testDNS() {
  console.log('\n1. Testing DNS Resolution...');
  try {
    const addresses = await new Promise<string[]>((resolve, reject) => {
      dns.resolve4(API_HOST, (err, addresses) => {
        if (err) reject(err);
        else resolve(addresses);
      });
    });
    console.log('✅ DNS Resolved:', addresses);
    return addresses[0];
  } catch (err) {
    console.error('❌ DNS Resolution Failed:', err);
    return null;
  }
}

async function testTCP(ip: string) {
  console.log(`\n2. Testing TCP Connection to ${ip}:443...`);
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);
    
    const startTime = Date.now();
    socket.connect(443, ip, () => {
      const time = Date.now() - startTime;
      console.log(`✅ TCP Connection Successful (${time}ms)`);
      socket.end();
      resolve(true);
    });

    socket.on('timeout', () => {
      console.error('❌ TCP Connection Timed Out (5000ms)');
      socket.destroy();
      resolve(false);
    });

    socket.on('error', (err) => {
      console.error('❌ TCP Connection Error:', err.message);
      resolve(false);
    });
  });
}

async function testAPIAuth() {
  console.log('\n3. Testing API Authentication (GET /v1/projects)...');
  return new Promise<void>((resolve) => {
    const options = {
      hostname: API_HOST,
      port: 443,
      path: '/v1/projects',
      method: 'GET',
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      console.log(`Response Status: ${res.statusCode}`);
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ API Auth Successful');
          try {
            const projects = JSON.parse(data);
             console.log(`   Found ${projects.projects?.length || 0} projects.`);
          } catch (e) { console.log('   (Could not parse response body)'); }
        } else {
          console.error('❌ API Auth Failed:', res.statusCode, res.statusMessage);
          console.error('   Body:', data);
        }
        resolve();
      });
    });

    req.on('timeout', () => {
      console.error('❌ API Request Timed Out (10000ms)');
      req.destroy();
      resolve();
    });

    req.on('error', (err) => {
      console.error('❌ API Request Error:', err.message);
      resolve();
    });

    req.end();
  });
}

async function run() {
  const ip = await testDNS();
  if (ip) {
    const tcpSuccess = await testTCP(ip);
    if (tcpSuccess) {
      if (!API_KEY) {
        console.error('❌ Skipping Auth Check: No API Key found in env');
      } else {
        await testAPIAuth();
      }
    } else {
      console.error('⚠️ Skipping Auth Check due to TCP failure');
    }
  }
  console.log('\n--- End of Diagnostic ---');
  process.exit(0);
}

run();
