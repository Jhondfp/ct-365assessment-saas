const fs = require('fs');
const path = require('path');
const logger = require('./config/logger');
const { getControlPlaneConnection } = require('./services/database');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

// Ensure migrations tracking table exists
async function ensureMigrationsTable(pool) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } catch (err) {
    logger.error(`Error creating migrations table: ${err.message}`);
    throw err;
  }
}

// Get list of applied migrations
async function getAppliedMigrations(pool) {
  try {
    const result = await pool.query('SELECT name FROM schema_migrations ORDER BY id');
    return result.rows.map(row => row.name);
  } catch (err) {
    logger.error(`Error getting applied migrations: ${err.message}`);
    throw err;
  }
}

// Read migration files
function getMigrationFiles() {
  try {
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .sort();
    return files;
  } catch (err) {
    logger.error(`Error reading migration files: ${err.message}`);
    throw err;
  }
}

// Execute a migration
async function executeMigration(pool, migrationName, migrationPath) {
  try {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Split by semicolon and filter empty statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    // Execute each statement
    for (const statement of statements) {
      await pool.query(statement);
    }

    // Record migration as applied
    await pool.query(
      'INSERT INTO schema_migrations (name) VALUES ($1)',
      [migrationName]
    );

    logger.info(`✓ Migration executed: ${migrationName}`);
  } catch (err) {
    logger.error(`Error executing migration ${migrationName}: ${err.message}`);
    throw err;
  }
}

// Main migration runner
async function runMigrations() {
  let pool;
  try {
    logger.info('Starting database migrations...');

    // Get control plane connection
    pool = await getControlPlaneConnection();

    // Ensure migrations table exists
    await ensureMigrationsTable(pool);

    // Get list of migration files
    const migrationFiles = getMigrationFiles();
    logger.info(`Found ${migrationFiles.length} migration files`);

    // Get list of already applied migrations
    const appliedMigrations = await getAppliedMigrations(pool);
    logger.info(`${appliedMigrations.length} migrations already applied`);

    // Execute pending migrations
    let executedCount = 0;
    for (const file of migrationFiles) {
      if (appliedMigrations.includes(file)) {
        logger.debug(`Skipping already applied migration: ${file}`);
        continue;
      }

      const migrationPath = path.join(MIGRATIONS_DIR, file);
      await executeMigration(pool, file, migrationPath);
      executedCount++;
    }

    if (executedCount === 0) {
      logger.info('✓ All migrations are up to date');
    } else {
      logger.info(`✓ Successfully executed ${executedCount} migration(s)`);
    }

    return true;
  } catch (err) {
    logger.error(`Migration failed: ${err.message}`);
    logger.error(err.stack);
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
      logger.error(err);
      process.exit(1);
    });
}

module.exports = { runMigrations };
