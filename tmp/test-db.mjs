
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testConnection() {
  console.log('Testing Database Connection...');
  console.log('URL ends with:', process.env.DATABASE_URL.slice(-20));
  
  try {
    const start = Date.now();
    const result = await pool.query('SELECT NOW()');
    console.log('SUCCESS:', result.rows[0]);
    console.log('Time:', Date.now() - start, 'ms');
  } catch (err) {
    console.error('FAILED:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
  } finally {
    await pool.end();
  }
}

testConnection();
