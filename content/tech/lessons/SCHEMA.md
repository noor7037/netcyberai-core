# Tech & AI Lab lesson file schema (nca-techlab/1) — shared by all level workers

One lesson per file: lessons/<L1|L2|L3>/<unit-slug>/<NN-lesson-slug>.json
Unit index: lessons/<L>/<unit-slug>/unit.json = {id, level, title:{en,hi,hinglish}, classes:[..], summary:{...}, lessons:[ids in order], badge:{id,name,emoji}}

Lesson JSON:
{
 "schema":"nca-techlab/1", "id":"L2.networking.03", "level":2, "classes":[7,8],
 "unit":"networking", "title":{"en":"","hi":"","hinglish":""},
 "minutes":8, "xp":30, "prereq":["L2.networking.02"],
 "outcomes":[{"en":"","hinglish":""}],            // what the child can do after
 "vocab":[{"term":"Packet","hinglish":"Data ka chhota parcel","en":"A small chunk of data sent over a network"}],
 "see":   [ {"step":1,"caption":{"en":"","hi":"","hinglish":""},"visual":"anim-id or svg file","narration":{"en":"","hinglish":""}} ],
 "play":  {"lab":"packet-tracer","config":{...},"goal":{"en":"","hinglish":""}},
 "understand":[ {"heading":{...},"body":{"en":"","hi":"","hinglish":""},"analogy":{"hinglish":""},"realExample":{"en":"","hinglish":""}} ],
 "try":   {"mission":{"en":"","hinglish":""},"questions":[
     {"id":"q1","type":"mcq|multi|order|match|tap-hotspot|short|lab-check","prompt":{"en":"","hinglish":""},
      "options":[...],"answer":..., "explain":{"en":"","hinglish":""}, "difficulty":1-3}
 ]},
 "sources":[{"title":"","url":"","licence":"CC BY 4.0 / own work / fact reference"}]
}
Rules: Hinglish (Roman script) is the default voice; English + Hindi (Devanagari) also filled for titles, captions, body, prompts, explanations. All content REAL, accurate and complete — no placeholders, no "lorem", no TODOs. Every question has answer + explanation. Cybersecurity = defensive only.
Labs: prototypes/<L>/<lab-id>.html, self-contained, offline, SVG/Canvas/CSS 3D transforms (+ optional three.js only if vendored MIT and lazy), 60fps on budget Android, mobile-first 360x780 + landscape, no eval, reads a lesson JSON via ?lesson= or inline.
