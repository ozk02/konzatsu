const MOCK_SPOTS = [
  { id: "shibuya-scramble", name: "渋谷スクランブル交差点", area: "渋谷" },
  { id: "shinjuku-south", name: "新宿駅南口", area: "新宿" },
  { id: "harajuku-cafe", name: "原宿カフェストリート", area: "原宿" },
  { id: "asakusa-sensoji", name: "浅草寺 仲見世通り", area: "浅草" },
  { id: "akiba-station", name: "秋葉原駅電気街口", area: "秋葉原" },
  { id: "ueno-park", name: "上野公園", area: "上野" },
  { id: "ginza-yonchome", name: "銀座四丁目交差点", area: "銀座" },
  { id: "shimokita-north", name: "下北沢駅北口", area: "下北沢" },
  { id: "ikebukuro-east", name: "池袋駅東口", area: "池袋" },
  { id: "odaiba-aqua", name: "お台場 アクアシティ", area: "お台場" },
];

const FAV_KEY = "konzatsu.favorites.v1";

const $ = (sel) => document.querySelector(sel);
const els = {
  q: $("#q"),
  suggest: $("#suggest"),
  result: $("#result"),
  empty: $("#empty"),
  favorites: $("#favorites"),
  favList: $("#favList"),
  favBtn: $("#favBtn"),
  toggleFav: $("#toggleFav"),
  spotName: $("#spotName"),
  meterLabel: $("#meterLabel"),
  bars: document.querySelector(".bars"),
  confidence: $("#confidence"),
  updated: $("#updated"),
  samples: $("#samples"),
  trend: $("#trend"),
};

let currentSpot = null;

function loadFavs() {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveFavs(ids) {
  localStorage.setItem(FAV_KEY, JSON.stringify(ids));
}

function isFav(id) {
  return loadFavs().includes(id);
}

function toggleFav(id) {
  const favs = loadFavs();
  const idx = favs.indexOf(id);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(id);
  saveFavs(favs);
  renderFavorites();
  if (currentSpot && currentSpot.id === id) syncFavButton();
}

// Deterministic pseudo-random based on spot id + hour bucket.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function computeCrowding(spot) {
  const now = new Date();
  const hourBucket = Math.floor(now.getTime() / (1000 * 60 * 30));
  const rng = rand(hash(spot.id + ":" + hourBucket));

  const hour = now.getHours();
  const peakBoost =
    hour >= 11 && hour <= 14 ? 0.25 :
    hour >= 17 && hour <= 21 ? 0.35 :
    hour <= 6 ? -0.3 : 0;

  const raw = Math.min(1, Math.max(0, rng() * 0.8 + 0.2 + peakBoost));
  const level = raw < 0.3 ? 1 : raw < 0.55 ? 2 : raw < 0.8 ? 3 : 4;
  const confidence = Math.round(50 + rng() * 50);
  const samples = Math.floor(8 + rng() * 80);

  const trend = [];
  for (let i = -11; i <= 0; i++) {
    const t = new Date(now.getTime() + i * 60 * 60 * 1000);
    const h = t.getHours();
    const boost =
      h >= 11 && h <= 14 ? 0.25 :
      h >= 17 && h <= 21 ? 0.35 :
      h <= 6 ? -0.3 : 0;
    const v = Math.min(1, Math.max(0.05, rand(hash(spot.id + ":t:" + h))() * 0.7 + 0.2 + boost));
    trend.push({ hour: h, v, offset: i });
  }

  return { level, confidence, samples, trend, updatedAt: now };
}

const LEVEL_LABELS = ["", "空いている", "やや混雑", "混雑", "非常に混雑"];

function renderResult(spot) {
  currentSpot = spot;
  const c = computeCrowding(spot);

  els.empty.hidden = true;
  els.result.hidden = false;
  els.favorites.hidden = loadFavs().length === 0;

  els.spotName.textContent = spot.name;
  els.meterLabel.textContent = LEVEL_LABELS[c.level];
  els.bars.dataset.level = String(c.level);

  els.confidence.textContent = c.confidence + "%";
  els.updated.textContent = formatTime(c.updatedAt);
  els.samples.textContent = c.samples + "件";

  renderTrend(c.trend);
  syncFavButton();
}

function renderTrend(trend) {
  els.trend.innerHTML = "";
  for (const t of trend) {
    const col = document.createElement("div");
    col.className = "col" + (t.offset === 0 ? " now" : "");
    col.style.height = Math.round(t.v * 100) + "%";
    if (t.offset === 0 || t.offset === -6 || t.offset === -11) {
      const lbl = document.createElement("span");
      lbl.className = "lbl";
      lbl.textContent = t.hour + "時";
      col.appendChild(lbl);
    }
    els.trend.appendChild(col);
  }
}

function formatTime(d) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return hh + ":" + mm;
}

function syncFavButton() {
  if (!currentSpot) return;
  const on = isFav(currentSpot.id);
  els.toggleFav.setAttribute("aria-pressed", on ? "true" : "false");
  els.toggleFav.textContent = on ? "お気に入り済み" : "お気に入り追加";
}

function renderFavorites() {
  const ids = loadFavs();
  const items = MOCK_SPOTS.filter((s) => ids.includes(s.id));
  els.favList.innerHTML = "";
  for (const s of items) {
    const c = computeCrowding(s);
    const li = document.createElement("li");
    const left = document.createElement("div");
    left.innerHTML =
      '<div class="fav-name">' + s.name + "</div>" +
      '<div class="sub" style="color:var(--fg-dim);font-size:12px">' + s.area + "</div>";
    const right = document.createElement("span");
    right.className = "fav-badge";
    right.textContent = LEVEL_LABELS[c.level];
    li.appendChild(left);
    li.appendChild(right);
    li.addEventListener("click", () => {
      els.q.value = s.name;
      els.suggest.hidden = true;
      renderResult(s);
    });
    els.favList.appendChild(li);
  }
  els.favorites.hidden = items.length === 0;
}

function renderSuggest(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    els.suggest.hidden = true;
    return;
  }
  const hits = MOCK_SPOTS.filter(
    (s) => s.name.toLowerCase().includes(q) || s.area.toLowerCase().includes(q)
  ).slice(0, 6);
  els.suggest.innerHTML = "";
  if (hits.length === 0) {
    els.suggest.hidden = true;
    return;
  }
  for (const s of hits) {
    const li = document.createElement("li");
    li.innerHTML = s.name + '<div class="sub">' + s.area + "</div>";
    li.addEventListener("click", () => {
      els.q.value = s.name;
      els.suggest.hidden = true;
      renderResult(s);
    });
    els.suggest.appendChild(li);
  }
  els.suggest.hidden = false;
}

els.q.addEventListener("input", (e) => renderSuggest(e.target.value));
els.q.addEventListener("focus", (e) => renderSuggest(e.target.value));
document.addEventListener("click", (e) => {
  if (!els.suggest.contains(e.target) && e.target !== els.q) {
    els.suggest.hidden = true;
  }
});

els.toggleFav.addEventListener("click", () => {
  if (currentSpot) toggleFav(currentSpot.id);
});

els.favBtn.addEventListener("click", () => {
  els.favorites.hidden = !els.favorites.hidden && loadFavs().length > 0
    ? true
    : loadFavs().length === 0
    ? true
    : false;
  if (!els.favorites.hidden) {
    els.favorites.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

renderFavorites();
