import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth';
import db from '../db';

const router = Router();

// ─── Multer setup ────────────────────────────────────────────────────────────

const UPLOAD_DIR = path.join(__dirname, '../../../uploads/payslips');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PHOTO_DIR = path.join(__dirname, '../../../uploads/photos');
if (!fs.existsSync(PHOTO_DIR)) fs.mkdirSync(PHOTO_DIR, { recursive: true });

const TEMP_DIR = path.join(__dirname, '../../../uploads/temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

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

  const salary = employee.salary;
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

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const employees = db.prepare('SELECT * FROM employees ORDER BY name ASC').all() as any[];

    const result = employees.map((emp) => ({
      ...emp,
      provisions: calcProvisions(emp),
    }));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST / — create employee ─────────────────────────────────────────────────

router.post('/', (req: AuthRequest, res: Response) => {
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

    const stmt = db.prepare(`
      INSERT INTO employees (name, cpf, email, phone, role, department, salary, admission_date, status, notes, avatar_color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
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
    );

    const created = db.prepare('SELECT * FROM employees WHERE id = ?').get(info.lastInsertRowid) as any;
    res.status(201).json({ ...created, provisions: calcProvisions(created) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /:id — update employee ───────────────────────────────────────────────

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(Number(id)) as any;
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado' });

    const fields = ['name', 'cpf', 'email', 'phone', 'role', 'department', 'salary', 'admission_date', 'status', 'notes', 'avatar_color'];
    const updates: string[] = [];
    const values: any[] = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    updates.push(`updated_at = datetime('now')`);
    values.push(Number(id));

    db.prepare(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(Number(id)) as any;
    res.json({ ...updated, provisions: calcProvisions(updated) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /:id — soft deactivate ───────────────────────────────────────────

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(Number(id));
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado' });

    db.prepare(`UPDATE employees SET status = 'inativo', updated_at = datetime('now') WHERE id = ?`).run(Number(id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/salary-change ──────────────────────────────────────────────────

router.post('/:id/salary-change', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(Number(id)) as any;
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado' });

    const { new_salary, new_role, change_date, reason } = req.body;
    if (new_salary === undefined || !change_date) {
      return res.status(400).json({ error: 'Campos obrigatórios: new_salary, change_date' });
    }

    // Record history
    db.prepare(`
      INSERT INTO employee_salary_history (employee_id, previous_salary, new_salary, previous_role, new_role, change_date, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(id),
      employee.salary,
      Number(new_salary),
      employee.role,
      new_role ?? employee.role,
      change_date,
      reason ?? null,
    );

    // Update employee
    const updates: string[] = ['salary = ?', `updated_at = datetime('now')`];
    const values: any[] = [Number(new_salary)];

    if (new_role) {
      updates.unshift('role = ?');
      values.unshift(new_role);
    }

    values.push(Number(id));
    db.prepare(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(Number(id)) as any;
    res.json({ ...updated, provisions: calcProvisions(updated) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id/overtime ────────────────────────────────────────────────────────

router.get('/:id/overtime', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { month, year } = req.query;

    let query = 'SELECT * FROM employee_overtime WHERE employee_id = ?';
    const params: any[] = [Number(id)];

    if (month && year) {
      const m = String(month).padStart(2, '0');
      query += ` AND date >= ? AND date <= ?`;
      params.push(`${year}-${m}-01`, `${year}-${m}-31`);
    } else if (year) {
      query += ` AND date >= ? AND date <= ?`;
      params.push(`${year}-01-01`, `${year}-12-31`);
    }

    query += ' ORDER BY date DESC';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/overtime ───────────────────────────────────────────────────────

router.post('/:id/overtime', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(Number(id));
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado' });

    const { date, hours, rate_multiplier = 1.5, value, notes } = req.body;
    if (!date || hours === undefined || value === undefined) {
      return res.status(400).json({ error: 'Campos obrigatórios: date, hours, value' });
    }

    const info = db.prepare(`
      INSERT INTO employee_overtime (employee_id, date, hours, rate_multiplier, value, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(Number(id), date, Number(hours), Number(rate_multiplier), Number(value), notes ?? null);

    const created = db.prepare('SELECT * FROM employee_overtime WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /:id/overtime/:oid ────────────────────────────────────────────────

router.delete('/:id/overtime/:oid', (req: AuthRequest, res: Response) => {
  try {
    const { id, oid } = req.params;
    const row = db.prepare('SELECT id FROM employee_overtime WHERE id = ? AND employee_id = ?').get(Number(oid), Number(id));
    if (!row) return res.status(404).json({ error: 'Registro não encontrado' });

    db.prepare('DELETE FROM employee_overtime WHERE id = ?').run(Number(oid));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id/payslips ────────────────────────────────────────────────────────

router.get('/:id/payslips', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const rows = db.prepare(`
      SELECT id, employee_id, month, year, filename, gross_salary, net_salary, deductions, created_at
      FROM employee_payslips WHERE employee_id = ? ORDER BY year DESC, month DESC
    `).all(Number(id));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/payslips — upload ──────────────────────────────────────────────

router.post('/:id/payslips', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(Number(id));
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado' });

    if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });

    const { month, year, gross_salary, net_salary, deductions } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'Campos obrigatórios: month, year' });

    const info = db.prepare(`
      INSERT INTO employee_payslips (employee_id, month, year, filename, filepath, gross_salary, net_salary, deductions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(id),
      Number(month),
      Number(year),
      req.file.originalname,
      req.file.filename,
      gross_salary ? Number(gross_salary) : null,
      net_salary ? Number(net_salary) : null,
      deductions ? Number(deductions) : null,
    );

    const created = db.prepare('SELECT * FROM employee_payslips WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id/payslips/:pid/download ─────────────────────────────────────────

router.get('/:id/payslips/:pid/download', (req: AuthRequest, res: Response) => {
  try {
    const { id, pid } = req.params;
    const payslip = db.prepare('SELECT * FROM employee_payslips WHERE id = ? AND employee_id = ?').get(Number(pid), Number(id)) as any;
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

router.delete('/:id/payslips/:pid', (req: AuthRequest, res: Response) => {
  try {
    const { id, pid } = req.params;
    const payslip = db.prepare('SELECT * FROM employee_payslips WHERE id = ? AND employee_id = ?').get(Number(pid), Number(id)) as any;
    if (!payslip) return res.status(404).json({ error: 'Holerite não encontrado' });

    const filePath = path.join(UPLOAD_DIR, payslip.filepath);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch { /* ignore if already gone */ }
    }

    db.prepare('DELETE FROM employee_payslips WHERE id = ?').run(Number(pid));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id/feedbacks ───────────────────────────────────────────────────────

router.get('/:id/feedbacks', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const rows = db.prepare('SELECT * FROM employee_feedbacks WHERE employee_id = ? ORDER BY date DESC').all(Number(id));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/feedbacks ──────────────────────────────────────────────────────

router.post('/:id/feedbacks', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(Number(id));
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado' });

    const { author, type = 'positivo', content, rating, date } = req.body;
    if (!author || !content || !date) {
      return res.status(400).json({ error: 'Campos obrigatórios: author, content, date' });
    }

    const info = db.prepare(`
      INSERT INTO employee_feedbacks (employee_id, author, type, content, rating, date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(Number(id), author, type, content, rating ? Number(rating) : null, date);

    const created = db.prepare('SELECT * FROM employee_feedbacks WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /:id/feedbacks/:fid ───────────────────────────────────────────────

router.delete('/:id/feedbacks/:fid', (req: AuthRequest, res: Response) => {
  try {
    const { id, fid } = req.params;
    const row = db.prepare('SELECT id FROM employee_feedbacks WHERE id = ? AND employee_id = ?').get(Number(fid), Number(id));
    if (!row) return res.status(404).json({ error: 'Feedback não encontrado' });

    db.prepare('DELETE FROM employee_feedbacks WHERE id = ?').run(Number(fid));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id/salary-changes ─────────────────────────────────────────────────

router.get('/:id/salary-changes', (req: AuthRequest, res: Response) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM employee_salary_history WHERE employee_id = ? ORDER BY change_date DESC',
    ).all(Number(req.params.id));
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

    const employees = db.prepare(
      "SELECT id, name FROM employees WHERE status != 'inativo'",
    ).all() as { id: number; name: string }[];

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

router.post('/payslips/batch-save', (req: AuthRequest, res: Response) => {
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

    const insertStmt = db.prepare(`
      INSERT INTO employee_payslips (employee_id, month, year, filename, filepath, gross_salary, net_salary, deductions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let saved = 0;
    const errors: string[] = [];

    for (const entry of entries as any[]) {
      try {
        const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(Number(entry.employee_id)) as any;
        if (!emp) { errors.push(`ID ${entry.employee_id} não encontrado`); continue; }

        insertStmt.run(
          Number(entry.employee_id),
          Number(month),
          Number(year),
          permanentFilename,
          permanentFilename,
          Number(entry.gross),
          Number(entry.net),
          Number(entry.deductions),
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

router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(Number(req.params.id)) as any;
    if (!emp) return res.status(404).json({ error: 'Funcionário não encontrado' });
    res.json({ ...emp, provisions: calcProvisions(emp) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/photo — upload employee photo ─────────────────────────────────

router.post('/:id/photo', uploadPhoto.single('photo'), (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const emp = db.prepare('SELECT id, photo_path FROM employees WHERE id = ?').get(Number(id)) as any;
    if (!emp) return res.status(404).json({ error: 'Funcionário não encontrado' });

    // Remove old photo file if exists
    if (emp.photo_path && fs.existsSync(emp.photo_path)) {
      fs.unlinkSync(emp.photo_path);
    }

    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

    db.prepare("UPDATE employees SET photo_path = ?, updated_at = datetime('now') WHERE id = ?")
      .run(req.file.path, Number(id));

    res.json({ success: true, filename: req.file.filename });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id/photo — serve employee photo ────────────────────────────────────

router.get('/:id/photo', (req: AuthRequest, res: Response) => {
  try {
    const emp = db.prepare('SELECT photo_path FROM employees WHERE id = ?').get(Number(req.params.id)) as any;
    if (!emp || !emp.photo_path || !fs.existsSync(emp.photo_path)) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }
    res.sendFile(path.resolve(emp.photo_path));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
