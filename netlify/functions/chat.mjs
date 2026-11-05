// Proxy AI: API key hanya ada di server (environment variable), tidak pernah dikirim ke browser.
const MAX_MSGS = 20, MAX_CHARS = 4000, MAX_IMG_B64 = 3_500_000;
const json = (status, obj) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

export default async (req) => {
  if (req.method !== 'POST') return json(405, { message: 'metode tidak diizinkan' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(500, { message: 'server belum dikonfigurasi (API key belum diatur)' });

  let body;
  try { body = await req.json(); } catch { return json(400, { message: 'permintaan tidak valid' }); }
  if (!Array.isArray(body.messages) || !body.messages.length) return json(400, { message: 'pesan kosong' });

  // Bersihkan & normalkan: hanya role user/assistant, teks, bergantian, mulai dari user.
  const msgs = [];
  for (const m of body.messages.slice(-MAX_MSGS)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
    const text = m.content.slice(0, MAX_CHARS).trim();
    if (!text) continue;
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) last.content += '\n' + text;
    else msgs.push({ role: m.role, content: text });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json(400, { message: 'pesan tidak valid' });

  const img = body.image;
  if (img) {
    const okType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(img.media_type);
    if (!okType || typeof img.data !== 'string' || img.data.length > MAX_IMG_B64)
      return json(400, { message: 'gambar tidak valid atau terlalu besar' });
    const last = msgs[msgs.length - 1];
    last.content = [
      { type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } },
      { type: 'text', text: last.content }
    ];
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: msgs
      })
    });
    if (!r.ok) {
      console.error('Anthropic error', r.status, await r.text().catch(() => ''));
      const msg = r.status === 429 ? 'terlalu banyak permintaan, coba sebentar lagi'
        : (r.status === 401 || r.status === 403) ? 'API key server tidak valid'
        : 'layanan AI sedang bermasalah';
      return json(r.status === 429 ? 429 : 502, { message: msg });
    }
    const data = await r.json();
    return json(200, { text: (data.content || []).map(c => c.text || '').join('') });
  } catch (e) {
    console.error(e);
    return json(502, { message: 'gagal menghubungi layanan AI' });
  }
};

export const config = { path: '/api/chat' };
