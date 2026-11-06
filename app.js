(() => {
  const API = "api.php";
  const REFRESH_MS = 20 * 1000;

  const $ = (id) => document.getElementById(id);
  const sky = $("sky"), count = $("count"), hint = $("hint");
  const reader = $("reader"), readerText = $("reader-text"), readerName = $("reader-name"), readerDate = $("reader-date");
  const delBtn = $("delete");
  const writer = $("writer"), form = $("writer-form"), message = $("message"), nameInput = $("name"), honeypot = $("website");
  const chars = $("chars"), submit = $("submit"), errorBox = $("error");
  const adminbar = $("adminbar"), login = $("login"), loginForm = $("login-form"), password = $("password"), loginError = $("login-error");

  const stars = new Map(); // id -> { data, el }
  let pending = null;      // {x, y} della stella in scrittura
  let active = null;       // { el, s } della stella mostrata
  let pinned = false;      // la card resta aperta finché non si clicca altrove
  let csrf = null;         // presente solo se admin

  const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignora */ } };

  async function api(action, body) {
    const opts = body === undefined
      ? { credentials: "same-origin" }
      : {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
          body: JSON.stringify(body)
        };
    const res = await fetch(`${API}?action=${action}`, opts);
    let data = {};
    try { data = await res.json(); } catch { /* risposta non JSON */ }
    if (!res.ok) throw Object.assign(new Error(data.error || "Errore " + res.status), { status: res.status });
    return data;
  }

  // ---------- rendering ----------
  function hash(str) {
    let h = 2166136261;
    for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return (h >>> 0) / 4294967295;
  }

  function addStar(s, isNew = false) {
    if (stars.has(s.id)) return;
    const r = hash(s.id);
    const el = document.createElement("button");
    el.className = "star" + (isNew ? " new" : "");
    el.style.left = s.x * 100 + "%";
    el.style.top = s.y * 100 + "%";
    el.style.setProperty("--size", (2 + r * 2.5).toFixed(1) + "px");
    el.style.setProperty("--tw", (3 + r * 4).toFixed(1) + "s");
    el.style.setProperty("--delay", (-r * 7).toFixed(1) + "s");
    el.setAttribute("aria-label", "Stella: " + s.message + (s.name ? ", firmata " + s.name : ""));
    el.addEventListener("click", (e) => { e.stopPropagation(); showReader(el, s); pinned = true; });
    el.addEventListener("mouseenter", () => { if (!pinned) showReader(el, s); });
    el.addEventListener("mouseleave", () => { if (!pinned) hideReader(); });
    el.addEventListener("focus", () => showReader(el, s));
    sky.appendChild(el);
    stars.set(s.id, { data: s, el });
    updateCount();
  }

  function removeStar(id) {
    const entry = stars.get(id);
    if (!entry) return;
    if (active && active.s.id === id) hideReader();
    entry.el.remove();
    stars.delete(id);
    updateCount();
  }

  function updateCount() {
    count.textContent = stars.size;
    hint.classList.toggle("gone", stars.size > 0);
  }

  function showReader(el, s) {
    if (active) active.el.classList.remove("active");
    active = { el, s };
    el.classList.add("active");
    readerText.textContent = s.message;
    readerName.textContent = s.name || "";
    readerName.hidden = !s.name;
    readerDate.textContent = s.created_at
      ? new Date(s.created_at).toLocaleString("it-IT", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
      : "";
    delBtn.hidden = !csrf;
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
    pinned = false;
    if (active) active.el.classList.remove("active");
    active = null;
  }

  function setAdmin(token) {
    csrf = token || null;
    adminbar.hidden = !csrf;
    if (active) delBtn.hidden = !csrf;
  }

  async function refresh() {
    try {
      const data = await api("list");
      setAdmin(data.csrf);
      const ids = new Set(data.stars.map((s) => s.id));
      for (const id of [...stars.keys()]) if (!ids.has(id)) removeStar(id); // eliminate dall'admin
      data.stars.forEach((s) => addStar(s));
    } catch (e) {
      console.warn(e);
    }
  }

  // ---------- scrittura ----------
  sky.addEventListener("click", (e) => {
    if (!reader.hidden) { hideReader(); return; }
    pending = { x: e.clientX / innerWidth, y: e.clientY / innerHeight };
    errorBox.hidden = true;
    message.value = "";
    nameInput.value = safeGet("stelle-name") || "";
    chars.textContent = "0/280";
    writer.showModal();
  });

  message.addEventListener("input", () => { chars.textContent = message.value.length + "/280"; });
  $("cancel").addEventListener("click", () => writer.close());

  function showError(box, msg) {
    box.textContent = msg;
    box.hidden = false;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = message.value.trim();
    if (!text || !pending) return;
    submit.disabled = true;
    errorBox.hidden = true;
    try {
      const name = nameInput.value.trim().slice(0, 40);
      const { star } = await api("add", {
        x: +pending.x.toFixed(5), y: +pending.y.toFixed(5), message: text, name, website: honeypot.value
      });
      safeSet("stelle-name", name);
      if (star) addStar(star, true);
      writer.close();
    } catch (err) {
      showError(errorBox, err.status === 429 || err.status === 400 ? err.message : "Non siamo riusciti a salvare la stella. Riprova.");
    } finally {
      submit.disabled = false;
    }
  });

  // ---------- admin ----------
  function openLogin() {
    loginError.hidden = true;
    password.value = "";
    login.showModal();
  }
  if (location.hash === "#admin") openLogin();
  addEventListener("hashchange", () => { if (location.hash === "#admin" && !csrf) openLogin(); });
  $("login-cancel").addEventListener("click", () => login.close());

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = await api("login", { password: password.value });
      setAdmin(data.csrf);
      login.close();
      history.replaceState(null, "", location.pathname);
    } catch (err) {
      showError(loginError, err.message);
    }
  });

  $("logout").addEventListener("click", async () => {
    try { await api("logout", {}); } catch { /* ignora */ }
    setAdmin(null);
    hideReader();
  });

  delBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!active) return;
    const { s } = active;
    if (!confirm(`Eliminare questa stella?\n\n"${s.message}"`)) return;
    try {
      await api("delete", { id: s.id });
      removeStar(s.id);
    } catch (err) {
      alert(err.status === 403 ? "Sessione scaduta: rientra con #admin." : err.message);
      if (err.status === 403) setAdmin(null);
    }
  });

  reader.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideReader(); });

  refresh();
  setInterval(refresh, REFRESH_MS);
})();
