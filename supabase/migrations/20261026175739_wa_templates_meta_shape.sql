-- WhatsApp templates in Meta's shape (C344; the supervisor's brief of 2026-10-26, item 1). Meta refuses a body that
-- begins with a placeholder, so from version 2 every body names the school after words of its own: "From {{school}}: "
-- in English, "स्कूल {{school}} की ओर से: " in Hindi. The rows of version 1 keep their words as they were (a version's
-- words never change); they no longer send once version 2 is approved. Every body still names the school, as before.

alter table whatsapp_templates drop constraint whatsapp_templates_first_line_names_school;
alter table whatsapp_templates add constraint whatsapp_templates_first_line_names_school check (
  body is null or (
    'school' = any (variables)
    and (
      (version = 1 and body like '{{school}}: %')
      or (language = 'en' and body like 'From {{school}}: %')
      or (language = 'hi' and body like 'स्कूल {{school}} की ओर से: %')
    )
  )
);
