// A wa.me link that opens WhatsApp on the school's own phone with a message
// to edit and send. Nothing is sent by the website (Decision Log C198-B).

// An Indian mobile number as WhatsApp wants it (country code, digits only),
// or null when it is not a 10-digit mobile number.
export function waNumber(phone: string): string | null {
  let d = phone.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `91${d}` : null;
}

export function whatsappDraftLink(phone: string, text: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}
