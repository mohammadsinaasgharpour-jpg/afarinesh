// Persian text helpers shared by the public catalog (app.js) and the admin panel (admin/admin.js).
"use strict";

window.AfarinashText = (() => {
  const faDigits = (v) => String(v).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

  // Matching form only: the source text is always displayed as written.
  function normalize(text) {
    return String(text ?? "")
      .toLowerCase()
      .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660)
      .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0)
      .replace(/[يىئ]/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/[ةۀ]/g, "ه")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ؤ/g, "و")
      .replace(/[ً-ٰٟـ]/g, "") // harakat, superscript alef, tatweel
      .replace(/[«»"'`.,،؛;:؟?!()[\]{}\-–—_/\\|#*]/g, " ")
      .replace(/[\s‌‍‎‏ ]+/g, " ")
      .trim();
  }
  // Spaces and half-spaces are typed inconsistently («هفت‌سین»، «هفت سین»، «هفتسین»), so compare without them.
  const compact = (text) => normalize(text).replace(/ /g, "");

  const haystack = (b) => compact([b.number, b.title, b.author, b.translator, b.publisher].filter(Boolean).join(" "));

  function parseQuery(raw) {
    const q = normalize(raw).replace(/^(شماره|کتاب شماره|no)\s*/, "");
    const tokens = q.split(" ").map(compact).filter(Boolean);
    return { tokens, digitsOnly: tokens.length === 1 && /^\d+$/.test(tokens[0]) };
  }

  // books need _num (String(number)) and _hay (haystack(book))
  function filterBooks(list, { tokens, digitsOnly }) {
    if (!tokens.length) return list;
    if (digitsOnly) {
      // a bare number: that exact book number first, then numbers starting with it, then text containing it
      const t = tokens[0].replace(/^0+(?=\d)/, "");
      const rank = (b) => (b._num === t ? 0 : b._num.startsWith(t) ? 1 : b._hay.includes(t) ? 2 : 3);
      return list.filter((b) => rank(b) < 3).sort((a, b) => rank(a) - rank(b)); // stable: keeps the chosen order within a rank
    }
    return list.filter((b) => tokens.every((t) => b._hay.includes(t)));
  }

  const index = (b) => ({ ...b, _num: String(b.number), _hay: haystack(b) });

  return { faDigits, normalize, compact, parseQuery, filterBooks, index };
})();
