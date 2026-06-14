'use strict';

/* =========================================================
 * 特売ファインダー
 *
 * 現在地から指定距離内のスーパー＆ドラッグストアを距離順に表示し、
 * 各店舗の「チラシを見る」で くふう トクバイ等のチラシページへ遷移する。
 * 店舗ディレクトリは OpenStreetMap 由来（data/stores.json）。
 * ======================================================= */

const MIN_DIST = 100, MAX_DIST = 10000, STEP = 100;
const PAGE_SIZE = 10, MAX_PAGES = 10, MAX_RESULTS = PAGE_SIZE * MAX_PAGES; // 1ページ10件・最大10ページ
let searchState = null; // { coords, radius, results, total, page }
const LS_STORES = 'tf_stores_v1';
const LS_SALES = 'tf_sales_v1';

/* ---------- 初期シード（町田の主要4店舗） ----------
 * 座標は OpenStreetMap 由来の概算。登録画面で編集できる。
 */
function seedStores() {
  return [
    { id: 'machida-tokyu', name: '東急ストア 町田店', category: 'スーパー',
      lat: 35.5419, lon: 139.4474, url: 'https://www.tokyu-store.co.jp/shop/detail.html?pdid=148' },
    { id: 'machida-seiyu', name: '西友 町田店', category: 'スーパー',
      lat: 35.5435, lon: 139.4441, url: 'https://www.seiyu.co.jp/flyer/chirashi/' },
    { id: 'machida-sanwa', name: 'スーパー三和 上鶴間店', category: 'スーパー',
      lat: 35.5372, lon: 139.4452, url: 'https://www.heartful-sanwa.co.jp/' },
    { id: 'machida-odakyuox', name: 'Odakyu OX 町田店', category: 'スーパー',
      lat: 35.531573, lon: 139.437267, url: 'https://www.odakyu-ox.net/' },
  ];
}

/* 追加シード：町田の主要ドラッグストア（座標はOSM由来、公式チラシリンク付き）。
 * 特売はチェーンの公式チラシを見て登録画面で手入力する。 */
const DRUGSTORE_SEED = [
  { id: 'machida-matsukiyo', name: 'マツモトキヨシ 町田店', category: 'ドラッグストア',
    lat: 35.543125, lon: 139.4466, url: 'https://www.matsukiyococokara-online.com/store/' },
  { id: 'machida-sundrug', name: 'サンドラッグ 町田店', category: 'ドラッグストア',
    lat: 35.542443, lon: 139.447497, url: 'https://www.sundrug.co.jp/' },
  { id: 'machida-sugi', name: 'スギ薬局 町田店', category: 'ドラッグストア',
    lat: 35.541732, lon: 139.447644, url: 'https://www.sugi-net.jp/' },
  { id: 'machida-cocokara', name: 'ココカラファイン 町田店', category: 'ドラッグストア',
    lat: 35.540747, lon: 139.449472, url: 'https://www.cocokarafine.co.jp/' },
];

/* 追加シードv2：クリエイトSD・ウエルシア（町田駅に最も近い店舗）。
 * 座標は国土地理院ジオコーディング由来。駅から少し離れるので検索距離に注意。 */
const DRUGSTORE_SEED_V2 = [
  { id: 'machida-create', name: 'クリエイトSD 町田金森店', category: 'ドラッグストア',
    lat: 35.533516, lon: 139.459534, url: 'https://www.create-sd.co.jp/' },
  { id: 'machida-welcia', name: 'ウエルシア 町田境川店', category: 'ドラッグストア',
    lat: 35.560169, lon: 139.42215, url: 'https://www.welcia.co.jp/' },
];

/* 追加シードv3：トモズ・デポー(生活クラブ)・業務スーパー・ツルハ（町田の最寄り店）。
 * 座標は国土地理院ジオコーディング由来。 */
const STORE_SEED_V3 = [
  { id: 'machida-tomods', name: 'トモズ ミーナ町田店', category: 'ドラッグストア',
    lat: 35.542442, lon: 139.44606, url: 'https://www.tomods.jp/' },
  { id: 'machida-depot', name: 'デポー町田（生活クラブ）', category: 'スーパー',
    lat: 35.535652, lon: 139.470474, url: 'https://tokyo.seikatsuclub.coop/service/depot/machida.html' },
  { id: 'machida-gyomu', name: '業務スーパー 町田木曽店', category: 'スーパー',
    lat: 35.559376, lon: 139.431, url: 'https://www.gyomusuper.jp/shop/detail.php?sh_id=1680' },
  { id: 'machida-tsuruha', name: 'ツルハドラッグ 町田木曽西店', category: 'ドラッグストア',
    lat: 35.568478, lon: 139.422516, url: 'https://www.tsuruha.co.jp/' },
];

/* 初期サンプル特売（東急ストアに数件。挙動確認用、登録画面で編集・削除可） */
function seedSales() {
  return {
    'machida-tokyu': [
      { id: 's1', name: '卵 10個', price: 158, was: 258 },
      { id: 's2', name: '牛乳 1L', price: 178, was: 230 },
      { id: 's3', name: '鶏むね肉 100g', price: 58, was: 88 },
    ],
  };
}

/* ---------- 永続化 ---------- */
function loadStores() {
  const raw = localStorage.getItem(LS_STORES);
  if (raw) { try { return JSON.parse(raw); } catch (e) {} }
  const s = seedStores();
  localStorage.setItem(LS_STORES, JSON.stringify(s));
  if (!localStorage.getItem(LS_SALES)) {
    localStorage.setItem(LS_SALES, JSON.stringify(seedSales()));
  }
  return s;
}
function saveStores(s) { localStorage.setItem(LS_STORES, JSON.stringify(s)); }

/* 追加シードを一度だけマージする（ユーザーの編集・削除は壊さない） */
function ensureSeedBatch(batchId, seedStores) {
  const applied = JSON.parse(localStorage.getItem('tf_seed_applied') || '[]');
  if (applied.includes(batchId)) return;
  const stores = loadStores();
  const ids = new Set(stores.map((s) => s.id));
  let changed = false;
  for (const s of seedStores) if (!ids.has(s.id)) { stores.push(s); changed = true; }
  if (changed) saveStores(stores);
  applied.push(batchId);
  localStorage.setItem('tf_seed_applied', JSON.stringify(applied));
}
function loadSales() {
  const raw = localStorage.getItem(LS_SALES);
  if (raw) { try { return JSON.parse(raw); } catch (e) {} }
  return {};
}
function saveSales(s) { localStorage.setItem(LS_SALES, JSON.stringify(s)); }

/* ---------- 全国店舗ディレクトリ（読み取り専用・data/stores.json） ----------
 * サイズが大きいため、セッション中は1回だけ取得しブラウザにHTTPキャッシュさせる。
 * データ更新時は DIRECTORY_VERSION を上げてキャッシュを破棄する。 */
const DIRECTORY_VERSION = 5;
let DIRECTORY = [];
let directoryLoaded = false;   // 成功時のみ true（失敗時は次回リトライ）
let _dirPromise = null;        // 同時呼び出しの重複フェッチを防ぐ
async function loadDirectory() {
  if (directoryLoaded) return DIRECTORY;
  if (_dirPromise) return _dirPromise;
  _dirPromise = (async () => {
    try {
      const res = await fetch('data/stores.json?v=' + DIRECTORY_VERSION);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length) { DIRECTORY = data; directoryLoaded = true; }
      }
    } catch (e) { /* 失敗時は directoryLoaded を立てず、次回再試行できるようにする */ }
    _dirPromise = null;
    return DIRECTORY;
  })();
  return _dirPromise;
}

/* ユーザー追加店舗とディレクトリを統合（近接重複はユーザー店舗を優先） */
function cellKey(s) { return `${s.category}|${s.lat.toFixed(3)},${s.lon.toFixed(3)}`; }
function getAllStores() {
  const user = loadStores();
  const taken = new Set(user.map(cellKey));
  const dir = DIRECTORY.filter((s) => !taken.has(cellKey(s)));
  return user.concat(dir);
}
function getStore(id) {
  return loadStores().find((s) => s.id === id) || DIRECTORY.find((s) => s.id === id) || null;
}

function newId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ---------- 共通ユーティリティ ---------- */
function $(id) { return document.getElementById(id); }

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const fmtYen = (n) => '¥' + Number(n).toLocaleString('ja-JP');
const distText = (m) => (m >= 1000 ? (m / 1000).toFixed(2) + ' km' : m + ' m');

function geoErrorMessage(err) {
  const m = { 1: '位置情報が許可されませんでした。設定から許可してください。',
    2: '現在地を取得できませんでした。', 3: '位置情報の取得がタイムアウトしました。' };
  return m[err && err.code] || '位置情報の取得に失敗しました。';
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('この端末では位置情報を利用できません。')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(new Error(geoErrorMessage(err))),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

/* 高精度測位：getCurrentPosition（iOS standalone で確実）を主、watchPosition を精度向上の
 *  補助として併用する。どちらかが測位を返せば採用し、権限拒否は即座に正しいメッセージで返す。 */
function getAccuratePosition({ desiredAccuracy = 35, maxWait = 12000, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('この端末では位置情報を利用できません。')); return; }
    let best = null, watchId = null, timer = null, lastErr = null, done = false;
    const finish = () => {
      if (done) return; done = true;
      if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch (e) {} }
      if (timer) clearTimeout(timer);
      if (best) resolve(best);
      else reject(lastErr || new Error('現在地を取得できませんでした。電波の良い場所で再度お試しください。'));
    };
    const onPos = (pos) => {
      if (!best || pos.coords.accuracy < best.accuracy) best = pos.coords;
      if (onProgress) onProgress(best.accuracy);
      if (best.accuracy <= desiredAccuracy) finish(); // 十分な精度に到達
    };
    const onErr = (err) => {
      lastErr = new Error(geoErrorMessage(err));
      if (err && err.code === 1) finish(); // 権限拒否は確定 → 即終了
      // それ以外（取得不可/タイムアウト）はもう一方の測位かタイマーに任せる
    };
    timer = setTimeout(() => finish(), maxWait);
    const opts = { enableHighAccuracy: true, timeout: maxWait, maximumAge: 0 };
    try { navigator.geolocation.getCurrentPosition(onPos, onErr, opts); } catch (e) {}
    try { watchId = navigator.geolocation.watchPosition(onPos, onErr, opts); } catch (e) {}
  });
}

/* ============================================================
 *  チラシを開く（店舗ごと）
 *  店名に支店名が無い場合は座標から地名を逆ジオコーディングして補い、
 *  「店名＋地名 チラシ」でその店舗のチラシに着地させる。
 * ========================================================== */
/* 店名に含まれる文字列 → トクバイのURLスラッグ（全て200で実在確認済み）。
 * 店名から判定するため、より特定的なキーを先に置く（例: マルエツプチ→マルエツ より前）。 */
const TOKUBAI_SLUG = {
  // 14チェーン（chainフィールド値と別名）
  '東急ストア': '東急ストア', '西友': '西友', 'SEIYU': '西友', 'Seiyu': '西友',
  'スーパー三和': '三和', '三和': '三和', 'Odakyu OX': 'Odakyu OX',
  '業務スーパー': '業務スーパー', 'デポー': 'デポー',
  'マツモトキヨシ': 'マツモトキヨシ', 'マツキヨ': 'マツモトキヨシ',
  'サンドラッグ': 'サンドラッグ', 'スギ薬局': 'スギ薬局', 'スギドラッグ': 'スギ薬局',
  'ココカラファイン': 'ココカラファイン',
  'クリエイトSD': 'クリエイトエスディー', 'クリエイト': 'クリエイトエスディー',
  'ウエルシア': 'ウエルシア', 'ウェルシア': 'ウエルシア', 'トモズ': 'トモズ', 'ツルハ': 'ツルハドラッグ',
  // 主要追加チェーン（特定的なキーを先に）
  'マルエツプチ': 'マルエツプチ', 'MEGAドン・キホーテ': 'MEGAドン・キホーテ',
  'ザ・ビッグ': 'ザ・ビッグ', 'ビッグ・エー': 'ビッグ・エー',
  'ヨークベニマル': 'ヨークベニマル', 'ヨークマート': 'ヨークマート', 'イトーヨーカドー': 'イトーヨーカドー',
  'ドラッグストアモリ': 'ドラッグストアモリ', 'ドラッグセイムス': 'ドラッグセイムス', 'セイムス': 'ドラッグセイムス',
  'ドラッグイレブン': 'ドラッグイレブン', 'クスリのアオキ': 'クスリのアオキ',
  'まいばすけっと': 'まいばすけっと', 'マックスバリュ': 'マックスバリュ', 'イオン': 'イオン',
  'ライフ': 'ライフ', 'マルエツ': 'マルエツ', 'ヤオコー': 'ヤオコー', 'マルナカ': 'マルナカ',
  'サンディ': 'サンディ', 'バロー': 'バロー', '万代': '万代', 'カスミ': 'カスミ',
  'オーケー': 'オーケー', 'いなげや': 'いなげや', 'ベルク': 'ベルク', '成城石井': '成城石井',
  'ベイシア': 'ベイシア', 'トライアル': 'スーパーセンタートライアル', 'オークワ': 'オークワ',
  'サミット': 'サミット', 'タイヨー': 'タイヨー', 'ロピア': 'ロピア', 'ドン・キホーテ': 'ドン・キホーテ',
  'ダイエー': 'ダイエー', 'ハローズ': 'ハローズ', 'ラ・ムー': 'ラ・ムー', 'コモディイイダ': 'コモディイイダ',
  '関西スーパー': '関西スーパー', '阪急オアシス': '阪急オアシス', 'ピアゴ': 'ピアゴ',
  '東武ストア': '東武ストア', 'フレスコ': 'フレスコ', 'オリンピック': 'オリンピック',
  '相鉄ローゼン': 'そうてつローゼン', 'アコレ': 'アコレ', 'コープ': 'コープ',
  'キリン堂': 'キリン堂', 'ゲンキー': 'ゲンキー', 'ウェルパーク': 'ウェルパーク', 'コクミン': 'コクミン',
};

/* 店舗のチェーンを特定（ディレクトリは chain、シード/手動・新規は店名から推定） */
function storeChain(store) {
  if (store.chain && TOKUBAI_SLUG[store.chain]) return store.chain;
  for (const ch of Object.keys(TOKUBAI_SLUG)) if (store.name.includes(ch)) return ch;
  return null;
}

const _revCache = {};
async function reverseGeocode(lat, lon) {
  const key = lat.toFixed(4) + ',' + lon.toFixed(4);
  if (_revCache[key]) return _revCache[key];
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1&accept-language=ja`;
  const res = await fetch(url);
  const j = await res.json();
  const a = j.address || {};
  const iso = a['ISO3166-2-lvl4'] || '';
  const out = {
    city: a.city || a.town || a.city_district || a.county || a.village || '',
    area: a.neighbourhood || a.suburb || a.quarter || '',
    prefCode: iso.startsWith('JP-') ? iso.slice(3) : '',
  };
  _revCache[key] = out;
  return out;
}

/* その店舗のチラシを開く。
 *  トクバイの「チェーン×都道府県×市区」一覧（その店のチラシに直結）へ直接遷移。
 *  トクバイに無いチェーンのみ、店名＋地名のGoogle検索にフォールバック。 */
async function openFlyer(store) {
  if (!store) return;
  const tab = window.open('about:blank', '_blank'); // 同期で開いてポップアップブロックを回避
  const chain = storeChain(store);
  const slug = chain && TOKUBAI_SLUG[chain];
  let url;
  if (slug) {
    let geo = {};
    try { geo = await reverseGeocode(store.lat, store.lon); } catch (e) {}
    if (geo.prefCode && geo.city) {
      // チェーン×市区の一覧を「店舗座標から近い順」に並べ替え → その店舗が先頭に来る
      const params = `?order=near_by_location&latitude=${store.lat}&longitude=${store.lon}`;
      url = `https://tokubai.co.jp/${encodeURIComponent(slug)}/prefectures/${geo.prefCode}/cities/${encodeURIComponent(geo.city)}${params}`;
    } else {
      url = `https://tokubai.co.jp/${encodeURIComponent(slug)}`; // 地名が取れなければチェーンページ
    }
  } else {
    let q = store.name; // トクバイ未対応チェーン → Google検索（地名補完）
    if (!/店/.test(store.name)) {
      try { const g = await reverseGeocode(store.lat, store.lon); q = [store.name, g.city, g.area].filter(Boolean).join(' '); } catch (e) {}
    }
    url = 'https://www.google.com/search?q=' + encodeURIComponent(q + ' チラシ');
  }
  if (tab) tab.location.href = url; else window.open(url, '_blank');
}
function openFlyerById(id) { openFlyer(getStore(id)); }

/* ============================================================
 *  距離コントロール（スライダー＋数値入力）
 * ========================================================== */
function clampDistance(v) {
  let n = Math.round(Number(v) / STEP) * STEP;
  if (!Number.isFinite(n)) n = 1000;
  return Math.min(MAX_DIST, Math.max(MIN_DIST, n));
}
function getDistance() { return clampDistance($('distance-input').value); }
function setDistance(v, source) {
  const d = clampDistance(v);
  if (source !== 'range') $('distance-range').value = d;
  if (source !== 'input') $('distance-input').value = d;
  $('distance-readout').textContent = d.toLocaleString('ja-JP');
}
$('distance-range').addEventListener('input', () => setDistance($('distance-range').value, 'range'));
$('distance-input').addEventListener('change', () => setDistance($('distance-input').value, 'input'));

function setStatus(html, isError = false) {
  $('status').innerHTML = html;
  $('status').classList.toggle('error', isError);
}

/* ============================================================
 *  地図（Leaflet + OpenStreetMap）
 * ========================================================== */
let map = null, storeLayer = null;

function renderMap(coords, radius, results) {
  if (typeof L === 'undefined') return;
  $('map').hidden = false;

  if (!map) {
    map = L.map($('map'), { zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
  }
  if (storeLayer) storeLayer.remove();
  storeLayer = L.layerGroup().addTo(map);

  const center = [coords.latitude, coords.longitude];
  map.setView(center, 15);

  // 測位精度の円（薄い青）。誤差の目安を可視化
  if (coords.accuracy && coords.accuracy > 20) {
    L.circle(center, { radius: coords.accuracy, color: '#1d6fe0', weight: 1,
      fillColor: '#1d6fe0', fillOpacity: 0.08, interactive: false }).addTo(storeLayer);
  }

  // 現在地ピン（ドラッグで手動補正→再検索）
  const userMarker = L.marker(center, {
    draggable: true, autoPan: true, title: 'ドラッグで現在地を補正',
    icon: L.divIcon({ className: 'user-pin', html: '<div class="user-dot"></div>',
      iconSize: [22, 22], iconAnchor: [11, 11] }),
  }).addTo(storeLayer).bindPopup('<b>現在地</b><br>ドラッグで補正できます');
  userMarker.on('dragend', (e) => {
    const p = e.target.getLatLng();
    searchState.coords = { latitude: p.lat, longitude: p.lng };
    searchState.accuracy = 0; // 手動補正後は精度表示を消す
    recomputeAndRender();
  });

  const circle = L.circle(center, { radius, color: '#e8462e', weight: 1.5, fillColor: '#e8462e', fillOpacity: 0.06 })
    .addTo(storeLayer);

  for (const r of results) {
    const top = r.sales[0];
    const saleHtml = top
      ? `<div class="popup-sale">${escapeHtml(top.name)} <span class="price">${fmtYen(top.price)}</span></div>`
      : '<div class="popup-sale">特売は未登録</div>';
    const linkHtml = `<div><a href="#" onclick="openFlyerById('${escapeHtml(r.store.id)}');return false;">チラシを見る ↗</a></div>`;
    L.circleMarker([r.store.lat, r.store.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#e8462e', fillOpacity: 1 })
      .addTo(storeLayer)
      .bindPopup(
        `<div class="popup-name">${escapeHtml(r.store.name)}</div>` +
        `<div class="popup-cat">${escapeHtml(r.store.category)}</div>` +
        saleHtml +
        `<div class="popup-dist">現在地から ${distText(r.distance)}</div>` + linkHtml
      );
  }
  map.fitBounds(circle.getBounds(), { padding: [16, 16] });
  setTimeout(() => map.invalidateSize(), 0);
}

/* ============================================================
 *  さがす：検索＆描画
 * ========================================================== */
function renderResults(results) {
  if (!results.length) {
    $('results').innerHTML =
      '<div class="empty">この範囲に店舗が見つかりませんでした。<br>距離を広げてお試しください。</div>';
    return;
  }
  $('results').innerHTML = results.map((r) => {
    const saleRows = r.sales.map((it) => `
      <li class="sale-item">
        <span class="name">${escapeHtml(it.name)}<span class="sale-badge">特売</span></span>
        <span class="price-wrap">
          <span class="price">${fmtYen(it.price)}</span>
          ${it.was ? `<span class="was">${fmtYen(it.was)}</span>` : ''}
        </span>
      </li>`).join('');
    const link = `<a class="chirashi-link" href="#" data-flyer="${escapeHtml(r.store.id)}">チラシを見る ↗</a>`;
    const body = r.sales.length ? `<ul class="sale-list">${saleRows}</ul>` : '';
    return `
      <article class="store-card">
        <div class="store-head">
          <div>
            <h2 class="store-name">${escapeHtml(r.store.name)}</h2>
            <div class="store-cat">${escapeHtml(r.store.category)} ${link}</div>
          </div>
          <div class="store-dist">${distText(r.distance)}<small>現在地から</small></div>
        </div>
        ${body}
      </article>`;
  }).join('');

  // 「チラシを見る」→ その店舗のチラシを開く
  $('results').querySelectorAll('a[data-flyer]').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); openFlyerById(a.dataset.flyer); });
  });
}

/* 現在のページ（10件）を描画 */
function renderPage() {
  if (!searchState) return;
  const { coords, radius, results, total, page } = searchState;
  if (!results.length) {
    renderResults([]);
    renderMap(coords, radius, []);
    $('pager').innerHTML = '';
    setStatus('');
    return;
  }
  const pages = Math.ceil(results.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageItems = results.slice(start, start + PAGE_SIZE);

  renderMap(coords, radius, pageItems);
  renderResults(pageItems);
  renderPager(pages, page);

  const capped = total > MAX_RESULTS ? `（近い順に上位${MAX_RESULTS}件まで）` : '';
  const acc = searchState.accuracy
    ? ` <span class="acc-note">／ 現在地の精度 ±${Math.round(searchState.accuracy)}m（地図の青ピンをドラッグで補正）</span>`
    : '';
  setStatus(`${total} 件中 ${start + 1}〜${start + pageItems.length} 件を表示${capped}${acc}`);
}

/* ページャー（前へ／ページ番号／次へ） */
function renderPager(pages, current) {
  if (pages <= 1) { $('pager').innerHTML = ''; return; }
  let html = `<button class="page-btn nav" data-page="${current - 1}" ${current === 0 ? 'disabled' : ''}>‹ 前</button>`;
  for (let i = 0; i < pages; i++) {
    html += `<button class="page-btn ${i === current ? 'active' : ''}" data-page="${i}">${i + 1}</button>`;
  }
  html += `<button class="page-btn nav" data-page="${current + 1}" ${current === pages - 1 ? 'disabled' : ''}>次 ›</button>`;
  $('pager').innerHTML = html;
  $('pager').querySelectorAll('.page-btn').forEach((b) => {
    if (b.disabled) return;
    b.addEventListener('click', () => {
      searchState.page = parseInt(b.dataset.page, 10);
      renderPage();
      $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* 指定地点・距離から結果を計算（再検索でも共用） */
function computeResults(coords, radius) {
  const sales = loadSales();
  return getAllStores()
    .map((store) => ({
      store,
      distance: Math.round(haversine(coords.latitude, coords.longitude, store.lat, store.lon)),
      sales: sales[store.id] || [],
    }))
    .filter((r) => r.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
}

/* 取得済みの座標・距離で再検索（ピンのドラッグや距離変更時に使用） */
function recomputeAndRender() {
  const { coords, radius } = searchState;
  const all = computeResults(coords, radius);
  searchState.results = all.slice(0, MAX_RESULTS);
  searchState.total = all.length;
  searchState.page = 0;
  renderPage();
}

async function runSearch() {
  const radius = getDistance();
  $('search-btn').disabled = true;
  $('results').innerHTML = '';
  $('pager').innerHTML = '';
  setStatus('<span class="spinner"></span>現在地を測位中…');
  try {
    await loadDirectory();
    const coords = await getAccuratePosition({
      onProgress: (acc) =>
        setStatus(`<span class="spinner"></span>現在地を測位中…（精度 ±${Math.round(acc)}m）`),
    });
    searchState = { coords, radius, accuracy: coords.accuracy, results: [], total: 0, page: 0 };
    recomputeAndRender();
  } catch (e) {
    setStatus(escapeHtml(e.message), true);
  } finally {
    $('search-btn').disabled = false;
  }
}
$('search-btn').addEventListener('click', runSearch);

/* ---------- 初期化 ---------- */
setDistance(1000);
loadStores(); // スーパーのシード投入
ensureSeedBatch('drugstores-machida-v1', DRUGSTORE_SEED); // ドラッグストアを一度だけ追加
ensureSeedBatch('drugstores-machida-v2', DRUGSTORE_SEED_V2); // クリエイト・ウエルシアを一度だけ追加
ensureSeedBatch('stores-machida-v3', STORE_SEED_V3); // トモズ・デポー・業務スーパー・ツルハを一度だけ追加
loadDirectory(); // 全国ディレクトリを先読み

/* Service Worker は使わない（キャッシュ起因の更新不具合を避けるため）。
 * 既存の登録が残っていれば解除し、キャッシュも掃除する。 */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
  if (window.caches) {
    caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
  }
}
