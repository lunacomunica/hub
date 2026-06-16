import { Router, Response } from 'express';
import multer from 'multer';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { suggestForDescription } from '../utils/categorization';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

interface ParsedRow {
  date: string;       // YYYY-MM-DD
  description: string;
  amount: number;     // always positive
  credit: boolean;    // true = entrada (receita), false = saída (despesa)
}

// ── OFX Parser ─────────────────────────────────────────────────────────────
function parseOFX(content: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;
  while ((match = trnRegex.exec(content)) !== null) {
    const block = match[1];
    const dateRaw = (/<DTPOSTED>([\d]{8})/i.exec(block) || [])[1];
    const amtRaw  = (/<TRNAMT>([-\d.,]+)/i.exec(block) || [])[1];
    const memo    = (/<MEMO>([^\r\n<]+)/i.exec(block) || (/<NAME>([^\r\n<]+)/i.exec(block) || []))[1] || '';

    if (!dateRaw || !amtRaw) continue;
    const date = `${dateRaw.slice(0,4)}-${dateRaw.slice(4,6)}-${dateRaw.slice(6,8)}`;
    const raw = parseFloat(amtRaw.replace(',', '.'));
    if (!raw) continue;
    rows.push({ date, description: memo.trim(), amount: Math.abs(raw), credit: raw > 0 });
  }
  return rows;
}

// ── CSV Parser ──────────────────────────────────────────────────────────────
function parseCSV(content: string): ParsedRow[] {
  // Normalize line endings and encoding artifacts
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter
  const delim = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delim).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  function findCol(aliases: string[]): number {
    for (const alias of aliases) {
      const idx = headers.findIndex(h => h.includes(alias));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  const dateCol   = findCol(['data', 'date', 'dt']);
  const descCol   = findCol(['histórico', 'historico', 'descrição', 'descricao', 'description', 'memo', 'lançamento', 'lancamento']);
  const amtCol    = findCol(['valor', 'value', 'amount', 'crédito', 'credito', 'débito', 'debito']);
  const valueCol  = amtCol;

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < 2) continue;

    const rawDate  = cols[dateCol >= 0 ? dateCol : 0] || '';
    const rawDesc  = cols[descCol >= 0 ? descCol : 1] || '';
    const rawAmt   = cols[valueCol >= 0 ? valueCol : 2] || '';

    // Parse date: DD/MM/YYYY or YYYY-MM-DD
    let date = '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
      const [d, m, y] = rawDate.split('/');
      date = `${y}-${m}-${d}`;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
      date = rawDate.slice(0, 10);
    } else {
      continue;
    }

    const raw = parseFloat(rawAmt.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
    if (!raw || isNaN(raw)) continue;

    rows.push({ date, description: rawDesc.trim(), amount: Math.abs(raw), credit: raw > 0 });
  }
  return rows;
}

// ── POST /api/import/preview ─────────────────────────────────────────────────
// Query param: ?filter=revenue  → only positive (credits)
//              ?filter=expense  → only negative (debits)
//              (omitted)        → all transactions
router.post('/preview', requireAuth, upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  const content = req.file.buffer.toString('utf-8');
  const filename = req.file.originalname.toLowerCase();
  const filter = (req.query.filter as string) || '';

  let rows: ParsedRow[];
  if (filename.endsWith('.ofx') || content.includes('<OFX>') || content.includes('<ofx>')) {
    rows = parseOFX(content);
  } else {
    rows = parseCSV(content);
  }

  // Auto-filter by transaction direction when requested
  if (filter === 'revenue') rows = rows.filter(r => r.credit);
  if (filter === 'expense') rows = rows.filter(r => !r.credit);

  if (rows.length === 0) {
    return res.status(422).json({ error: 'Nenhuma transação encontrada. Se o arquivo mistura entradas e saídas, o sistema filtrou apenas as relevantes para esta página.' });
  }

  // Enrich with auto-category/supplier suggestions (non-blocking — failures are silently skipped)
  const transType = (filter === 'revenue' ? 'revenue' : 'expense') as 'revenue' | 'expense';
  const enriched = await Promise.all(
    rows.map(async ({ credit: _c, ...r }) => {
      const suggestion = await suggestForDescription(r.description, transType).catch(() => ({}));
      return { ...r, ...suggestion };
    })
  );

  return res.json({ rows: enriched, total: enriched.length });
});

export default router;
