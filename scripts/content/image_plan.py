#!/usr/bin/env python3
"""Turn a chapter plan (data/content/universal/plans/<class>-<subject>.json) into the founder's image sheet and lab
sheet, and the shared library (plans/library.json) into its own sheet. CSV, UTF-8 with a byte-order mark so Excel
and Google Sheets show Hindi and symbols correctly. Rules for the images: docs/family-app/13_IMAGE_GUIDE.md.

Usage: python3 scripts/content/image_plan.py data/content/universal/plans/c10-science.json
"""
import csv
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'data', 'content', 'universal', 'image-plans')

FORMAT = {
    'OBJ': ('PNG, transparent background, at least 1500 px', '.png'),
    'SCN': ('JPG, 16:9, at least 2048 px wide', '.jpg'),
    'CUT': ('PNG or JPG, 4:3, at least 2048 px wide, plain light background', '.png'),
    'SEQ': ('One file per frame (-f1, -f2 ...), same size, at least 2048 px wide', '.jpg'),
    'MAC': ('JPG, square, at least 2048 px', '.jpg'),
    '3DM': ('One PNG per view (-front, -side, -top, -34, -inside), transparent, same size and centre', '.png'),
    'MAP': ('JPG or PNG, 16:9 or 4:3, at least 2048 px wide', '.jpg'),
    'DIA': ('PNG (or SVG), white or transparent background, at least 2048 px wide', '.png'),
}
KIND_NAME = {'OBJ': 'Object cut-out', 'SCN': 'Scene', 'CUT': 'Cut-away / inside view', 'SEQ': 'Sequence of frames', 'MAC': 'Close-up / microscope', '3DM': '3D model views', 'MAP': 'Map base', 'DIA': 'Diagram base'}
STYLE = {
    'OBJ': 'Photorealistic studio photo of {shows}. {view}. Isolated on a transparent (or pure white) background, soft light from the top left, true colours, very sharp detail.',
    'SCN': 'Photorealistic photograph set in India: {shows}. {view}. Natural light, real Indian setting, sharp focus on the main subject.',
    'CUT': 'Highly detailed, realistic 3D scientific render: {shows}. {view}. Plain light background, accurate structure and proportions.',
    'SEQ': 'A series of matching photorealistic frames, identical camera position, framing and light in every frame: {shows}. {view}.',
    'MAC': 'Photorealistic macro or microscope image: {shows}. {view}. Sharp detail, true colours.',
    '3DM': 'Realistic 3D model render of {shows}, one image per view: {view}. Transparent background, same scale, centre and lighting in every view.',
    'MAP': 'Realistic map or terrain base: {shows}. {view}.',
    'DIA': 'Clean, realistic illustration base: {shows}. {view}. White or transparent background.',
}
TAIL = ' No text, no labels, no numbers, no arrows, no logos, no watermark. Must be scientifically right: {right}.{avoid}'


def slug(s, n=5):
    return '-'.join(re.sub(r'[^a-z0-9 ]', '', s.lower()).split()[:n])


def prompt(kind, img):
    avoid = f" Avoid: {img['avoid']}." if img.get('avoid') else ''
    return STYLE[kind].format(shows=img['shows'].rstrip('.'), view=img['view'].rstrip('.')) + TAIL.format(right=img['right'].rstrip('.'), avoid=avoid)


def write(path, rows):
    os.makedirs(OUT, exist_ok=True)
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def chapter_plan(path):
    plan = json.load(open(path, encoding='utf-8'))
    cls, sid = plan['class'], plan['subject_id']
    subj = sid.replace('_', ' ').title()
    base = f"Class-{cls}-{subj.replace(' ', '-')}"
    code = f"C{cls}-{sid[:3].upper()}"
    images, labs = [], []
    for ch in plan['chapters']:
        no = int(ch['key'].rsplit('.ch', 1)[1])
        for img in ch['images']:
            iid = f"{code}-CH{no:02d}-{img['n']:02d}"
            fmt, ext = FORMAT[img['kind']]
            hook = img['n'] == 1 or img['kind'] in ('OBJ', '3DM', 'DIA')
            images.append({
                'Image ID': iid, 'Class': cls, 'Subject': subj, 'Chapter': no, 'Chapter title': ch['title'], 'Topic': img['topic'],
                'Used in': img['use'], 'Kind': f"{img['kind']} ({KIND_NAME[img['kind']]})", 'What it must show': img['shows'],
                'Angle and framing': img['view'], 'Must be right': img['right'], 'Avoid': img.get('avoid', ''),
                'Prompt (paste into an image tool)': prompt(img['kind'], img), 'Format and size': fmt,
                'File name': f"{iid}_{slug(img['use'])}{ext}", 'Priority': 1 if hook else 2, 'Status': 'To do', 'Notes': '',
            })
        for lab in ch['labs']:
            t = plan['templates'].get(lab['template'], {})
            labs.append({
                'Class': cls, 'Subject': subj, 'Chapter': no, 'Chapter title': ch['title'], 'Lab': lab['lab'],
                'Template': t.get('name', lab['template']), 'Template status': t.get('status', ''), 'Lab status': lab['status'],
                'What the child does': lab['does'], 'What the child sees': lab['sees'],
            })
    write(os.path.join(OUT, f'{base}-images.csv'), images)
    write(os.path.join(OUT, f'{base}-labs.csv'), labs)
    return len(images), len(labs)


def library():
    lib = json.load(open(os.path.join(ROOT, 'data', 'content', 'universal', 'plans', 'library.json'), encoding='utf-8'))
    rows = []
    for img in lib['images']:
        fmt, ext = FORMAT[img['kind']]
        rows.append({
            'Image ID': img['id'], 'Group': img['group'], 'Kind': f"{img['kind']} ({KIND_NAME[img['kind']]})", 'What it must show': img['shows'],
            'Angle and framing': img['view'], 'Must be right': img['right'], 'Prompt (paste into an image tool)': prompt(img['kind'], img),
            'Format and size': fmt, 'File name': f"{img['id']}{ext}", 'Priority': 1, 'Status': 'To do', 'Notes': '',
        })
    write(os.path.join(OUT, 'Library-shared-images.csv'), rows)
    return len(rows)


if __name__ == '__main__':
    for p in sys.argv[1:]:
        n_img, n_lab = chapter_plan(p)
        print(f'{os.path.basename(p)}: {n_img} images, {n_lab} labs')
    print(f'library: {library()} images')
