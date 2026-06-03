const { Client } = require('pg');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'survei_online',
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    // Admin credentials
    const adminEmail = 'admin@survei.com';
    const adminPassword = 'Admin123!';
    const adminPhone = '081200000001';

    // Super Admin credentials
    const superAdminEmail = 'superadmin@survei.com';
    const superAdminPassword = 'SuperAdmin123!';
    const superAdminPhone = '081200000000';

    // Hash passwords
    const adminHash = await bcrypt.hash(adminPassword, 10);
    const superAdminHash = await bcrypt.hash(superAdminPassword, 10);

    // Insert Super Admin
    const superAdminId = uuidv4();
    await client.query(`
      INSERT INTO users (id, email, phone, password_hash, full_name, role, status, email_verified, profile_completed)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        email_verified = EXCLUDED.email_verified,
        profile_completed = EXCLUDED.profile_completed
    `, [superAdminId, superAdminEmail, superAdminPhone, superAdminHash, 'Super Administrator', 'super_admin', 'active', true, true]);
    console.log('✓ Super Admin created/updated');

    // Insert Admin
    const adminId = uuidv4();
    await client.query(`
      INSERT INTO users (id, email, phone, password_hash, full_name, role, status, email_verified, profile_completed)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        email_verified = EXCLUDED.email_verified,
        profile_completed = EXCLUDED.profile_completed
    `, [adminId, adminEmail, adminPhone, adminHash, 'Administrator', 'admin', 'active', true, true]);
    console.log('✓ Admin created/updated');

    // Insert sample Respondent
    const respondentEmail = 'responden@survei.com';
    const respondentPassword = 'Responden123!';
    const respondentHash = await bcrypt.hash(respondentPassword, 10);
    const respondentId = uuidv4();
    await client.query(`
      INSERT INTO users (id, email, phone, password_hash, full_name, role, status, email_verified, profile_completed)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        email_verified = EXCLUDED.email_verified,
        profile_completed = EXCLUDED.profile_completed
    `, [respondentId, respondentEmail, '081200000002', respondentHash, 'Responden Demo', 'respondent', 'active', true, true]);
    console.log('✓ Responden Demo created/updated');

    console.log('\n========================================');
    console.log('  SEED DATA BERHASIL DIBUAT');
    console.log('========================================');
    console.log('');
    console.log('  Super Admin:');
    console.log(`    Email    : ${superAdminEmail}`);
    console.log(`    Password : ${superAdminPassword}`);
    console.log('');
    console.log('  Admin:');
    console.log(`    Email    : ${adminEmail}`);
    console.log(`    Password : ${adminPassword}`);
    console.log('');
    console.log('  Responden:');
    console.log(`    Email    : ${respondentEmail}`);
    console.log(`    Password : ${respondentPassword}`);
    console.log('');
    console.log('========================================');

    await client.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
