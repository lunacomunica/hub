import { Pool } from 'pg';

// Add TCP-level connect_timeout so cold-start connections don't hang forever
function buildConnectionString(): string {
  const url = process.env.DATABASE_URL || '';
  const sep = url.includes('?') ? '&' : '?';
  // connect_timeout (seconds) is the PostgreSQL wire-protocol TCP timeout
  return url + sep + 'connect_timeout=10';
}

const pool = new Pool({
  connectionString: buildConnectionString(),
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // wait up to 10s to get a connection from the pool
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool de conexão PostgreSQL:', err);
});

export default pool;
