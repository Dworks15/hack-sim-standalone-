// Proxy AI (Gemini): API key hanya ada di server (environment variable), tidak pernah dikirim ke browser.
const MAX_MSGS = 20, MAX_CHARS = 4000, MAX_IMG_B64 = 3_500_000;
const SYSTEM = 'Kamu asisten AI yang ramah dan ringkas. Jawab dalam bahasa yang dipakai pengguna (biasanya Bahasa Indonesia).';
const json = (status, obj) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

export default async (req) => {
  if (req.method !== 'POST') return json(405, { message: 'metode tidak diizinkan' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(500, { message: 'server belum dikonfigurasi (GEMINI_API_KEY belum diatur)' });

  let body;
  try { body = await req.json(); } catch { return json(400, { message: 'permintaan tidak valid' }); }
  if (!Array.isArray(body.messages) || !body.messages.length) return json(400, { message: 'pesan kosong' });

  // Bersihkan & normalkan: hanya user/assistant, teks, bergantian, mulai dari user.
  const msgs = [];
  for (const m of body.messages.slice(-MAX_MSGS)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
    const text = m.content.slice(0, MAX_CHARS).trim();
    if (!text) continue;
    const role = m.role === 'user' ? 'user' : 'model';
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.parts[0].text += '\n' + text;
    else msgs.push({ role, parts: [{ text }] });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json(400, { message: 'pesan tidak valid' });

  const img = body.image;
  if (img) {
    const okType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(img.media_type);
    if (!okType || typeof img.data !== 'string' || img.data.length > MAX_IMG_B64)
      return json(400, { message: 'gambar tidak valid atau terlalu besar' });
    msgs[msgs.length - 1].parts.unshift({ inline_data: { mime_type: img.media_type, data: img.data } });
  }

  // Daftar model dicoba berurutan; model yang sudah dihentikan (404) dilewati.
  const models = [process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']
    .filter(Boolean).filter((m, i, arr) => arr.indexOf(m) === i);
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: msgs,
    generationConfig: { maxOutputTokens: 1024 }
  });
  try {
    let r;
    for (const model of models) {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: payload
      });
      if (r.status !== 404) break;
      console.error('Model tidak ditemukan:', model);
    }
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      console.error('Gemini error', r.status, errText);
      let msg = 'layanan AI sedang bermasalah';
      if (r.status === 429) msg = 'batas penggunaan gratis tercapai, coba lagi sebentar';
      else if (r.status === 401 || r.status === 403 || /API key/i.test(errText)) msg = 'API key server tidak valid';
      else if (r.status === 404) msg = 'model AI tidak ditemukan (cek GEMINI_MODEL)';
      return json(r.status === 429 ? 429 : 502, { message: msg });
    }
    const data = await r.json();
    const cand = data.candidates && data.candidates[0];
    const text = cand && cand.content && cand.content.parts
      ? cand.content.parts.map(p => p.text || '').join('') : '';
    if (!text) {
      console.error('Gemini kosong', JSON.stringify(data.promptFeedback || cand || {}));
      return json(200, { text: 'Maaf, jawaban tidak bisa ditampilkan (kemungkinan diblokir filter keamanan). Coba ubah pertanyaanmu.' });
    }
    return json(200, { text });
  } catch (e) {
    console.error(e);
    return json(502, { message: 'gagal menghubungi layanan AI' });
  }
};

export const config = { path: '/api/chat' };
