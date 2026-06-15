import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth';
import pool from '../db';

const router = Router();

// ─── Multer setup ────────────────────────────────────────────────────────────

const UPLOAD_DIR = '/tmp/uploads/payslips';
const PHOTO_DIR = '/tmp/uploads/photos';
const TEMP_DIR = '/tmp/uploads/temp';

[UPLOAD_DIR, PHOTO_DIR, TEMP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PHOTO_DIR),
  filename: (req, _file, cb) => cb(null, `employee-${(req as AuthRequest).params?.id || Date.now()}.jpg`),
});
const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  },
});

// Multer for batch PDF (temp storage)
const uploadBatch = multer({
  dest: TEMP_DIR,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Apenas PDFs são permitidos'));
  },
});

// ─── PDF batch parsing helpers ────────────────────────────────────────────────

interface ParsedEmployee {
  name_in_pdf: string;
  gross: number;
  deductions: number;
  net: number;
}

interface ParseResult extends ParsedEmployee {
  matched_employee_id: number | null;
  matched_employee_name: string | null;
  confidence: 'alta' | 'media' | 'baixa' | 'nao_encontrado';
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchEmployee(
  pdfName: string,
  employees: { id: number; name: string }[],
): { id: number; name: string; confidence: ParseResult['confidence'] } | null {
  const norm = normalizeName(pdfName);

  // Exact
  const exact = employees.find(e => normalizeName(e.name) === norm);
  if (exact) return { id: exact.id, name: exact.name, confidence: 'alta' };

  // All significant words match
  const pdfWords = norm.split(' ').filter(w => w.length > 2);
  const partial = employees.find(e => {
    const empWords = normalizeName(e.name).split(' ').filter(w => w.length > 2);
    const hits = pdfWords.filter(w => empWords.includes(w));
    return hits.length >= Math.min(2, pdfWords.length);
  });
  if (partial) return { id: partial.id, name: partial.name, confidence: 'media' };

  // First name only
  if (pdfWords.length > 0) {
    const first = employees.find(e =>
      normalizeName(e.name).split(' ')[0] === pdfWords[0],
    );
    if (first) return { id: first.id, name: first.name, confidence: 'baixa' };
  }

  return null;
}

function parseBR(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
}

async function parseBatchPDF(filePath: string): Promise<ParsedEmployee[]> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  const text: string = data.text;

  const results: ParsedEmployee[] = [];
  const seen = new Set<string>();

  // Split on company header (each page copy starts with it)
  const parts = text.split(/LUNA\s+COMUNICACAO\s+LTDA/i);

  for (let i = 1; i < parts.length; i++) {
    const section = parts[i];

    // Name: ALL CAPS line between "Código" and "Nome do Funcionário"
    const nameMatch = section.match(
      /C[oó]digo\s*\n\s*([A-ZÁÀÂÃÄÇÉÊÍÓÔÕÚÜ][A-ZÁÀÂÃÄÇÉÊÍÓÔÕÚÜ ]+?)\s*\n/,
    );
    if (!nameMatch) continue;

    const name = nameMatch[1].trim();
    if (!name || seen.has(name)) continue; // skip 2nd copy
    seen.add(name);

    // Values: 3 BR-formatted numbers after "Declaro ter recebido"
    const valMatch = section.match(
      /Declaro[^\d]*([\d.]+,\d{2})\s*([\d.]+,\d{2})\s*([\d.]+,\d{2})/,
    );
    if (!valMatch) continue;

    results.push({
      name_in_pdf: name,
      gross: parseBR(valMatch[1]),
      deductions: parseBR(valMatch[2]),
      net: parseBR(valMatch[3]),
    });
  }

  return results;
}

// ─── Provisions helper ───────────────────────────────────────────────────────

function calcProvisions(employee: {
  salary: number;
  admission_date: string;
  status: string;
}) {
  if (employee.status === 'inativo') {
    return { monthly_provision: 0, ferias_accrued: 0, decimo_accrued: 0 };
  }

  const salary = Number(employee.salary);
  const admission = new Date(employee.admission_date);
  const today = new Date();

  // months between admission and today
  const months_at_company =
    (today.getFullYear() - admission.getFullYear()) * 12 +
    (today.getMonth() - admission.getMonth());

  // Férias provision (monthly): salary * (4/3) / 12
  // 13º provision (monthly): salary / 12
  // Total: salary * 7 / 36
  const monthly_provision = (salary * 7) / 36;

  // Accrued férias for current 12-month period
  const months_in_period = months_at_company % 12;
  const ferias_accrued = ((salary * 4) / 3 / 12) * months_in_period;

  // Accrued 13º for current year (0-indexed month = months elapsed)
  const current_month = today.getMonth(); // 0 = Jan
  const decimo_accrued = (salary / 12) * current_month;

  return { monthly_provision, ferias_accrued, decimo_accrued };
}

// ─── GET / — list all employees ──────────────────────────────────────────────

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { rows: employees } = await pool.query('SELECT * FROM employees ORDER BY name ASC');

    const result = employees.map((emp: any) => ({
      ...emp,
      provisions: calcProvisions(emp),
    }));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST / — create employee ─────────────────────────────────────────────────

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      cpf,
      email,
      phone,
      role,
      department,
      salary,
      admission_date,
      status,
      notes,
      avatar_color,
    } = req.body;

    if (!name || !role || salary === undefined || !admission_date) {
      return res.status(400).json({ error: 'Campos obrigatórios: name, role, salary, admission_date' });
    }

    const { rows: [created] } = await pool.query(
      `INSERT INTO employees (name, cpf, email, phone, role, department, salary, admission_date, status, notes, avatar_color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        name,
        cpf ?? null,
        email ?? null,
        phone ?? null,
        role,
        department ?? null,
        Number(salary),
        admission_date,
        status ?? 'ativo',
        notes ?? null,
        avatar_color ?? '#6366f1',
      ]
    );

    res.status(201).json({ ...created, provisions: calcProvisions(created) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /:id — update employee ───────────────────────────────────────────────

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rows: [employee] } = await pool.query('SELECT * FROM employees WHERE id = $1', [Number(id)]);
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado' });

    const fields = ['name', 'cpf', 'email', 'phone', 'role', 'department', 'salary', 'admission_date', 'status', 'notes', 'avatar_color'];
    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramIdx++}`);
        values.push(req.body[field]);
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    updates.push(`updated_at = NOW()`);
    values.push(Number(id));

    await pool.query(`UPDATE employees SET ${updates.join(', ')} WHERE id = $${paramIdx}`, values);

    const { rows: [updated] } = await pool.query('SELECT * FROM employees WHERE id = $1', [Number(id)]);
    res.json({ ...updated, provisions: calcProvisions(updated) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /:id — soft deactivate ───────────────────────────────────────────

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rows: [employee] } = await pool.query('SELECT id FROM employees WHERE id = $1', [Number(id)]);
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado' });

    await pool.query(`UPDATE employees SET status = 'inativo', updated_at = NOW() WHERE id = $1`, [Number(id)]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/salary-change ──────────────────────────────────────────────────

router.post('/:id/salary-change', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rows: [employee] } = await pool.query('SELECT * FROM employees WHERE id = $1', [Number(id)]);
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado' });

    const { new_salary, new_role, change_date, reason } = req.body;
    if (new_salary === undefined || !change_date) {
      return res.status(400).json({ error: 'Campos obrigatórios: new_salary, change_date' });
    }

    // Record history
    await pool.query(
      `INSERT INTO employee_salary_history (employee_id, previous_salary, new_salary, previous_role, new_role, change_date, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        Number(id),
        employee.salary,
        Number(new_salary),
        employee.role,
        new_role ?? employee.role,
        change_date,
        reason ?? null,
      ]
    );

    // Update employee
    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (new_role) {
      updates.push(`role = $${paramIdx++}`);
      values.push(new_role);
    }
    updates.push(`salary = $${paramIdx++}`);
    values.push(Number(new_salary));
    updates.push(`updated_at = NOW()`);
    values.push(Number(id));

    await pool.query(`UPDATE employees SET ${updates.join(', ')} WHERE id = $${paramIdx}`, values);

    const { rows: [updated] } = await pool.query('SELECT * FROM employees WHERE id = $1', [Number(id)]);
    res.json({ ...updated, provisions: calcProvisions(updated) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id/overtime ────────────────────────────────────────────────────────

router.get('/:id/overtime', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { month, year } = req.query;

    let query = 'SELECT * FROM employee_overtime WHERE employee_id = $1';
    const params: any[] = [Number(id)];
    let paramIdx = 2;

    if (month && year) {
      const m = String(month).padStart(2, '0');
      query += ` AND date >= $${paramIdx++} AND date <= $${paramIdx++}`;
      params.push(`${year}-${m}-01`, `${year}-${m}-31`);
    } else if (year) {
      query += ` AND date >= $${paramIdx++} AND date <= $${paramIdx++}`;
      params.push(`${year}-01-01`, `${year}-12-31`);
    }

    query += ' ORDER BY date DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/overtime ───────────────────────────────────────────────────────

router.post('/:id/overtime', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rows: [employee] } = await pool.query('SELECT id FROM employees WHERE id = $1', [Number(id)]);
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado' });

    const { date, hours, rate_multiplier = 1.5, value, notes } = req.body;
    if (!date || hours === undefined || value === undefined) {
      return res.status(400).json({ error: 'Campos obrigatórios: date, hours, value' });
    }

    const { rows: [created] } = await pool.query(
      `INSERT INTO employee_overtime (employee_id, date, hours, rate_multiplier, value, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [Number(id), date, Number(hours), Number(rate_multiplier), Number(value), notes ?? null]
    );

    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /:id/overtime/:oid ────────────────────────────────────────────────

router.delete('/:id/overtime/:oid', async (req: AuthRequest, res: Response) => {
  try {
    const { id, oid } = req.params;
    const { rows: [row] } = await pool.query(
      'SELECT id FROM employee_overtime WHERE id = $1 AND employee_id = $2',
      [Number(oid), Number(id)]
    );
    if (!row) return res.status(404).json({ error: 'Registro não encontrado' });

    await pool.query('DELETE FROM employee_overtime WHERE id = $1', [Number(oid)]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id/payslips ────────────────────────────────────────────────────────

router.get('/:id/payslips', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT id, employee_id, month, year, filename, gross_salary, net_salary, deductions, created_at
       FROM employee_payslips WHERE employee_id = $1 ORDER BY year DESC, month DESC`,
      [Number(id)]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/payslips — upload ──────────────────────────────────────────────

router.post('/:id/payslips', upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rows: [employee] } = await pool.query('SELECT id FROM employees WHERE id = $1', [Number(id)]);
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado' });

    if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });

    const { month, year, gross_salary, net_salary, deductions } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'Campos obrigatórios: month, year' });

    const { rows: [created] } = await pool.query(
      `INSERT INTO employee_payslips (employee_id, month, year, filename, filepath, gross_salary, net_salary, deductions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        Number(id),
        Number(month),
        Number(year),
        req.file.originalname,
        req.file.filename,
        gross_salary ? Number(gross_salary) : null,
        net_salary ? Number(net_salary) : null,
        deductions ? Number(deductions) : null,
      ]
    );

    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id/payslips/:pid/download ─────────────────────────────────────────

router.get('/:id/payslips/:pid/download', async (req: AuthRequest, res: Response) => {
  try {
    const { id, pid } = req.params;
    const { rows: [payslip] } = await pool.query(
      'SELECT * FROM employee_payslips WHERE id = $1 AND employee_id = $2',
      [Number(pid), Number(id)]
    );
    if (!payslip) return res.status(404).json({ error: 'Holerite não encontrado' });

    const filePath = path.join(UPLOAD_DIR, payslip.filepath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${payslip.filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /:id/payslips/:pid ────────────────────────────────────────────────

router.delete('/:id/payslips/:pid', async (req: AuthRequest, res: Response) => {
  try {
    const { id, pid } = req.params;
    const { rows: [payslip] } = await pool.query(
      'SELECT * FROM employee_payslips WHERE id = $1 AND employee_id = $2',
      [Number(pid), Number(id)]
    );
    if (!payslip) return res.status(404).json({ error: 'Holerite não encontrado' });

    const filePath = path.join(UPLOAD_DIR, payslip.filepath);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch { /* ignore if already gone */ }
    }

    await pool.query('DELETE FROM employee_payslips WHERE id = $1', [Number(pid)]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id/feedbacks ───────────────────────────────────────────────────────

router.get('/:id/feedbacks', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM employee_feedbacks WHERE employee_id = $1 ORDER BY date DESC',
      [Number(id)]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/feedbacks ──────────────────────────────────────────────────────

router.post('/:id/feedbacks', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rows: [employee] } = await pool.query('SELECT id FROM employees WHERE id = $1', [Number(id)]);
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado' });

    const { author, type = 'positivo', content, rating, date } = req.body;
    if (!author || !content || !date) {
      return res.status(400).json({ error: 'Campos obrigatórios: author, content, date' });
    }

    const { rows: [created] } = await pool.query(
      `INSERT INTO employee_feedbacks (employee_id, author, type, content, rating, date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [Number(id), author, type, content, rating ? Number(rating) : null, date]
    );

    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /:id/feedbacks/:fid ───────────────────────────────────────────────

router.delete('/:id/feedbacks/:fid', async (req: AuthRequest, res: Response) => {
  try {
    const { id, fid } = req.params;
    const { rows: [row] } = await pool.query(
      'SELECT id FROM employee_feedbacks WHERE id = $1 AND employee_id = $2',
      [Number(fid), Number(id)]
    );
    if (!row) return res.status(404).json({ error: 'Feedback não encontrado' });

    await pool.query('DELETE FROM employee_feedbacks WHERE id = $1', [Number(fid)]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id/salary-changes ─────────────────────────────────────────────────

router.get('/:id/salary-changes', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM employee_salary_history WHERE employee_id = $1 ORDER BY change_date DESC',
      [Number(req.params.id)]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /payslips/batch-parse ───────────────────────────────────────────────

router.post('/payslips/batch-parse', uploadBatch.single('pdf'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'PDF obrigatório' });

  try {
    const parsed = await parseBatchPDF(req.file.path);

    if (parsed.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(422).json({ error: 'Não foi possível extrair funcionários do PDF. Verifique o formato.' });
    }

    const { rows: employees } = await pool.query<{ id: number; name: string }>(
      "SELECT id, name FROM employees WHERE status != 'inativo'"
    );

    const results: ParseResult[] = parsed.map(p => {
      const match = matchEmployee(p.name_in_pdf, employees);
      return {
        ...p,
        matched_employee_id: match?.id ?? null,
        matched_employee_name: match?.name ?? null,
        confidence: match?.confidence ?? 'nao_encontrado',
      };
    });

    res.json({
      temp_id: path.basename(req.file.path),
      results,
      total: results.length,
    });
  } catch (err: any) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /payslips/batch-save ────────────────────────────────────────────────

router.post('/payslips/batch-save', async (req: AuthRequest, res: Response) => {
  try {
    const { temp_id, month, year, entries } = req.body;

    if (!temp_id || !month || !year || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Campos obrigatórios: temp_id, month, year, entries' });
    }

    const tempPath = path.join(TEMP_DIR, String(temp_id));
    if (!fs.existsSync(tempPath)) {
      return res.status(404).json({ error: 'Arquivo temporário não encontrado. Faça o upload novamente.' });
    }

    // Move to permanent storage
    const permanentFilename = `folha-${year}-${String(month).padStart(2, '0')}-${Date.now()}.pdf`;
    const permanentPath = path.join(UPLOAD_DIR, permanentFilename);
    fs.renameSync(tempPath, permanentPath);

    let saved = 0;
    const errors: string[] = [];

    for (const entry of entries as any[]) {
      try {
        const { rows: [emp] } = await pool.query('SELECT name FROM employees WHERE id = $1', [Number(entry.employee_id)]);
        if (!emp) { errors.push(`ID ${entry.employee_id} não encontrado`); continue; }

        await pool.query(
          `INSERT INTO employee_payslips (employee_id, month, year, filename, filepath, gross_salary, net_salary, deductions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            Number(entry.employee_id),
            Number(month),
            Number(year),
            permanentFilename,
            permanentFilename,
            Number(entry.gross),
            Number(entry.net),
            Number(entry.deductions),
          ]
        );
        saved++;
      } catch (err: any) {
        errors.push(`Erro ao salvar ${entry.employee_id}: ${err.message}`);
      }
    }

    res.json({ saved, errors });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id — single employee ──────────────────────────────────────────────

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { rows: [emp] } = await pool.query('SELECT * FROM employees WHERE id = $1', [Number(req.params.id)]);
    if (!emp) return res.status(404).json({ error: 'Funcionário não encontrado' });
    res.json({ ...emp, provisions: calcProvisions(emp) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/photo — upload employee photo ─────────────────────────────────

router.post('/:id/photo', uploadPhoto.single('photo'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rows: [emp] } = await pool.query('SELECT id, photo_path FROM employees WHERE id = $1', [Number(id)]);
    if (!emp) return res.status(404).json({ error: 'Funcionário não encontrado' });

    // Remove old photo file if exists
    if (emp.photo_path && fs.existsSync(emp.photo_path)) {
      fs.unlinkSync(emp.photo_path);
    }

    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

    await pool.query('UPDATE employees SET photo_path = $1, updated_at = NOW() WHERE id = $2', [req.file.path, Number(id)]);

    res.json({ success: true, filename: req.file.filename });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id/photo — serve employee photo ────────────────────────────────────

router.get('/:id/photo', async (req: AuthRequest, res: Response) => {
  try {
    const { rows: [emp] } = await pool.query('SELECT photo_path FROM employees WHERE id = $1', [Number(req.params.id)]);
    if (!emp || !emp.photo_path || !fs.existsSync(emp.photo_path)) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }
    res.sendFile(path.resolve(emp.photo_path));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
