// ====== КОНФИГУРАЦИЯ ПРЕПАРАТОВ (версия 1.3) ======
const defaultMeds = [
  { id: 1, name: 'Тетрациклин', dosage: '1 таблетка', conditions:
    'Запить стаканом воды. 30 минут не ложиться.\nНельзя: молочка, кальций, магний, железо, антациды (2 ч до и после).\nИзбегать солнца/солярия.',
    schedule: ['08:00','14:00','20:00','02:00'], startDate: new Date().toISOString(), durationDays: 10, active: true },
  { id: 2, name: 'Уро-Ваксом', dosage: '1 капсула', conditions:
    'Принимать утром, можно после еды, запивать водой.',
    schedule: ['08:30'], startDate: new Date().toISOString(), durationDays: 90, active: true },
  { id: 3, name: 'Циурол', dosage: '1 таблетка', conditions:
    'Принимать после еды, желательно в одно и то же время.',
    schedule: ['после завтрака','после ужина'], startDate: new Date().toISOString(), durationDays: 90, active: true },
  { id: 4, name: 'Вобэнзим', dosage: '3 таблетки', conditions:
    'Можно после еды для меньшего раздражения желудка.',
    schedule: ['после завтрака','после обеда','после ужина'], startDate: new Date().toISOString(), durationDays: 14, active: true },
  { id: 5, name: 'Линекс Форте', dosage: '1 капсула', conditions:
    'Принимать вечером, после ужина. Запивать водой, не горячими напитками.',
    schedule: ['после ужина'], startDate: new Date().toISOString(), durationDays: 24, active: true }
];

const defaultSettings = {
  wakeUpTime: '08:00',
  tet1Offset: 0,
  uroOffset: 30,
  breakfastOffset: 60,
  tet2Offset: 360,
  lunchOffset: 420,
  tet3Offset: 720,
  dinnerOffset: 780,
  tet4Offset: 1080
};

const availableSlots = [
  { id: '08:00', label: '08:00 (утренний тетрациклин)' },
  { id: '08:30', label: '08:30 (Уро-Ваксом)' },
  { id: '14:00', label: '14:00 (дневной тетрациклин)' },
  { id: '20:00', label: '20:00 (вечерний тетрациклин)' },
  { id: '02:00', label: '02:00 (ночной тетрациклин)' },
  { id: 'после завтрака', label: 'После завтрака' },
  { id: 'после обеда', label: 'После обеда' },
  { id: 'после ужина', label: 'После ужина' }
];

// ====== ЛОКАЛЬНАЯ ДАТА ======
function getLocalDateString(date = new Date()) {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ====== INDEXEDDB ======
const DB_NAME = 'MedTracker';
const DB_VERSION = 2;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      const names = db.objectStoreNames;
      if (names.contains('medications')) db.deleteObjectStore('medications');
      if (names.contains('history')) db.deleteObjectStore('history');
      const ms = db.createObjectStore('medications', { keyPath: 'id' });
      ms.createIndex('active', 'active', { unique: false });
      const hs = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
      hs.createIndex('date', 'date', { unique: false });
      hs.createIndex('medicationId', 'medicationId', { unique: false });
    };
  });
}

async function getMeds() {
  if (!db) throw new Error('DB not open');
  return new Promise((resolve, reject) => {
    const tx = db.transaction('medications', 'readonly');
    const store = tx.objectStore('medications');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveMeds(meds) {
  if (!db) throw new Error('DB not open');
  return new Promise((resolve, reject) => {
    const tx = db.transaction('medications', 'readwrite');
    const store = tx.objectStore('medications');
    store.clear();
    meds.forEach(m => store.put(m));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function addHistory(entry) {
  if (!db) throw new Error('DB not open');
  return new Promise((resolve, reject) => {
    const tx = db.transaction('history', 'readwrite');
    const store = tx.objectStore('history');
    const req = store.add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function removeHistory(medId, dateStr, slot) {
  if (!db) throw new Error('DB not open');
  return new Promise((resolve, reject) => {
    const tx = db.transaction('history', 'readwrite');
    const store = tx.objectStore('history');
    const index = store.index('date');
    const range = IDBKeyRange.only(dateStr);
    const req = index.openCursor(range);
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const h = cursor.value;
        if (h.medicationId === medId && h.slot === slot) cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
}

async function getHistoryByDate(dateStr) {
  if (!db) throw new Error('DB not open');
  return new Promise((resolve, reject) => {
    const tx = db.transaction('history', 'readonly');
    const store = tx.objectStore('history');
    const index = store.index('date');
    const range = IDBKeyRange.only(dateStr);
    const req = index.getAll(range);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function initializeDB() {
  try {
    await openDB();
    let meds = await getMeds();
    if (meds.length === 0) await saveMeds(defaultMeds);
  } catch (e) {
    console.error('DB error, trying to recreate...', e);
    if (db) { db.close(); indexedDB.deleteDatabase(DB_NAME); }
    await openDB();
    await saveMeds(defaultMeds);
  }
}

// ====== LOCALSTORAGE ======
function loadSettings() {
  return JSON.parse(localStorage.getItem('medSettings') || JSON.stringify(defaultSettings));
}
function saveSettings(s) { localStorage.setItem('medSettings', JSON.stringify(s)); }
function getUserName() { return localStorage.getItem('userName') || 'Конфета'; }
function setUserName(n) { localStorage.setItem('userName', n); }
function getTodayWakeUp() { const v = localStorage.getItem('todayWakeUp'); return v ? new Date(v) : null; }
function setTodayWakeUp(d) { localStorage.setItem('todayWakeUp', d.toISOString()); }
function clearTodayWakeUp() { localStorage.removeItem('todayWakeUp'); }
function getMealFlags() { return JSON.parse(localStorage.getItem('mealFlags') || '{}'); }
function setMealFlags(f) { localStorage.setItem('mealFlags', JSON.stringify(f)); }

// ====== ПРИВЕТСТВИЕ ======
function getGreeting(name) {
  const h = new Date().getHours();
  if (h >= 3 && h < 10) return `Доброе утро, ${name}`;
  if (h >= 10 && h < 17) return `Добрый день, ${name}`;
  if (h >= 17 && h < 22) return `Добрый вечер, ${name}`;
  return `Доброй ночи, ${name}`;
}
function updateGreeting() {
  const el = document.getElementById('greeting');
  if (el) el.textContent = getGreeting(getUserName());
}

// ====== TOAST ======
function showToast(msg) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ====== ТЕМА ======
function applyTheme(theme, accent) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-accent', accent);
  localStorage.setItem('theme', theme);
  localStorage.setItem('accent', accent);
}
function loadTheme() {
  const t = localStorage.getItem('theme') || 'dark';
  const a = localStorage.getItem('accent') || 'blue';
  applyTheme(t, a);
}

// ====== УВЕДОМЛЕНИЯ ЧЕРЕЗ SERVICE WORKER ======
let notificationTimers = [];

function clearAllNotifications() {
  notificationTimers.forEach(t => clearTimeout(t));
  notificationTimers = [];
}

async function sendNotification(title, options, delayMs) {
  if (delayMs <= 0) return;
  const timer = setTimeout(async () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, options);
      });
    } else if (Notification.permission === 'granted') {
      new Notification(title, options);
    }
  }, delayMs);
  notificationTimers.push(timer);
}

function scheduleNotifications(dayTimes) {
  if (!('Notification' in window) && !('serviceWorker' in navigator)) return;
  if (Notification.permission === 'denied') return;

  const doNotify = () => {
    clearAllNotifications();
    const now = new Date();

    const schedule = (time, title, body, tag) => {
      const diff = time - now;
      if (diff <= 0) return;
      const options = { body, icon: 'icon-192.png', tag, vibrate: [200, 100, 200] };
      sendNotification(title, options, diff);
      if (diff > 120000) {
        sendNotification(title, { ...options, body: `🔁 ${body}` }, diff + 120000);
      }
    };

    const tetLabels = ['утро','день','вечер','ночь'];
    dayTimes.tetTimes.forEach((t, i) => {
      schedule(t, `💊 Тетрациклин (${tetLabels[i]})`, 'Запить водой, не ложиться 30 мин', `tet-${i}`);
    });

    schedule(new Date(dayTimes.breakfastTime.getTime() - 5*60000), '🍽 Скоро завтрак', 'После еды: Циурол, Вобэнзим', 'bf');
    schedule(new Date(dayTimes.lunchTime.getTime() - 5*60000), '🍽 Скоро обед', 'После еды: Вобэнзим', 'lu');
    schedule(new Date(dayTimes.dinnerTime.getTime() - 5*60000), '🍽 Скоро ужин', 'После еды: Линекс Форте, Циурол, Вобэнзим', 'di');
  };

  if (Notification.permission === 'granted') {
    doNotify();
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') doNotify();
    });
  }
}

// ====== РАСЧЁТ ВРЕМЕНИ ДНЯ ======
function calculateDayTimes(wakeUp) {
  const s = loadSettings();
  const breakfastTime = new Date(wakeUp.getTime() + s.breakfastOffset * 60000);
  const lunchTime = new Date(wakeUp.getTime() + s.lunchOffset * 60000);
  const dinnerTime = new Date(wakeUp.getTime() + s.dinnerOffset * 60000);
  const tetTimes = [
    new Date(wakeUp.getTime() + s.tet1Offset * 60000),
    new Date(wakeUp.getTime() + s.tet2Offset * 60000),
    new Date(wakeUp.getTime() + s.tet3Offset * 60000),
    new Date(wakeUp.getTime() + s.tet4Offset * 60000)
  ];
  const uroTime = new Date(wakeUp.getTime() + s.uroOffset * 60000);

  // Молочные окна (2 часа после каждого тетрациклина)
  const milkWindows = [];
  const sorted = [...tetTimes].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = new Date(sorted[i].getTime() + 2 * 3600000);
    const end = new Date(sorted[i + 1].getTime() - 2 * 3600000);
    if (start < end) milkWindows.push({ start, end });
  }

  return { breakfastTime, lunchTime, dinnerTime, tetTimes, uroTime, milkWindows };
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// ====== ГЛАВНЫЙ РЕНДЕРИНГ (с отображением времени пробуждения) ======
async function renderApp() {
  const main = document.getElementById('mainContent');
  if (!main) return;
  const wakeUp = getTodayWakeUp();
  const dayTimes = wakeUp ? calculateDayTimes(wakeUp) : null;
  const mealFlags = getMealFlags();
  const userName = getUserName();
  const greeting = getGreeting(userName);

  if (!wakeUp || wakeUp.toDateString() !== new Date().toDateString()) {
    main.innerHTML = `<div class="card" style="text-align:center">
      <div style="font-size:22px;font-weight:700;margin-bottom:16px">${greeting}</div>
      <button class="btn-wake" id="btnWakeUp">Я проснулась</button>
    </div>`;
    const btn = document.getElementById('btnWakeUp');
    if (btn) btn.addEventListener('click', onWakeUp);
    return;
  }

  const activeMeds = (await getMeds()).filter(m => m.active);
  const now = new Date();
  const todayStr = getLocalDateString();
  const historyToday = await getHistoryByDate(todayStr);
  let html = `<div style="font-size:18px;font-weight:700;margin-bottom:8px">${greeting}</div>`;

  // Блок времени пробуждения с возможностью редактирования
  html += `<div class="card">
    <div class="wakeup-info">
      <span>⏰ Проснулась в <span class="wakeup-time">${formatTime(wakeUp)}</span></span>
      <button class="wakeup-edit editable-time" data-edit-time="wakeup">✏️ Изменить</button>
    </div>
  </div>`;

  const events = [];

  // Тетрациклины
  const tetMeds = activeMeds.filter(m => m.name === 'Тетрациклин');
  const tetLabels = ['🌅 Утро · Тетрациклин', '☀️ День · Тетрациклин', '🌇 Вечер · Тетрациклин', '🌙 Ночь · Тетрациклин'];
  dayTimes.tetTimes.forEach((time, idx) => {
    events.push({ type: 'tet', time, label: tetLabels[idx], slotKey: `tet-${idx}`, meds: tetMeds, conditions: tetMeds.length ? tetMeds[0].conditions : '' });
  });

  // Уро-Ваксом
  const uroMeds = activeMeds.filter(m => m.name === 'Уро-Ваксом');
  if (uroMeds.length) {
    events.push({ type: 'med', time: dayTimes.uroTime, label: '💧 Уро-Ваксом', slotKey: 'uro', meds: uroMeds });
  }

  // Приёмы пищи
  const mealSlots = [
    { mealKey: 'breakfast', time: dayTimes.breakfastTime, label: '🍽 Завтрак', postSlot: 'после завтрака' },
    { mealKey: 'lunch', time: dayTimes.lunchTime, label: '🍽 Обед', postSlot: 'после обеда' },
    { mealKey: 'dinner', time: dayTimes.dinnerTime, label: '🍽 Ужин', postSlot: 'после ужина' }
  ];
  mealSlots.forEach(m => {
    events.push({ type: 'meal', time: m.time, label: m.label, mealKey: m.mealKey, postSlot: m.postSlot });
  });

  // Блоки «Перекус + молочное»
  if (dayTimes.milkWindows.length > 0) {
    dayTimes.milkWindows.forEach((win, idx) => {
      events.push({
        type: 'snack-milk',
        start: win.start,
        end: win.end,
        label: `🥛 Перекус + молочное (${idx + 1})`
      });
    });
  }

  // Сортировка
  events.sort((a, b) => {
    const timeA = a.type === 'snack-milk' ? a.start : a.time;
    const timeB = b.type === 'snack-milk' ? b.start : b.time;
    return timeA - timeB;
  });

  // Рендеринг событий
  for (const ev of events) {
    if (ev.type === 'tet' || ev.type === 'med') {
      const slotAvailable = now >= ev.time;
      const diff = Math.ceil((ev.time - now) / 60000);
      const reason = !slotAvailable ? `⏳ через ${diff} мин` : '';
      html += `<div class="card" style="${!slotAvailable ? 'opacity:0.6' : ''}">
        <div class="card-title">
          ${ev.label}
          (<span class="editable-time" data-edit-time="${ev.slotKey}">${formatTime(ev.time)}</span>)
        </div>`;
      if (reason) html += `<div class="countdown-text">${reason}</div>`;
      ev.meds.forEach(med => {
        const taken = historyToday.some(h => h.medicationId === med.id && h.slot === ev.slotKey);
        html += `<div class="med-item">
          <span class="med-name ${taken?'completed':''}" data-id="${med.id}" style="cursor:pointer">💊 ${med.name} — ${med.dosage}</span>
          <button class="med-check ${taken?'taken':''}" data-med="${med.id}" data-slot="${ev.slotKey}" ${!slotAvailable?'disabled':''}>${taken?'✓':''}</button>
        </div>`;
      });
      if (ev.type === 'tet' && ev.conditions) html += `<div class="alert-warning">⚠️ ${ev.conditions}</div>`;
      html += `</div>`;
    } else if (ev.type === 'meal') {
      const mealDone = !!mealFlags[ev.mealKey];
      const timeReached = now >= ev.time;
      const postMeds = activeMeds.filter(m => m.schedule.includes(ev.postSlot));
      html += `<div class="card">
        <div class="card-title">
          ${ev.label}
          (<span class="editable-time" data-edit-time="meal-${ev.mealKey}">${formatTime(ev.time)}</span>)
        </div>`;
      if (!timeReached) {
        html += `<div class="countdown-text">⏳ через ${Math.ceil((ev.time - now)/60000)} мин</div>`;
      } else if (!mealDone) {
        const mealLabels = { breakfast: 'Я позавтракала', lunch: 'Я пообедала', dinner: 'Я поужинала' };
        html += `<button class="meal-btn" data-meal="${ev.mealKey}">${mealLabels[ev.mealKey]}</button>`;
      }
      if (postMeds.length) {
        html += `<div style="margin-top:8px"><strong>После еды:</strong></div>`;
        postMeds.forEach(med => {
          const taken = historyToday.some(h => h.medicationId === med.id && h.slot === ev.postSlot);
          const canCheck = mealDone;
          html += `<div class="med-item" style="${!canCheck ? 'opacity:0.5' : ''}">
            <span class="med-name ${taken?'completed':''}" data-id="${med.id}" style="cursor:pointer">💊 ${med.name} — ${med.dosage}</span>
            <button class="med-check ${taken?'taken':''}" data-med="${med.id}" data-slot="${ev.postSlot}" ${!canCheck?'disabled':''}>${taken?'✓':''}</button>
          </div>`;
        });
      }
      html += `</div>`;
    } else if (ev.type === 'snack-milk') {
      html += `<div class="card">
        <div class="card-title">
          ${ev.label}
          (<span class="editable-time" data-edit-time="snack-start-${ev.label.match(/\d+/)[0]}">${formatTime(ev.start)}</span>–<span class="editable-time" data-edit-time="snack-end-${ev.label.match(/\d+/)[0]}">${formatTime(ev.end)}</span>)
        </div>
        <div class="snack-block">
          <div class="snack-title">Разрешено:</div>
          <ul class="snack-list">
            <li>Фрукты</li><li>Каши</li><li>Бутерброды</li><li>Сладкое</li><li>Чай/кофе</li>
            <li>🥛 Молочные продукты</li>
          </ul>
        </div>
      </div>`;
    }
  }

  // Завершение курсов
  html += `<div class="card">
    <div class="card-title">📋 Управление курсами</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${activeMeds.map(m => `<div style="display:flex;align-items:center;justify-content:space-between">
        <span>💊 ${m.name} (${m.dosage})</span>
        <button class="btn-ghost" style="padding:6px 12px;font-size:13px" data-end-course="${m.id}">Завершить</button>
      </div>`).join('')}
    </div>
  </div>`;

  main.innerHTML = html;

  // Обработчики
  document.querySelectorAll('.med-check:not([disabled])').forEach(b => b.addEventListener('click', onMedCheck));
  document.querySelectorAll('.med-name').forEach(n => n.addEventListener('click', onMedDetail));
  document.querySelectorAll('[data-meal]').forEach(b => b.addEventListener('click', onMealClick));
  document.querySelectorAll('[data-end-course]').forEach(b => b.addEventListener('click', onEndCourse));

  // Кликабельное время
  document.querySelectorAll('.editable-time').forEach(el => {
    el.addEventListener('click', onTimeClick);
  });
}

// ====== ОБРАБОТЧИКИ ======
async function onWakeUp() {
  const now = new Date();
  setTodayWakeUp(now);
  setMealFlags({});
  showToast('☀️ Доброе утро! График составлен.');
  await renderApp();
  scheduleNotifications(calculateDayTimes(now));
}

async function onMedCheck(e) {
  const btn = e.currentTarget;
  const medId = parseInt(btn.dataset.med);
  const slot = btn.dataset.slot;
  const wasTaken = btn.classList.contains('taken');
  const todayStr = getLocalDateString();

  if (wasTaken) {
    await removeHistory(medId, todayStr, slot);
    btn.classList.remove('taken');
    btn.textContent = '';
    const nameEl = btn.parentElement.querySelector('.med-name');
    if (nameEl) nameEl.classList.remove('completed');
    const meds = await getMeds();
    const med = meds.find(m => m.id === medId);
    showToast(`↩️ Отмена: ${med?.name || 'препарат'}`);
  } else {
    await addHistory({ medicationId: medId, date: todayStr, slot, taken: true, timestamp: new Date().toISOString() });
    btn.classList.add('taken');
    btn.textContent = '✓';
    const nameEl = btn.parentElement.querySelector('.med-name');
    if (nameEl) nameEl.classList.add('completed');
    const meds = await getMeds();
    const med = meds.find(m => m.id === medId);
    showToast(`✅ Принято: ${med?.name || 'препарат'}`);
  }
}

async function onMedDetail(e) {
  const medId = parseInt(e.currentTarget.dataset.id);
  const meds = await getMeds();
  const med = meds.find(m => m.id === medId);
  if (med) openMedInfoModal(med);
}

async function onMealClick(e) {
  const meal = e.currentTarget.dataset.meal;
  const flags = getMealFlags();
  flags[meal] = true;
  setMealFlags(flags);
  const mealNames = { breakfast: 'завтрак', lunch: 'обед', dinner: 'ужин' };
  showToast(`🍽 Приём пищи отмечен: ${mealNames[meal] || meal}`);
  await renderApp();
}

async function onEndCourse(e) {
  const medId = parseInt(e.currentTarget.dataset.endCourse);
  const meds = await getMeds();
  const med = meds.find(m => m.id === medId);
  if (!med) return;
  if (confirm(`Завершить курс «${med.name}»?`)) {
    med.active = false;
    await saveMeds(meds);
    showToast(`🏁 Курс завершён: ${med.name}`);
    await renderApp();
  }
}

// ====== КРАСИВОЕ ОКНО РЕДАКТИРОВАНИЯ ВРЕМЕНИ ======
function openTimeModal(editKey, currentTime) {
  const { close } = openModal('⏰ Изменить время', `
    <label class="field-label">Новое время (ЧЧ:ММ)</label>
    <input type="text" class="input-field" id="timeInput" value="${currentTime}" placeholder="08:00" pattern="\\d{1,2}:\\d{2}" />
  `, [
    { id: 'saveTime', text: 'Сохранить', cls: 'btn-primary' },
    { id: 'cancelTime', text: 'Отмена', cls: 'btn-ghost' }
  ]);

  document.getElementById('saveTime').addEventListener('click', () => {
    const newTime = document.getElementById('timeInput').value.trim();
    if (newTime && /^\d{1,2}:\d{2}$/.test(newTime)) {
      applyTimeChange(editKey, newTime);
      close();
    } else {
      showToast('⚠️ Введите время в формате ЧЧ:ММ');
    }
  });
  document.getElementById('cancelTime').addEventListener('click', close);
}

async function applyTimeChange(editKey, newTime) {
  const [h, m] = newTime.split(':').map(Number);
  const wakeUp = getTodayWakeUp();
  if (!wakeUp) return;

  // Для изменения времени пробуждения
  if (editKey === 'wakeup') {
    const newWakeUp = new Date(wakeUp);
    newWakeUp.setHours(h, m, 0, 0);
    if (newWakeUp > new Date()) {
      showToast('⚠️ Время пробуждения не может быть в будущем');
      return;
    }
    setTodayWakeUp(newWakeUp);
    showToast(`⏰ Время пробуждения изменено на ${newTime}`);
    await renderApp();
    scheduleNotifications(calculateDayTimes(newWakeUp));
    return;
  }

  // Для других событий вычисляем смещение от пробуждения
  const wakeUpBase = new Date(wakeUp);
  wakeUpBase.setHours(0, 0, 0, 0);
  const newDate = new Date(wakeUpBase);
  newDate.setHours(h, m, 0, 0);
  if (newDate < wakeUp) newDate.setDate(newDate.getDate() + 1);
  const diffMinutes = Math.round((newDate - wakeUp) / 60000);
  if (diffMinutes < 0) {
    showToast('⚠️ Время не может быть раньше пробуждения');
    return;
  }

  const s = loadSettings();
  if (editKey.startsWith('tet-')) {
    const idx = parseInt(editKey.replace('tet-', ''));
    const keys = ['tet1Offset', 'tet2Offset', 'tet3Offset', 'tet4Offset'];
    s[keys[idx]] = diffMinutes;
  } else if (editKey === 'uro') {
    s.uroOffset = diffMinutes;
  } else if (editKey.startsWith('meal-')) {
    const mealKey = editKey.replace('meal-', '');
    if (mealKey === 'breakfast') s.breakfastOffset = diffMinutes;
    else if (mealKey === 'lunch') s.lunchOffset = diffMinutes;
    else if (mealKey === 'dinner') s.dinnerOffset = diffMinutes;
  } else if (editKey.startsWith('snack-start-')) {
    const idx = parseInt(editKey.replace('snack-start-', ''));
    if (idx >= 1 && idx <= 3) {
      const tetKeys = ['tet1Offset', 'tet2Offset', 'tet3Offset', 'tet4Offset'];
      s[tetKeys[idx - 1]] = diffMinutes - 120;
    }
  } else if (editKey.startsWith('snack-end-')) {
    const idx = parseInt(editKey.replace('snack-end-', ''));
    if (idx >= 1 && idx <= 3) {
      const tetKeys = ['tet1Offset', 'tet2Offset', 'tet3Offset', 'tet4Offset'];
      s[tetKeys[idx - 1]] = diffMinutes - 360;
    }
  }
  saveSettings(s);
  showToast(`⏰ Время обновлено на ${newTime}`);
  await renderApp();
  scheduleNotifications(calculateDayTimes(wakeUp));
}

async function onTimeClick(e) {
  const el = e.currentTarget;
  const editKey = el.dataset.editTime;
  const currentTime = el.textContent;
  openTimeModal(editKey, currentTime);
}

// ====== МОДАЛЬНЫЕ ОКНА ======
function openModal(title, contentHtml, buttons = []) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:500px">
      <div class="modal-handle"></div>
      <div class="modal-title">${title}</div>
      ${contentHtml}
      <div class="modal-actions">${buttons.map(b => `<button class="${b.cls || 'btn-ghost'}" id="${b.id}">${b.text}</button>`).join('')}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return { overlay, close };
}

function openThemeModal() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const currentAccent = document.documentElement.getAttribute('data-accent');
  const { close } = openModal('🎨 Оформление', `
    <div class="mode-switch">
      <button class="mode-sw-btn ${currentTheme==='dark'?'active':''}" data-theme="dark">Тёмная</button>
      <button class="mode-sw-btn ${currentTheme==='light'?'active':''}" data-theme="light">Светлая</button>
    </div>
    <div class="modal-section-title">Цветовая схема</div>
    <div class="theme-grid">
      ${[
        {accent:'blue', class:'tp-dark-blue', label:'Синий'},
        {accent:'purple', class:'tp-dark-purple', label:'Фиолетовый'},
        {accent:'green', class:'tp-dark-green', label:'Зелёный'},
        {accent:'rose', class:'tp-dark-rose', label:'Розовый'},
      ].map(a => `
        <div class="theme-tile ${currentAccent===a.accent?'active':''}" data-accent="${a.accent}">
          <div class="tile-preview ${a.class}"></div>
          <span>${a.label}</span>
        </div>
      `).join('')}
    </div>
  `, [{ id: 'closeThemeModal', text: 'Закрыть', cls: 'btn-ghost' }]);
  
  document.getElementById('closeThemeModal').addEventListener('click', close);
  document.querySelectorAll('.mode-sw-btn').forEach(b => b.addEventListener('click', () => {
    applyTheme(b.dataset.theme, currentAccent);
    close();
    renderApp();
  }));
  document.querySelectorAll('.theme-tile').forEach(t => t.addEventListener('click', () => {
    applyTheme(currentTheme, t.dataset.accent);
    close();
    renderApp();
  }));
}

function openMedInfoModal(med) {
  const { close } = openModal(`💊 ${med.name}`, `
    <div style="display:flex;flex-direction:column;gap:8px;padding:8px 0">
      <div><strong>Дозировка:</strong> ${med.dosage}</div>
      <div><strong>Длительность:</strong> ${med.durationDays ? med.durationDays + ' дней' : 'пока не завершён'}</div>
      ${med.conditions ? `<div style="margin-top:8px;padding:10px;background:var(--accent-soft);border-radius:12px"><strong>Особые указания:</strong><br>${med.conditions.replace(/\n/g, '<br>')}</div>` : ''}
    </div>
  `, [{ id: 'closeMedInfo', text: 'Закрыть', cls: 'btn-ghost' }]);
  document.getElementById('closeMedInfo').addEventListener('click', close);
}

async function showNameModal() {
  const { close } = openModal('👤 Изменить имя', `
    <input type="text" class="input-field" id="nameInput" value="${getUserName()}" placeholder="Введите имя" />
  `, [
    { id: 'saveName', text: 'Сохранить', cls: 'btn-primary' },
    { id: 'cancelName', text: 'Отмена', cls: 'btn-ghost' }
  ]);
  document.getElementById('saveName').addEventListener('click', () => {
    const name = document.getElementById('nameInput').value.trim();
    if (name) {
      setUserName(name);
      updateGreeting();
      renderApp();
      showToast(`👤 Имя изменено на ${name}`);
    }
    close();
  });
  document.getElementById('cancelName').addEventListener('click', close);
}

async function showIntervalsModal() {
  const s = loadSettings();
  const { close } = openModal('⏱ Интервалы приёма', `
    <label class="field-label">Тетрациклин 1 (мин от пробуждения)</label>
    <input type="number" class="input-field" id="tet1Offset" value="${s.tet1Offset}" min="0" max="120" />
    <label class="field-label">Уро-Ваксом (мин от пробуждения)</label>
    <input type="number" class="input-field" id="uroOffset" value="${s.uroOffset}" min="0" max="180" />
    <label class="field-label">Завтрак (мин от пробуждения)</label>
    <input type="number" class="input-field" id="breakfastOffset" value="${s.breakfastOffset}" min="10" max="240" />
    <label class="field-label">Тетрациклин 2 (мин от пробуждения)</label>
    <input type="number" class="input-field" id="tet2Offset" value="${s.tet2Offset}" min="60" max="600" />
    <label class="field-label">Обед (мин от пробуждения)</label>
    <input type="number" class="input-field" id="lunchOffset" value="${s.lunchOffset}" min="120" max="720" />
    <label class="field-label">Тетрациклин 3 (мин от пробуждения)</label>
    <input type="number" class="input-field" id="tet3Offset" value="${s.tet3Offset}" min="300" max="900" />
    <label class="field-label">Ужин (мин от пробуждения)</label>
    <input type="number" class="input-field" id="dinnerOffset" value="${s.dinnerOffset}" min="360" max="1080" />
    <label class="field-label">Тетрациклин 4 (мин от пробуждения)</label>
    <input type="number" class="input-field" id="tet4Offset" value="${s.tet4Offset}" min="720" max="1440" />
  `, [
    { id: 'saveIntervals', text: 'Сохранить', cls: 'btn-primary' },
    { id: 'cancelIntervals', text: 'Отмена', cls: 'btn-ghost' }
  ]);
  document.getElementById('saveIntervals').addEventListener('click', () => {
    s.tet1Offset = parseInt(document.getElementById('tet1Offset').value) || 0;
    s.uroOffset = parseInt(document.getElementById('uroOffset').value) || 30;
    s.breakfastOffset = parseInt(document.getElementById('breakfastOffset').value) || 60;
    s.tet2Offset = parseInt(document.getElementById('tet2Offset').value) || 360;
    s.lunchOffset = parseInt(document.getElementById('lunchOffset').value) || 420;
    s.tet3Offset = parseInt(document.getElementById('tet3Offset').value) || 720;
    s.dinnerOffset = parseInt(document.getElementById('dinnerOffset').value) || 780;
    s.tet4Offset = parseInt(document.getElementById('tet4Offset').value) || 1080;
    saveSettings(s);
    close();
    renderApp();
    const wakeUp = getTodayWakeUp();
    if (wakeUp) scheduleNotifications(calculateDayTimes(wakeUp));
    showToast('⏱ Интервалы обновлены');
  });
  document.getElementById('cancelIntervals').addEventListener('click', close);
}

async function openMedEditor(med = null) {
  const isNew = !med;
  const medData = med || {
    id: Date.now(),
    name: '',
    dosage: '',
    conditions: '',
    schedule: [],
    startDate: new Date().toISOString(),
    durationDays: 30,
    active: true
  };

  const slotsHtml = availableSlots.map(slot => {
    const checked = medData.schedule.includes(slot.id) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:8px;padding:6px 0">
      <input type="checkbox" value="${slot.id}" ${checked} style="accent-color:var(--accent); width:18px; height:18px;" />
      <span>${slot.label}</span>
    </label>`;
  }).join('');

  const { close } = openModal(isNew ? '➕ Новый препарат' : `✏️ ${medData.name}`, `
    <label class="field-label">Название</label>
    <input type="text" class="input-field" id="medName" value="${medData.name}" placeholder="Название" />
    <label class="field-label">Дозировка</label>
    <input type="text" class="input-field" id="medDosage" value="${medData.dosage}" placeholder="1 таблетка" />
    <label class="field-label">Особые указания</label>
    <textarea class="input-field textarea" id="medConditions" placeholder="Важные моменты...">${medData.conditions}</textarea>
    <label class="field-label">Длительность (дней)</label>
    <input type="number" class="input-field" id="medDuration" value="${medData.durationDays}" min="1" max="365" />
    <label class="field-label">Приём в слоты</label>
    <div style="display:flex;flex-direction:column;">${slotsHtml}</div>
  `, [
    { id: 'saveMed', text: 'Сохранить', cls: 'btn-primary' },
    ...(isNew ? [] : [{ id: 'deleteMed', text: '🗑 Удалить', cls: 'btn-danger' }]),
    { id: 'cancelMed', text: 'Отмена', cls: 'btn-ghost' }
  ]);

  document.getElementById('saveMed').addEventListener('click', async () => {
    const name = document.getElementById('medName').value.trim();
    if (!name) { showToast('Название не может быть пустым'); return; }
    const dosage = document.getElementById('medDosage').value.trim();
    const conditions = document.getElementById('medConditions').value.trim();
    const duration = parseInt(document.getElementById('medDuration').value) || 30;
    const selectedSlots = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    const updatedMed = { ...medData, name, dosage, conditions, durationDays: duration, schedule: selectedSlots, startDate: medData.startDate || new Date().toISOString(), active: true };
    const allMeds = await getMeds();
    if (isNew) {
      allMeds.push(updatedMed);
    } else {
      const idx = allMeds.findIndex(m => m.id === medData.id);
      if (idx !== -1) allMeds[idx] = updatedMed;
    }
    await saveMeds(allMeds);
    close();
    await renderApp();
    showToast(isNew ? `✅ ${name} добавлен` : `💾 ${name} обновлён`);
  });

  if (!isNew) {
    document.getElementById('deleteMed').addEventListener('click', async () => {
      if (confirm(`Удалить «${medData.name}» навсегда?`)) {
        const allMeds = await getMeds();
        const filtered = allMeds.filter(m => m.id !== medData.id);
        await saveMeds(filtered);
        close();
        await renderApp();
        showToast(`🗑 ${medData.name} удалён`);
      }
    });
  }

  document.getElementById('cancelMed').addEventListener('click', close);
}

async function showMedManager() {
  const meds = await getMeds();
  const listHtml = meds.map(m => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--card-border)">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600">💊 ${m.name}</div>
        <div style="font-size:12px;color:var(--text-muted)">${m.dosage} • ${m.schedule.join(', ') || 'нет слотов'} • ${m.active ? 'активен' : 'завершён'}</div>
      </div>
      <button class="btn-ghost" style="padding:4px 10px;font-size:12px;margin-left:8px" data-edit="${m.id}">✏️</button>
    </div>
  `).join('');
  const { close } = openModal('💊 Редактор препаратов', `
    ${listHtml}
    <button class="btn-primary" id="addNewMed" style="margin-top:12px">➕ Добавить препарат</button>
  `, [{ id: 'closeManager', text: 'Закрыть', cls: 'btn-ghost' }]);
  document.getElementById('closeManager').addEventListener('click', close);
  document.getElementById('addNewMed').addEventListener('click', async () => {
    close();
    openMedEditor();
  });
  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const medId = parseInt(btn.dataset.edit);
      const med = (await getMeds()).find(m => m.id === medId);
      if (med) { close(); openMedEditor(med); }
    });
  });
}

async function resetDay() {
  if (confirm('Сбросить текущий день? Отметки сохранятся в истории.')) {
    clearTodayWakeUp();
    setMealFlags({});
    await renderApp();
    showToast('🔄 День сброшен');
  }
}

async function showHistoryCalendar() {
  const today = new Date();
  let displayMonth = today.getMonth();
  let displayYear = today.getFullYear();
  const { overlay, close } = openModal('📅 История приёма', `
    <div class="month-nav">
      <button class="month-nav-btn" id="histPrevMonth">◀</button>
      <span class="month-name" id="histMonthLabel"></span>
      <button class="month-nav-btn" id="histNextMonth">▶</button>
    </div>
    <div class="calendar-grid" id="histCalendarGrid"></div>
  `, [{ id: 'closeHistoryModal', text: 'Закрыть', cls: 'btn-ghost' }]);
  document.getElementById('closeHistoryModal').addEventListener('click', close);
  const monthLabel = document.getElementById('histMonthLabel');
  const grid = document.getElementById('histCalendarGrid');
  const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

  async function renderGrid() {
    monthLabel.textContent = `${months[displayMonth]} ${displayYear}`;
    const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
    const firstDay = new Date(displayYear, displayMonth, 1).getDay();
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    const dayHeaders = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    let html = dayHeaders.map(d => `<div class="day-header">${d}</div>`).join('');
    for (let i = 0; i < startOffset; i++) html += `<div class="day-cell empty"></div>`;
    const activeMeds = await getMeds();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(displayYear, displayMonth, d);
      const dateStr = getLocalDateString(date);
      const history = await getHistoryByDate(dateStr);
      const totalSlots = activeMeds.reduce((sum, med) => sum + med.schedule.length, 0);
      const takenSlots = history.filter(h => h.taken).length;
      let cls = '';
      if (totalSlots > 0) {
        if (takenSlots === totalSlots) cls = 'shift-off';
        else if (takenSlots > 0) cls = 'shift-day';
        else cls = 'shift-night';
      }
      if (date.toDateString() === today.toDateString()) cls += ' today';
      html += `<div class="day-cell ${cls}" data-date="${dateStr}"><span class="day-num">${d}</span><span class="day-label">${totalSlots ? takenSlots + '/' + totalSlots : ''}</span></div>`;
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.day-cell:not(.empty)').forEach(cell => {
      cell.addEventListener('click', async () => {
        const dateStr = cell.dataset.date;
        const history = await getHistoryByDate(dateStr);
        const meds = await getMeds();
        const miniContent = `<div class="modal-title" style="font-size:16px">📋 ${dateStr}</div>` +
          (history.length === 0 ? '<div style="color:var(--text-muted);text-align:center;padding:12px">Нет записей</div>' :
            history.map(h => {
              const med = meds.find(m => m.id === h.medicationId);
              return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--card-border)"><span>💊 ${med?.name || '—'}</span><span style="font-size:12px;color:var(--text-muted)">${h.slot}</span><span>${h.taken ? '✅' : '❌'}</span></div>`;
            }).join('')
          );
        openModal(`День ${dateStr}`, miniContent, [{ id: 'closeDayDetail', text: 'Закрыть', cls: 'btn-ghost' }]);
        document.getElementById('closeDayDetail').addEventListener('click', function() { this.closest('.modal-overlay').remove(); });
        showToast(`📅 Просмотр дня: ${dateStr}`);
      });
    });
  }
  await renderGrid();
  document.getElementById('histPrevMonth').addEventListener('click', async () => {
    displayMonth--;
    if (displayMonth < 0) { displayMonth = 11; displayYear--; }
    await renderGrid();
  });
  document.getElementById('histNextMonth').addEventListener('click', async () => {
    displayMonth++;
    if (displayMonth > 11) { displayMonth = 0; displayYear++; }
    await renderGrid();
  });
}

// ====== ПАНЕЛЬ НАСТРОЕК ======
function setupSettingsPanel() {
  const select = document.getElementById('settingsSelect');
  if (!select) return;
  select.innerHTML = `
    <option value="">⚙️ Настройки</option>
    <option value="name">👤 Изменить имя</option>
    <option value="intervals">⏱ Интервалы приёма</option>
    <option value="meds">💊 Редактор препаратов</option>
    <option value="history">📅 Календарь истории</option>
    <option value="reset">🔄 Сбросить текущий день</option>
  `;
  select.classList.remove('hidden');
  select.addEventListener('change', async (e) => {
    const action = e.target.value;
    select.value = '';
    switch (action) {
      case 'name': await showNameModal(); break;
      case 'intervals': await showIntervalsModal(); break;
      case 'meds': await showMedManager(); break;
      case 'history': await showHistoryCalendar(); break;
      case 'reset': await resetDay(); break;
    }
  });
}

// ====== ИНИЦИАЛИЗАЦИЯ ======
async function initApp() {
  try { await initializeDB(); } catch(e) { console.error('DB init failed', e); }
  loadTheme();
  updateGreeting();
  setupInstall();
  setupSettingsPanel();
  setupTimer();

  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) themeBtn.addEventListener('click', openThemeModal);

  const wakeUp = getTodayWakeUp();
  if (wakeUp && wakeUp.toDateString() !== new Date().toDateString()) {
    clearTodayWakeUp();
    setMealFlags({});
  }
  await renderApp();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/priem/sw.js')
      .then(reg => console.log('SW registered'))
      .catch(err => console.log('SW failed', err));
  }
}

function setupTimer() {
  setInterval(async () => {
    const wakeUp = getTodayWakeUp();
    if (wakeUp && wakeUp.toDateString() === new Date().toDateString()) await renderApp();
    updateGreeting();
  }, 60000);
}

let deferredPrompt;
function setupInstall() {
  const installBtn = document.getElementById('installBtn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.remove('hidden');
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') installBtn.classList.add('hidden');
    deferredPrompt = null;
  });
  const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  const isStandalone = navigator.standalone;
  if (isIOS && !isStandalone) {
    document.getElementById('iosBanner').classList.add('show');
    document.getElementById('closeIosBanner').addEventListener('click', () => {
      document.getElementById('iosBanner').classList.remove('show');
    });
  }
}

document.addEventListener('DOMContentLoaded', initApp);