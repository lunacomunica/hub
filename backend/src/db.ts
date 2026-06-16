import { Pool, QueryResult, QueryResultRow } from 'pg';

function buildConnectionString(): string {
  const url = process.env.DATABASE_URL || '';
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'connect_timeout=10';
}

const pool = new Pool({
  connectionString: buildConnectionString(),
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool de conexão PostgreSQL:', err);
});

// Wraps pool.query with a hard timeout so serverless functions never hang
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  const TIMEOUT_MS = 9000; // 9s — stays under Vercel Hobby 10s function limit
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Database query timed out after 9s')),
      TIMEOUT_MS
    );
  });

  try {
    const result = await Promise.race([
      pool.query<T>(text, values),
      timeoutPromise,
    ]);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export default pool;
