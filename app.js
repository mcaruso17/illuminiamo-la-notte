(() => {
  const cfg = window.STELLE_CONFIG || {};
  const ONLINE = Boolean(cfg.supabaseUrl && cfg.supabaseKey);
  const API = ONLINE ? cfg.supabaseUrl.replace(/\/$/, "") + "/rest/v1/stars" : null;
  const HEADERS = ONLINE ? { apikey: cfg.supabaseKey, "Content-Type": "application/json" } : {};
  const LOCAL_KEY = "stelle-demo";
  const COOLDOWN_MS = 60 * 1000; // una stella al minuto per browser
  const REFRESH_MS = 20 * 1000;

  const sky = document.getElementById("sky");
  const count = document.getElementById("count");
  const hint = document.getElementById("hint");
  const reader = document.getElementById("reader");
  const readerText = document.getElementById("reader-text");
  const readerDate = document.getElementById("reader-date");
  const writer = document.getElementById("writer");
  const form = document.getElementById("writer-form");
  const message = document.getElementById("message");
  const nameInput = document.getElementById("name");
  const readerName = document.getElementById("reader-name");
  const chars = document.getElementById("chars");
  const submit = document.getElementById("submit");
  const errorBox = document.getElementById("error");

  const stars = new Map(); // id -> dati
  let pending = null;      // {x, y} della stella in scrittura
  let activeEl = null;

  // ---------- storage ----------
  const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignora */ } };

  // Se la colonna "name" non esiste ancora nel database si ripiega sullo schema vecchio.
  let COLS = "id,x,y,message,name,created_at";
  const LEGACY_COLS = "id,x,y,message,created_at";

  async function fetchStars() {
    if (!ONLINE) return JSON.parse(safeGet(LOCAL_KEY) || "[]");
    let res = await fetch(API + "?select=" + COLS + "&order=id.asc&limit=10000", { headers: HEADERS });
    if (res.status === 400 && COLS !== LEGACY_COLS) {
      COLS = LEGACY_COLS;
      res = await fetch(API + "?select=" + COLS + "&order=id.asc&limit=10000", { headers: HEADERS });
    }
    if (!res.ok) throw new Error("Lettura fallita: " + res.status);
    return res.json();
  }

  async function saveStar(star) {
    if (!ONLINE) {
      const all = JSON.parse(safeGet(LOCAL_KEY) || "[]");
      const saved = { ...star, id: "local-" + Date.now(), created_at: new Date().toISOString() };
      all.push(saved);
      safeSet(LOCAL_KEY, JSON.stringify(all));
      return saved;
    }
    if (COLS === LEGACY_COLS) delete star.name;
    const res = await fetch(API + "?select=" + COLS, {
      method: "POST",
      headers: { ...HEADERS, Prefer: "return=representation" },
      body: JSON.stringify(star)
    });
    if (!res.ok) throw new Error("Salvataggio fallito: " + res.status);
    return (await res.json())[0];
  }

  // ---------- rendering ----------
  function hash(str) {
    let h = 2166136261;
    for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return (h >>> 0) / 4294967295;
  }

  function addStar(s, isNew = false) {
    if (stars.has(s.id)) return;
    stars.set(s.id, s);
    const r = hash(s.id);
    const el = document.createElement("button");
    el.className = "star" + (isNew ? " new" : "");
    el.style.left = s.x * 100 + "%";
    el.style.top = s.y * 100 + "%";
    el.style.setProperty("--size", (2 + r * 2.5).toFixed(1) + "px");
    el.style.setProperty("--tw", (3 + r * 4).toFixed(1) + "s");
    el.style.setProperty("--delay", (-r * 7).toFixed(1) + "s");
    el.setAttribute("aria-label", "Stella: " + s.message + (s.name ? ", firmata " + s.name : ""));
    el.addEventListener("click", (e) => { e.stopPropagation(); showReader(el, s); });
    el.addEventListener("mouseenter", () => showReader(el, s));
    el.addEventListener("mouseleave", hideReader);
    el.addEventListener("focus", () => showReader(el, s));
    el.addEventListener("blur", hideReader);
    sky.appendChild(el);
    count.textContent = stars.size;
    if (stars.size > 0) hint.classList.add("gone");
  }

  function showReader(el, s) {
    if (activeEl) activeEl.classList.remove("active");
    activeEl = el;
    el.classList.add("active");
    readerText.textContent = s.message;
    readerName.textContent = s.name || "";
    readerName.hidden = !s.name;
    readerDate.textContent = s.created_at
      ? new Date(s.created_at).toLocaleString("it-IT", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
      : "";
    reader.hidden = false;
    const rect = el.getBoundingClientRect();
    const cw = reader.offsetWidth, ch = reader.offsetHeight;
    let left = rect.left + rect.width / 2 - cw / 2;
    let top = rect.top - ch - 10;
    if (top < 16) top = rect.bottom + 10;
    left = Math.max(16, Math.min(left, innerWidth - cw - 16));
    top = Math.max(16, Math.min(top, innerHeight - ch - 16));
    reader.style.left = left + "px";
    reader.style.top = top + "px";
  }

  function hideReader() {
    reader.hidden = true;
    if (activeEl) activeEl.classList.remove("active");
    activeEl = null;
  }

  async function refresh() {
    try {
      (await fetchStars()).forEach((s) => addStar(s));
    } catch (e) {
      console.warn(e);
    }
  }

  // ---------- scrittura ----------
  sky.addEventListener("click", (e) => {
    if (!reader.hidden) { hideReader(); return; }
    const last = Number(safeGet("stelle-last") || 0);
    const wait = COOLDOWN_MS - (Date.now() - last);
    pending = { x: e.clientX / innerWidth, y: e.clientY / innerHeight };
    errorBox.hidden = true;
    message.value = "";
    nameInput.value = safeGet("stelle-name") || "";
    chars.textContent = "0/280";
    writer.showModal();
    if (wait > 0) showError(`Hai appena acceso una stella. Riprova tra ${Math.ceil(wait / 1000)} secondi.`);
  });

  message.addEventListener("input", () => { chars.textContent = message.value.length + "/280"; });
  document.getElementById("cancel").addEventListener("click", () => writer.close());

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = message.value.trim();
    if (!text || !pending) return;
    const last = Number(safeGet("stelle-last") || 0);
    if (Date.now() - last < COOLDOWN_MS) return showError("Aspetta un minuto tra una stella e l'altra.");
    submit.disabled = true;
    try {
      const name = nameInput.value.trim().slice(0, 40);
      const star = { x: +pending.x.toFixed(5), y: +pending.y.toFixed(5), message: text };
      if (name) star.name = name;
      const saved = await saveStar(star);
      safeSet("stelle-name", name);
      safeSet("stelle-last", String(Date.now()));
      addStar(saved, true);
      writer.close();
    } catch (err) {
      console.error(err);
      showError("Non siamo riusciti a salvare la stella. Riprova.");
    } finally {
      submit.disabled = false;
    }
  });

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideReader(); });

  refresh();
  if (ONLINE) setInterval(refresh, REFRESH_MS);
  else console.info("Stelle: modalità demo (nessun database configurato in config.js).");
})();
