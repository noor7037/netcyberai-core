#!/usr/bin/env python3
"""Writes src/lib/agent/catalog.generated.ts: every school-app API route the school agent may call (C546).

The agent works through the same routes a person's screen uses, as that person, so each route's own role checks,
validation and audit rows apply unchanged. This script lists them with the fields their code reads, the comment at the
top of their file, and their tier (src/lib/agent/tiers.py rules below, mirrored in tiers.ts and checked by its test).
Run: python3 scripts/gen_agent_catalog.py (CI step: --check fails when the file is out of date).
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = os.path.join(ROOT, 'src', 'app', 'api', 'app')
OUT = os.path.join(ROOT, 'src', 'lib', 'agent', 'catalog.generated.ts')
METHODS = ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')

# Never offered to the agent, read or write (tier 3): money moving, identity and accounts, consent and data rights,
# records of what happened (attendance, marking), exports and files, and the agent's own and bulk engines.
NEVER = [
    r'^agent(/|$)', r'^bulk(/|$)', r'^dsr(/|$)', r'(^|/)dsr(/|$)', r'(^|/)consent(/|$)', r'^recovery(/|$)',
    r'^fees/recovery', r'qr-token', r'^users(/|$)', r'^whatsapp-config', r'^entitlements', r'^fees/payments',
    r'^fees/payment-setup', r'^fees/bank', r'^fees/receipts', r'^fees/concessions', r'^fees/links', r'/waive$',
    r'^scan$', r'^marking(/|$)', r'(^|/)export(/|$)', r'/bundle$', r'/files$', r'/pdf$', r'/print$', r'photo',
    r'upload', r'attachments', r'record-documents', r'/evidence', r'^compliance/sqaaf', r'^students/import/ocr',
    r'^staff/invitations', r'^guardians/merge', r'family-code', r'^families/(link|confirm)', r'^copilot(/|$)',
    r'^parent-ai(/|$)', r'^school/branding', r'^compliance/qualifications/(import|template)', r'^lists/',
]
NEVER_WRITE = [r'^attendance(/|$)', r'^documents/certificates/requests/[^/]+/(collect|deliver)', r'^timetable/import',
               r'^students/import', r'^classes/import', r'^compliance/form6/figures']
# Tier 2: the principal approves, after seeing who is affected. Anything parents or students see or pay, settings,
# the school year, and every delete.
PRINCIPAL = [r'^communication', r'^ptm', r'^events', r'^exams', r'^documents', r'^admissions', r'^fees', r'^settings',
             r'^setup/(promotion|sessions)', r'^attendance/chronic/tell', r'^complaints', r'^early-warning', r'^families',
             r'^guardians', r'^students/[^/]+/(guardians|family)', r'^compliance', r'^proxy', r'^ai-tutors']

def tier(path, method):
    if any(re.search(p, path) for p in NEVER):
        return 3
    if method == 'GET':
        return 0
    if any(re.search(p, path) for p in NEVER_WRITE):
        return 3
    if method == 'DELETE' or any(re.search(p, path) for p in PRINCIPAL):
        return 2
    return 1

def doc_of(src):
    lines = src.splitlines()
    out, started = [], False
    for ln in lines:
        s = ln.strip()
        if s.startswith('//'):
            out.append(s.lstrip('/').strip()); started = True
        elif started:
            break
    text = ' '.join(x for x in out if x)
    return text[:300]

def fields_of(src):
    names = set(re.findall(r'const (\w+) = (?:await )?(?:readJson\(req\)|req\.json\(\))', src)) | {'body'}
    found = []
    for n in names:
        for f in re.findall(r'\b' + re.escape(n) + r'\??\.(\w+)', src):
            if f not in found and f not in ('length', 'then', 'catch'):
                found.append(f)
        for grp in re.findall(r'const \{([^}]+)\} = ' + re.escape(n) + r'\b', src):
            for f in re.findall(r'(\w+)\s*(?:[:=,]|$)', grp):
                if f not in found:
                    found.append(f)
    return found[:24]

def main():
    entries = []
    for dirpath, _, files in os.walk(API):
        if 'route.ts' not in files:
            continue
        full = os.path.join(dirpath, 'route.ts')
        rel = os.path.relpath(dirpath, API).replace(os.sep, '/')
        rel = '' if rel == '.' else rel
        src = open(full, encoding='utf-8').read()
        if 'formData(' in src:
            continue  # files are never sent by the agent
        path = re.sub(r'\[(\w+)\]', r':\1', rel)
        params = re.findall(r'\[(\w+)\]', rel)
        query = sorted(set(re.findall(r"searchParams\.get\('(\w+)'\)", src)))
        for m in METHODS:
            if not re.search(r'export (?:async )?function ' + m + r'\b|export const ' + m + r'\b', src):
                continue
            t = tier(path, m)
            if t == 3:
                continue
            entries.append({
                'id': f'{m} {path}', 'method': m, 'path': path, 'module': path.split('/')[0],
                'params': params, 'fields': [] if m == 'GET' else fields_of(src), 'query': query if m == 'GET' else [],
                'doc': doc_of(src), 'tier': t, 'file': rel,
            })
    entries.sort(key=lambda e: e['id'])
    files = sorted({e['file'] for e in entries})
    lines = [
        '// Generated by scripts/gen_agent_catalog.py (C546). Do not edit by hand: run the script.',
        "import type { CatalogEntry, RouteModule } from './types';",
        '',
        'export const ROUTE_MODULES: Record<string, () => Promise<RouteModule>> = {',
    ]
    for f in files:
        imp = '@/app/api/app' + ('/' + f if f else '') + '/route'
        lines.append(f"  {json.dumps(f)}: () => import({json.dumps(imp)}) as unknown as Promise<RouteModule>,")
    lines += ['};', '', 'export const CATALOG: readonly CatalogEntry[] = [']
    for e in entries:
        lines.append('  ' + json.dumps(e, ensure_ascii=False) + ',')
    lines += ['];', '']
    text = '\n'.join(lines)
    if '--check' in sys.argv:
        cur = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
        if cur != text:
            print('src/lib/agent/catalog.generated.ts is out of date: run python3 scripts/gen_agent_catalog.py')
            sys.exit(1)
        return
    open(OUT, 'w', encoding='utf-8').write(text)
    print(f'{len(entries)} routes in {len(files)} files, {len({e["module"] for e in entries})} modules')

main()
