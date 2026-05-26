// ====== КОНФИГУРАЦИЯ ПРЕПАРАТОВ (версия 1.5) ======
const defaultMeds = [
  {
    id: 1,
    name: 'Уро-Ваксом',
    dosage: '1 капсула',
    conditions: 'Утром натощак, в одно и то же время ежедневно.',
    schedule: ['утро натощак'],
    startDate: new Date().toISOString(),
    durationDays: 80,
    active: true,
    timeRecommended: '08:00'
  },
  {
    id: 2,
    name: 'Вобэнзим',
    dosage: '3 таблетки',
    conditions: 'За 30 минут до еды или через 2 часа после еды. Принимать утром, днём и вечером.',
    schedule: ['утро', 'день', 'вечер'],
    startDate: new Date().toISOString(),
    durationDays: 14,
    active: true,
    timeRecommended: '08:00'
  },
  {
    id: 3,
    name: 'Циурол',
    dosage: '1 таблетка',
    conditions: 'После еды, ежедневно в стабильное время.',
    schedule: ['после еды'],
    startDate: new Date().toISOString(),
    durationDays: 80,
    active: true,
    timeRecommended: '09:00'
  },
  {
    id: 4,
    name: 'Линекс Форте',
    dosage: '1 капсула',
    conditions: 'После еды, можно в любое время дня, не запивать горячим.',
    schedule: ['после еды'],
    startDate: new Date().toISOString(),
    durationDays: 7,
    active: true,
    timeRecommended: '10:00'
  }
];

const defaultSettings = {
  wakeUpTime: '08:00'
};

// Доступные слоты для редактора
const availableSlots = [
  { id: 'утро натощак', label: 'Утро натощак' },
  { id: 'утро', label: 'Утро' },
  { id: 'день', label: 'День' },
  { id: 'вечер', label: 'Вечер' },
  { id: 'после еды', label: 'После еды' }
];

// ====== ЛОКАЛЬНАЯ ДАТА (день начинается в 06:00) ======
function getLocalDateString(date = new Date()) {
  const d = new Date(date);
  d.setHours(d.getHours() - 6); // смещаем на 6 часов назад, чтобы ночь относилась к предыдущему дню
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isSameDay(d1, d2) {
  return getLocalDateString(d1) === getLocalDateString(d2);
}

// ====== INDEXEDDB ======
const DB_NAME = 'MedTracker';
const DB_VERSION = 3;
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

async function getLastTakenTime(medId, slot) {
  // Ищем последнюю запись в истории для данного препарата и слота
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('history', 'readonly');
    const store = tx.objectStore('history');
    const index = store.index('medicationId');
    const range = IDBKeyRange.only(medId);
    const req = index.openCursor(range, 'prev'); // в обратном порядке
    let lastTime = null;
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const h = cursor.value;
        if (h.slot === slot && h.taken) {
          lastTime = h.timestamp || h.date;
          resolve(lastTime);
          return;
        }
        cursor.continue();
      } else {
        resolve(lastTime);
      }
    };
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

// ====== ПРИВЕТСТВИЕ ======
function getGreeting(name) {
  const h = new Date().getHours();
  if (h >= 6 && h < 10) return `Доброе утро, ${name}`;
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

// ====== УВЕДОМЛЕНИЯ ======
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

// ====== ФОРМАТ ВРЕМЕНИ ======
function formatTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// ====== ГЛАВНЫЙ РЕНДЕРИНГ ======
async function renderApp() {
  const main = document.getElementById('mainContent');
  if (!main) return;
  const wakeUp = getTodayWakeUp();
  const userName = getUserName();
  const greeting = getGreeting(userName);

  // Если день не начат или сегодня по версии 06:00 другой день
  if (!wakeUp || !isSameDay(wakeUp, new Date())) {
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
  const yesterdayStr = getLocalDateString(new Date(now.getTime() - 24*3600000));
  const historyYesterday = await getHistoryByDate(yesterdayStr);

  let html = `<div style="font-size:18px;font-weight:700;margin-bottom:8px">${greeting}</div>`;

  // Блок времени пробуждения
  html += `<div class="card">
    <div class="wakeup-info">
      <span>⏰ Проснулась в <span class="wakeup-time">${formatTime(wakeUp)}</span></span>
      <button class="wakeup-edit editable-time" data-edit-time="wakeup">✏️ Изменить</button>
    </div>
  </div>`;

  // Группируем препараты по слотам
  const slotOrder = ['утро натощак', 'утро', 'день', 'вечер', 'после еды'];
  const slotLabels = {
    'утро натощак': '🌅 Утро · Натощак',
    'утро': '☀️ Утро',
    'день': '🌤 День',
    'вечер': '🌇 Вечер',
    'после еды': '🍽 После еды'
  };

  for (const slot of slotOrder) {
    const medsForSlot = activeMeds.filter(m => m.schedule.includes(slot));
    if (medsForSlot.length === 0) continue;

    html += `<div class="card">
      <div class="card-title">${slotLabels[slot]}</div>`;

    for (const med of medsForSlot) {
      const takenEntry = historyToday.find(h => h.medicationId === med.id && h.slot === slot);
      const taken = !!takenEntry;
      const takenTime = takenEntry ? formatTime(new Date(takenEntry.timestamp)) : null;

// Определяем рекомендованное время на основе вчерашнего приёма
let recommendedTime = med.timeRecommended || '';
if (historyYesterday.length > 0) {
  const yesterdayEntry = historyYesterday.find(h => h.medicationId === med.id && h.slot === slot);
  if (yesterdayEntry && yesterdayEntry.taken) {
    recommendedTime = formatTime(new Date(yesterdayEntry.timestamp));
  }
}

html += `<div class="med-item">
  <div class="med-header">
    <span class="med-name ${taken ? 'completed' : ''}" data-id="${med.id}" style="cursor:pointer">
      💊 ${med.name} — ${med.dosage}
    </span>
    <button class="med-check ${taken ? 'taken' : ''}" data-med="${med.id}" data-slot="${slot}">
      ${taken ? '✓' : ''}
    </button>
  </div>
  <div class="med-details">
    ${taken ? `<span>✅ Принято в <span class="med-time" data-edit-time="history-${med.id}-${slot}">${takenTime}</span></span>` : 
      `<span>⏳ Рекомендуется: <span class="med-time" data-edit-time="recommend-${med.id}-${slot}">${recommendedTime}</span></span>`}
    <span class="med-remaining">Осталось ${med.durationDays} дней</span>
  </div>`;

// Вот это добавляется ПОСЛЕ закрытия med-details, а не внутри него
if (med.conditions) {
  html += `<div style="font-size:12px; color: var(--text-muted); margin-top:4px; padding:6px; background: var(--accent-soft); border-radius:8px;">📌 ${med.conditions}</div>`;
}

html += `</div>`;

  // Информация о препаратах
  html += `<div class="card">
    <div class="card-title">📋 Информация</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${activeMeds.map(m => `
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span>💊 ${m.name} (${m.dosage})</span>
          <button class="btn-ghost" style="padding:6px 12px;font-size:13px" data-end-course="${m.id}">Завершить</button>
        </div>
      `).join('')}
    </div>
  </div>`;

  main.innerHTML = html;

  // Обработчики
  document.querySelectorAll('.med-check').forEach(b => b.addEventListener('click', onMedCheck));
  document.querySelectorAll('.med-name').forEach(n => n.addEventListener('click', onMedDetail));
  document.querySelectorAll('[data-end-course]').forEach(b => b.addEventListener('click', onEndCourse));
  document.querySelectorAll('.editable-time').forEach(el => {
    el.addEventListener('click', onTimeClick);
  });
  document.querySelectorAll('.med-time').forEach(el => {
    el.addEventListener('click', onMedTimeClick);
  });
}

// ====== ОБРАБОТЧИКИ ======
async function onWakeUp() {
  const now = new Date();
  setTodayWakeUp(now);
  showToast('☀️ Доброе утро! График составлен.');
  await renderApp();
}

async function onMedCheck(e) {
  const btn = e.currentTarget;
  const medId = parseInt(btn.dataset.med);
  const slot = btn.dataset.slot;
  const wasTaken = btn.classList.contains('taken');
  const todayStr = getLocalDateString();

  if (wasTaken) {
    // Отмена отметки
    await removeHistory(medId, todayStr, slot);
    btn.classList.remove('taken');
    btn.textContent = '';
    const nameEl = btn.parentElement.parentElement.querySelector('.med-name');
    if (nameEl) nameEl.classList.remove('completed');
    const meds = await getMeds();
    const med = meds.find(m => m.id === medId);
    showToast(`↩️ Отмена: ${med?.name || 'препарат'}`);
    await renderApp();
  } else {
    const now = new Date();
    await addHistory({
      medicationId: medId,
      date: todayStr,
      slot: slot,
      taken: true,
      timestamp: now.toISOString()
    });
    btn.classList.add('taken');
    btn.textContent = '✓';
    const nameEl = btn.parentElement.parentElement.querySelector('.med-name');
    if (nameEl) nameEl.classList.add('completed');
    const meds = await getMeds();
    const med = meds.find(m => m.id === medId);
    showToast(`✅ Принято: ${med?.name || 'препарат'} в ${formatTime(now)}`);
    await renderApp();
  }
}

async function onMedDetail(e) {
  const medId = parseInt(e.currentTarget.dataset.id);
  const meds = await getMeds();
  const med = meds.find(m => m.id === medId);
  if (med) openMedInfoModal(med);
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

// ====== РЕДАКТИРОВАНИЕ ВРЕМЕНИ ======
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
  const todayStr = getLocalDateString();

  if (editKey === 'wakeup') {
    const wakeUp = getTodayWakeUp();
    if (!wakeUp) return;
    const newWakeUp = new Date(wakeUp);
    newWakeUp.setHours(h, m, 0, 0);
    if (newWakeUp > new Date()) {
      showToast('⚠️ Время пробуждения не может быть в будущем');
      return;
    }
    setTodayWakeUp(newWakeUp);
    showToast(`⏰ Время пробуждения изменено на ${newTime}`);
    await renderApp();
    return;
  }

  // Редактирование времени приёма в истории
  if (editKey.startsWith('history-')) {
    const parts = editKey.replace('history-', '').split('-');
    const medId = parseInt(parts[0]);
    const slot = parts.slice(1).join('-');
    const history = await getHistoryByDate(todayStr);
    const entry = history.find(h => h.medicationId === medId && h.slot === slot);
    if (entry) {
      const timestamp = new Date(entry.timestamp);
      timestamp.setHours(h, m, 0, 0);
      entry.timestamp = timestamp.toISOString();
      // Для простоты перезапишем через remove + add
      await removeHistory(medId, todayStr, slot);
      await addHistory({
        medicationId: medId,
        date: todayStr,
        slot: slot,
        taken: true,
        timestamp: timestamp.toISOString()
      });
      showToast(`⏰ Время приёма изменено на ${newTime}`);
      await renderApp();
    }
    return;
  }

  // Редактирование рекомендуемого времени
  if (editKey.startsWith('recommend-')) {
    const parts = editKey.replace('recommend-', '').split('-');
    const medId = parseInt(parts[0]);
    const slot = parts.slice(1).join('-');
    const meds = await getMeds();
    const med = meds.find(m => m.id === medId);
    if (med) {
      med.timeRecommended = newTime;
      await saveMeds(meds);
      showToast(`⏰ Рекомендованное время изменено на ${newTime}`);
      await renderApp();
    }
    return;
  }
}

async function onTimeClick(e) {
  const el = e.currentTarget;
  const editKey = el.dataset.editTime;
  const currentTime = el.textContent.trim();
  openTimeModal(editKey, currentTime);
}

async function onMedTimeClick(e) {
  e.stopPropagation();
  const el = e.currentTarget;
  const editKey = el.dataset.editTime;
  const currentTime = el.textContent.trim();
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
    active: true,
    timeRecommended: '08:00'
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
    <label class="field-label">Рекомендованное время</label>
    <input type="text" class="input-field" id="medTimeRecommended" value="${medData.timeRecommended || '08:00'}" placeholder="08:00" />
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
    const timeRecommended = document.getElementById('medTimeRecommended').value.trim() || '08:00';
    const updatedMed = { ...medData, name, dosage, conditions, durationDays: duration, schedule: selectedSlots, timeRecommended, startDate: medData.startDate || new Date().toISOString(), active: true };
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
  if (wakeUp && !isSameDay(wakeUp, new Date())) {
    clearTodayWakeUp();
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
    if (wakeUp && isSameDay(wakeUp, new Date())) await renderApp();
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