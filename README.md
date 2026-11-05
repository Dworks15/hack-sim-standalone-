# HILXITER WEB — deploy ke Netlify

1. Taruh folder ini di repo GitHub, lalu di Netlify: Add new site > Import from Git.
   (Atau: `npx netlify-cli deploy --prod` dari folder ini.)
   Catatan: drag-and-drop folder TIDAK menjalankan Functions, jadi pakai Git atau CLI.
2. Site configuration > Environment variables, tambahkan:
   - ANTHROPIC_API_KEY = key Anthropic (format sk-ant-...)
   - (opsional) ANTHROPIC_MODEL = nama model
3. Deploy ulang (Deploys > Trigger deploy).

Key tidak pernah ada di HTML/JS yang dilihat pengunjung; browser hanya memanggil /api/chat.
