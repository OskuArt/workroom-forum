const fs = require('fs');
const p = 'app/server.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
`const pool = new Pool({\n  connectionString: DATABASE_URL,\n  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,\n  max: 10,\n});`,
`const pool = new Pool({\n  connectionString: DATABASE_URL,\n  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,\n  max: 10,\n  options: "-c search_path=constellation,public",\n});`
);
s = s.replace(
'  await pool.query(`\n    CREATE TABLE IF NOT EXISTS schema_versions(',
'  await pool.query(`\n    CREATE SCHEMA IF NOT EXISTS constellation;\n    SET search_path TO constellation, public;\n    CREATE TABLE IF NOT EXISTS schema_versions('
);
fs.writeFileSync(p, s);
console.log('Applied isolated Postgres schema: constellation');
