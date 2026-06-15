#!/usr/bin/env python3
"""
Parseia extratos CNAB 240 do Banco Inter e importa receitas/despesas via API.
"""
import re
import sys
import urllib.request
import urllib.parse
import json

API = 'http://localhost:3333'
CAT_REVENUE  = 1   # Mensalidade
CAT_EXPENSE  = 11  # Outros

SKIP = ['RESGATE', 'APLICACAO', 'PIX ENVIADO INTERNO']

# regex: S + date1(8) + date2(8) + amount(18) + DC(1) + ispb(7) + rest
SEG = re.compile(r'DPV00\s+S(\d{8})\d{8}(\d{18})([DC])\d{7}(.+)')

def parse_file(path):
    txns = []
    with open(path, encoding='latin-1') as f:
        for line in f:
            if not line.startswith('077000130'):
                continue
            m = SEG.search(line)
            if not m:
                continue
            date_raw, amount_raw, dc, rest = m.groups()
            desc = rest.strip().split()[0] if rest.strip() else 'SEM DESCRICAO'
            # full description (first ~25 chars cleaned)
            full_desc = rest.strip()[:40].strip()

            # skip internal/financial movements
            if any(skip in full_desc for skip in SKIP):
                continue

            dd, mm, yyyy = date_raw[:2], date_raw[2:4], date_raw[4:]
            date = f'{yyyy}-{mm}-{dd}'
            amount = int(amount_raw) / 100

            txns.append({'date': date, 'amount': amount, 'dc': dc, 'desc': full_desc})
    return txns

def post(url, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except Exception as e:
        print(f'  ERRO: {e}')
        return 0

def import_txns(txns):
    ok_rev = ok_exp = err = 0
    for t in txns:
        if t['dc'] == 'C':
            status = post(f'{API}/api/revenues', {
                'description': t['desc'],
                'amount': t['amount'],
                'date': t['date'],
                'category_id': CAT_REVENUE,
                'client_id': None,
                'status': 'pago',
                'notes': 'Importado via extrato bancário'
            })
            if status in (200, 201):
                ok_rev += 1
            else:
                err += 1
        else:
            status = post(f'{API}/api/expenses', {
                'description': t['desc'],
                'amount': t['amount'],
                'date': t['date'],
                'category_id': CAT_EXPENSE,
                'status': 'pago',
                'notes': 'Importado via extrato bancário'
            })
            if status in (200, 201):
                ok_exp += 1
            else:
                err += 1
    return ok_rev, ok_exp, err

files = [
    '/Users/vanessaraeski/Downloads/Extrato-01-01-2024-a-31-12-2026-TXT.txt',
    '/Users/vanessaraeski/Downloads/Extrato-01-01-2026-a-26-05-2026-TXT.txt',
]

total_rev = total_exp = total_err = 0
for f in files:
    print(f'\n📂 {f.split("/")[-1]}')
    txns = parse_file(f)
    print(f'   {len(txns)} transações encontradas')
    rev, exp, err = import_txns(txns)
    print(f'   ✅ Receitas: {rev} | Despesas: {exp} | Erros: {err}')
    total_rev += rev; total_exp += exp; total_err += err

print(f'\n🎯 TOTAL — Receitas: {total_rev} | Despesas: {total_exp} | Erros: {total_err}')
