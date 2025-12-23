// ====== CONFIG ======
const SUPABASE_URL = https://rbgupunifgjlxibtpejv.supabase.co;
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiZ3VwdW5pZmdqbHhpYnRwZWp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0ODk3NTksImV4cCI6MjA4MjA2NTc1OX0.v2dSVx-HaMuKVcKeT747Zrjp6jyja9Q1XwKL3Bdolm8;

// UI
const AWARD_NAME = "SAUSAGE SHAMPE AWARDS 2025";

// ====== CLIENT ======
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ====== HELPERS ======
const $ = (sel) => document.querySelector(sel);

function fmtDateTimeLocal(d){
  try{
    return new Intl.DateTimeFormat("ru-RU", { dateStyle:"medium", timeStyle:"short" }).format(d);
  } catch {
    return d.toISOString();
  }
}

function getCode(){
  return new URLSearchParams(location.search).get("code")?.trim() || "";
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function setStatus(el, text, cls){
  if(!el) return;
  el.className = "notice " + (cls || "");
  el.textContent = text;
}

async function getRevealAt(){
  const { data, error } = await supabase.from("app_settings").select("reveal_at").limit(1).maybeSingle();
  if(error) throw error;
  return data ? new Date(data.reveal_at) : null;
}

async function isAdmin(){
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

// ====== PAGE: COMMON HEADER ======
function initHeader(){
  const brand = $(".js-award-name");
  if(brand) brand.textContent = AWARD_NAME;
}

// ====== PAGE: INDEX ======
async function initIndex(){
  initHeader();
  const revealEl = $("#revealAtText");
  try{
    const revealAt = await getRevealAt();
    if(revealAt && revealEl){
      revealEl.textContent = fmtDateTimeLocal(revealAt);
    }
  } catch(e){
    // silent
  }
}

// ====== PAGE: VOTE ======
async function initVote(){
  initHeader();

  const code = getCode();
  const codeEl = $("#voterCode");
  const statusEl = $("#status");
  const submitBtn = $("#submitVotesBtn");

  if(codeEl) codeEl.textContent = code || "—";

  if(!code){
    setStatus(statusEl, "Нужен персональный код (ссылка вида vote.html?code=AWARD-01). Попроси организатора.", "error");
    if(submitBtn) submitBtn.disabled = true;
    return;
  }

  // Load categories + nominees
  setStatus(statusEl, "Загружаю номинации…");
  const { data: categories, error: catErr } = await supabase
    .from("categories")
    .select("id,title,description,sort")
    .order("sort", { ascending: true });

  if(catErr){
    setStatus(statusEl, "Ошибка загрузки номинаций: " + catErr.message, "error");
    if(submitBtn) submitBtn.disabled = true;
    return;
  }

  const { data: nominees, error: nomErr } = await supabase
    .from("nominees")
    .select("id,category_id,name,about,photo_url,sort")
    .order("sort", { ascending: true });

  if(nomErr){
    setStatus(statusEl, "Ошибка загрузки номинантов: " + nomErr.message, "error");
    if(submitBtn) submitBtn.disabled = true;
    return;
  }

  const byCat = new Map();
  for(const n of nominees){
    if(!byCat.has(n.category_id)) byCat.set(n.category_id, []);
    byCat.get(n.category_id).push(n);
  }

  const wrap = $("#voteWrap");
  if(!wrap) return;

  // selected per category
  const selected = new Map(); // category_id -> nominee_id

  wrap.innerHTML = categories.map((c) => {
    const items = byCat.get(c.id) || [];
    const desc = c.description ? `<p>${escapeHtml(c.description)}</p>` : `<p class="small">Выбери 1 вариант.</p>`;
    const cards = items.map((n) => {
      const img = n.photo_url?.trim() || "https://placehold.co/600x400/png?text=Photo";
      return `
        <div class="card nominee" data-category="${c.id}" data-nominee="${n.id}">
          <img src="${escapeHtml(img)}" alt="${escapeHtml(n.name)}" loading="lazy">
          <div class="row">
            <div>
              <div class="name">${escapeHtml(n.name)}</div>
              <div class="about">${escapeHtml(n.about || "")}</div>
            </div>
            <button class="btn ghost pickBtn" type="button">Выбрать</button>
          </div>
        </div>
      `;
    }).join("");

    return `
      <section class="nomination">
        <h2>${escapeHtml(c.title)}</h2>
        ${desc}
        <div class="grid">${cards || `<div class="card"><b>Пока нет номинантов</b><div class="small">Добавь их в Supabase → table nominees.</div></div>`}</div>
      </section>
    `;
  }).join("");

  // click selection
  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".pickBtn");
    if(!btn) return;
    const card = e.target.closest(".nominee");
    if(!card) return;
    const categoryId = card.getAttribute("data-category");
    const nomineeId = card.getAttribute("data-nominee");

    // clear previous selection for this category
    selected.set(categoryId, nomineeId);

    // UI: mark selected within category
    const allInCat = wrap.querySelectorAll(`.nominee[data-category="${CSS.escape(categoryId)}"]`);
    allInCat.forEach(el => el.style.outline = "none");
    card.style.outline = "2px solid rgba(244,114,182,.65)";

    setStatus(statusEl, `Выбрано: ${selected.size}/${categories.length} номинаций.`, "");
  });

  // submit
  submitBtn.disabled = false;
  submitBtn.addEventListener("click", async () => {
    try{
      submitBtn.disabled = true;

      if(selected.size === 0){
        setStatus(statusEl, "Сначала выбери хотя бы 1 номинацию.", "error");
        submitBtn.disabled = false;
        return;
      }

      setStatus(statusEl, "Отправляю голоса…");

      const payload = Array.from(selected.entries()).map(([category_id, nominee_id]) => ({
        category_id,
        nominee_id,
        voter_code: code
      }));

      const { error } = await supabase.from("votes").insert(payload);
      if(error){
        // типичная ошибка: уже голосовал по этой номинации
        setStatus(statusEl, "Не получилось отправить: " + error.message, "error");
        submitBtn.disabled = false;
        return;
      }

      setStatus(statusEl, "Голос принят! Спасибо ❤️", "ok");
      setTimeout(() => location.href = "results.html", 600);
    } catch(err){
      setStatus(statusEl, "Ошибка: " + (err?.message || String(err)), "error");
      submitBtn.disabled = false;
    }
  });

  setStatus(statusEl, "Выбирай номинантов и жми «Отправить».", "");
}

// ====== PAGE: RESULTS ======
async function initResults(){
  initHeader();

  const statusEl = $("#status");
  const resultsWrap = $("#resultsWrap");
  const gateWrap = $("#gateWrap");

  let revealAt = null;
  try{ revealAt = await getRevealAt(); } catch(e){}

  const admin = await isAdmin();
  const now = new Date();

  if(!admin && revealAt && now < revealAt){
    // закрыто для всех
    if(gateWrap){
      gateWrap.innerHTML = `
        <div class="card">
          <b>Результаты пока закрыты</b>
          <p class="notice">Откроются: <span class="pill">${escapeHtml(fmtDateTimeLocal(revealAt))}</span></p>
          <p class="small">Если ты организатор — войди на странице Admin.</p>
          <div class="row">
            <a class="btn secondary" href="admin.html">Admin-вход</a>
            <a class="btn ghost" href="vote.html">К голосованию</a>
          </div>
        </div>
      `;
    }
    if(resultsWrap) resultsWrap.innerHTML = "";
    setStatus(statusEl, "");
    return;
  }

  // Load categories + nominees + results
  setStatus(statusEl, "Загружаю результаты…");

  const { data: categories, error: catErr } = await supabase
    .from("categories")
    .select("id,title,sort")
    .order("sort", { ascending: true });

  if(catErr){
    setStatus(statusEl, "Ошибка загрузки номинаций: " + catErr.message, "error");
    return;
  }

  const { data: nominees, error: nomErr } = await supabase
    .from("nominees")
    .select("id,category_id,name,photo_url,sort")
    .order("sort", { ascending: true });

  if(nomErr){
    setStatus(statusEl, "Ошибка загрузки номинантов: " + nomErr.message, "error");
    return;
  }

  // results table stores counts by nominee_id
  const { data: results, error: resErr } = await supabase
    .from("results")
    .select("nominee_id,votes_count");

  if(resErr){
    setStatus(statusEl, "Ошибка загрузки результатов: " + resErr.message, "error");
    return;
  }

  const countMap = new Map(results.map(r => [r.nominee_id, r.votes_count]));
  const nomineesByCat = new Map();
  for(const n of nominees){
    const votes = countMap.get(n.id) || 0;
    const enriched = { ...n, votes };
    if(!nomineesByCat.has(n.category_id)) nomineesByCat.set(n.category_id, []);
    nomineesByCat.get(n.category_id).push(enriched);
  }

  // sort by votes desc, then sort asc
  for(const [k, arr] of nomineesByCat.entries()){
    arr.sort((a,b) => (b.votes - a.votes) || (a.sort - b.sort));
  }

  if(resultsWrap){
    resultsWrap.innerHTML = categories.map(c => {
      const arr = nomineesByCat.get(c.id) || [];
      if(arr.length === 0){
        return `
          <section class="nomination">
            <h2>${escapeHtml(c.title)}</h2>
            <div class="card"><b>Нет номинантов</b><div class="small">Добавь nominees в Supabase.</div></div>
          </section>
        `;
      }

      const rows = arr.map((n, idx) => `
        <tr>
          <td>${idx+1}</td>
          <td>
            <div style="display:flex; gap:10px; align-items:center;">
              <img src="${escapeHtml(n.photo_url || "https://placehold.co/80x80/png?text=Photo")}" alt="" style="width:44px;height:44px;border-radius:10px;object-fit:cover;border:1px solid var(--border);background:rgba(255,255,255,.03)">
              <div>${escapeHtml(n.name)}</div>
            </div>
          </td>
          <td><span class="pill">${n.votes}</span></td>
        </tr>
      `).join("");

      return `
        <section class="nomination">
          <h2>${escapeHtml(c.title)}</h2>
          <div class="card">
            <table class="table">
              <thead><tr><th>#</th><th>Номинант</th><th>Голоса</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </section>
      `;
    }).join("");
  }

  if(admin && gateWrap){
    gateWrap.innerHTML = `
      <div class="card">
        <b>Админ-режим включён</b>
        <p class="small">Ты видишь результаты до открытия для всех.</p>
        <div class="row">
          <button class="btn ghost" id="logoutBtn" type="button">Выйти</button>
          <a class="btn secondary" href="vote.html">К голосованию</a>
        </div>
      </div>
    `;
    $("#logoutBtn")?.addEventListener("click", async () => {
      await supabase.auth.signOut();
      location.reload();
    });
  }

  setStatus(statusEl, "");
}

// ====== PAGE: ADMIN ======
async function initAdmin(){
  initHeader();

  const statusEl = $("#status");
  const emailInput = $("#email");
  const sendBtn = $("#sendLinkBtn");
  const logoutBtn = $("#logoutBtn");
  const goResults = $("#goResults");

  const admin = await isAdmin();
  if(admin){
    setStatus(statusEl, "Ты уже вошёл(ла) как админ ✅ Результаты доступны сразу.", "ok");
    if(goResults) goResults.style.display = "inline-flex";
    if(logoutBtn) logoutBtn.style.display = "inline-flex";
  } else {
    setStatus(statusEl, "Введи email организатора — придёт magic link для входа.", "");
  }

  sendBtn?.addEventListener("click", async () => {
    try{
      const email = emailInput.value.trim();
      if(!email){
        setStatus(statusEl, "Введите email.", "error");
        return;
      }
      setStatus(statusEl, "Отправляю ссылку на почту…");
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: location.origin + location.pathname.replace("admin.html","results.html") }
      });
      if(error){
        setStatus(statusEl, "Ошибка: " + error.message, "error");
        return;
      }
      setStatus(statusEl, "Готово! Проверь почту и открой ссылку для входа.", "ok");
    } catch(err){
      setStatus(statusEl, "Ошибка: " + (err?.message || String(err)), "error");
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    location.reload();
  });
}

// ====== ROUTER ======
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.getAttribute("data-page");
  if(page === "index") initIndex();
  if(page === "vote") initVote();
  if(page === "results") initResults();
  if(page === "admin") initAdmin();
});
