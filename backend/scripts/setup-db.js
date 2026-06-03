const { Client } = require('pg');

async function main() {
  console.log('Attempting to connect to PostgreSQL...');
  console.log('Host: localhost, Port: 5432, User: postgres, DB: postgres');
  
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL!');
    
    const versionResult = await client.query('SELECT version()');
    console.log('PostgreSQL version:', versionResult.rows[0].version);

    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'survei_online'"
    );

    if (result.rows.length === 0) {
      await client.query('CREATE DATABASE survei_online');
      console.log('Database "survei_online" created!');
    } else {
      console.log('Database "survei_online" already exists.');
    }

    await client.end();

    const appClient = new Client({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'postgres',
      database: 'survei_online',
    });

    await appClient.connect();
    await appClient.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await appClient.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('Extensions enabled.');
    await appClient.end();

    console.log('Setup complete!');
  } catch (error) {
    console.error('Connection failed:', error.message);
    console.error('Full error:', JSON.stringify(error, null, 2));
    process.exit(1);
  }
}

main();
