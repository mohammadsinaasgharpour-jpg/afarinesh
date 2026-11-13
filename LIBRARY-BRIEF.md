# Brief for the library site session (afarinash-library.vercel.app)

Requested by the site owner on 2026-11-12. The library chat was closed when this was written, so it is saved here to paste into that chat.

1. **Light mode:** too white. Put text and forms in visible boxes (light grey page, white bordered cards), as on the school site.
2. **Fonts:** keep Estedad and Lalezar everywhere; the school site now uses the same two.
3. **Favicon:** keep the white-background logo; the school site now matches it.
4. **SEO (checker score 78):** make the title match the page content and use its words in the body; raise the text from about 364 words toward 800 useful words; one image has no alt; add sharing links; some headings are empty; add internal links. Keywords: کتابخانه مدرسه آفرینش، دبیرستان آفرینش شیراز، امانت کتاب.
5. **Performance:** render-blocking requests, forced reflow, cache lifetimes, image delivery, DOM size, LCP, minify JavaScript.
6. **Animation:** use the transitions.dev skill (github.com/Jakubantalik/transitions.dev) across the site.
7. **Database:** connect to Supabase project `dtqwxyfxemnkautcufho`. The school site uses schema `school` and function `public.submit_form`; use your own schema or a `library_` prefix, enable row level security on every table, no public read of personal data.
8. **Security:** full review, using Cloudflare's security-audit skill (github.com/cloudflare/security-audit-skill) and the owner's 12-point list.
9. **Launch checklist:** privacy page, retention period, no extra data, delete/export path, honest claims, licences, list of third-party services, parental consent, accessibility.

Do not deploy without the owner's go-ahead.
