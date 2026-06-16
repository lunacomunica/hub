import { query } from '../db';

// Words that carry no semantic meaning in Brazilian bank statement descriptions
const STOPWORDS = new Set([
  'pago', 'pgto', 'pix', 'ted', 'doc', 'via', 'transferencia', 'transfere',
  'recebido', 'enviado', 'pagamento', 'debito', 'credito', 'compra', 'saque',
  'deposito', 'banco', 'agencia', 'conta', 'para', 'cartao', 'fatura', 'parcela',
  'ltda', 'eireli', 'eire', 'brasil', 'internet', 'servico', 'servicos',
  'comercio', 'cobranca', 'numero', 'cnpj', 'cpf', 'taxa', 'tarifa',
  'nota', 'nfse', 'nfe', 'emissao', 'boleto', 'juros', 'multa', 'desconto',
  'estorno', 'ressarcimento', 'devolucao', 'chave', 'cred', 'deb', 'comp',
  'inst', 'instit', 'corp', 'ltda', 'eireli', 'mei', 'cnpj', 'cpf',
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractKeywords(description: string): string[] {
  const norm = normalize(description);
  const words = norm.split(' ').filter(
    w => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w)
  );

  const keywords = new Set<string>([norm]);
  words.forEach(w => keywords.add(w));

  // bigrams (pairs of consecutive meaningful words)
  for (let i = 0; i < words.length - 1; i++) {
    keywords.add(`${words[i]} ${words[i + 1]}`);
  }

  return [...keywords].slice(0, 20); // cap to avoid excessive DB writes
}

// Lazy table creation — runs once per process instance
let _tableInit: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (_tableInit) return _tableInit;
  _tableInit = (async () => {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS categorization_rules (
          id          SERIAL PRIMARY KEY,
          keyword     TEXT        NOT NULL,
          trans_type  VARCHAR(20) NOT NULL CHECK (trans_type IN ('revenue', 'expense')),
          category_id INTEGER REFERENCES financial_categories(id) ON DELETE SET NULL,
          supplier    TEXT,
          usage_count INTEGER     DEFAULT 1,
          updated_at  TIMESTAMP   DEFAULT NOW(),
          UNIQUE(keyword, trans_type)
        )
      `);
    } catch (err) {
      console.error('[categorization] ensureTable error:', err);
      _tableInit = null; // allow retry on next call
    }
  })();
  return _tableInit;
}

export async function suggestForDescription(
  description: string,
  type: 'revenue' | 'expense'
): Promise<{ category_id?: number; supplier?: string }> {
  await ensureTable();
  const keywords = extractKeywords(description);
  if (keywords.length === 0) return {};

  try {
    // 1. Check learned categorization rules first (highest priority)
    const { rows } = await query<{ category_id: number | null; supplier: string | null }>(
      `SELECT category_id, supplier
       FROM categorization_rules
       WHERE trans_type = $1 AND keyword = ANY($2::text[])
       ORDER BY usage_count DESC, LENGTH(keyword) DESC
       LIMIT 1`,
      [type, keywords]
    );
    if (rows.length > 0) {
      return {
        category_id: rows[0].category_id ?? undefined,
        supplier:    rows[0].supplier    ?? undefined,
      };
    }
  } catch (e) {
    console.error('[categorization] suggest error:', e);
  }

  // 2. For expenses only: try matching against active employee names
  //    e.g. "PIX ADRIANO PEREIRA DE CAMARGO" → supplier = employee full name
  if (type === 'expense') {
    try {
      const { rows: employees } = await query<{ id: number; name: string }>(
        "SELECT id, name FROM employees WHERE status != 'inativo'"
      );
      const normDesc = normalize(description);
      for (const emp of employees) {
        const normName = normalize(emp.name);
        const nameWords = normName.split(' ').filter(w => w.length >= 4);
        // Need at least 2 significant name words to appear in the description
        const hits = nameWords.filter(w => normDesc.includes(w));
        if (hits.length >= Math.min(2, nameWords.length)) {
          return { supplier: emp.name };
        }
      }
    } catch (e) {
      console.error('[categorization] employee match error:', e);
    }
  }

  return {};
}

export async function saveRule(
  description: string,
  type: 'revenue' | 'expense',
  category_id?: number | null,
  supplier?: string | null
): Promise<void> {
  if (!category_id && !supplier) return;
  await ensureTable();
  const keywords = extractKeywords(description);

  for (const keyword of keywords) {
    try {
      await query(
        `INSERT INTO categorization_rules (keyword, trans_type, category_id, supplier, usage_count)
         VALUES ($1, $2, $3, $4, 1)
         ON CONFLICT (keyword, trans_type) DO UPDATE SET
           category_id = COALESCE(EXCLUDED.category_id, categorization_rules.category_id),
           supplier    = COALESCE(EXCLUDED.supplier,    categorization_rules.supplier),
           usage_count = categorization_rules.usage_count + 1,
           updated_at  = NOW()`,
        [keyword, type, category_id ?? null, supplier ?? null]
      );
    } catch (e) {
      console.error('[categorization] saveRule error:', e);
    }
  }
}
