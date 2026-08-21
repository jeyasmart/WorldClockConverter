const referenceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const savedKey = 'northstar-saved-clocks';
const preferencesKey = 'northstar-preferences';
const defaultZones = ['America/New_York', 'Europe/London', 'Asia/Tokyo'];
const zoneLabels = {
  'America/Los_Angeles': 'Los Angeles', 'America/Chicago': 'Chicago', 'America/New_York': 'New York',
  'America/Sao_Paulo': 'Sao Paulo', 'America/Toronto': 'Toronto', 'Europe/London': 'London',
  'Europe/Paris': 'Paris', 'Europe/Berlin': 'Berlin', 'Africa/Cairo': 'Cairo', 'Asia/Dubai': 'Dubai',
  'Asia/Kolkata': 'Mumbai / Delhi', 'Asia/Singapore': 'Singapore', 'Asia/Shanghai': 'Shanghai',
  'Asia/Tokyo': 'Tokyo', 'Australia/Sydney': 'Sydney', 'Pacific/Auckland': 'Auckland', 'UTC': 'UTC'
};
const allZones = [...new Set([referenceZone, ...Object.keys(zoneLabels)])];
let savedZones = JSON.parse(localStorage.getItem(savedKey) || 'null') || defaultZones;
savedZones = savedZones.map((item) => typeof item === 'string' ? { zone: item, label: '' } : item);
let preferences = JSON.parse(localStorage.getItem(preferencesKey) || 'null') || { format: '12', theme: 'light' };
let editingIndex = null;
let deferredInstall;
let clockPickerMode = 'hour';
let calendarView = new Date();

const $ = (id) => document.getElementById(id);
const cityName = (zone) => zoneLabels[zone] || zone.split('/').pop().replace(/_/g, ' ');
const displayName = (clock) => clock.label || cityName(clock.zone);
const hour12 = () => preferences.format === '12';
const format = (date, zone, options) => new Intl.DateTimeFormat(undefined, { timeZone: zone, ...options }).format(date);
const parts = (date, zone) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).formatToParts(date).filter(({type}) => type !== 'literal').map(({type,value}) => [type,value]));
const offsetMinutes = (date, zone) => {
  const values = parts(date, zone);
  const utc = Date.UTC(values.year, values.month - 1, values.day, values.hour === '24' ? 0 : values.hour, values.minute);
  const minuteTime = Math.floor(date.getTime() / 60000) * 60000;
  return Math.round((utc - minuteTime) / 60000);
};
const offsetText = (date, zone) => { const minutes = offsetMinutes(date, zone); if (!minutes) return 'UTC'; const sign = minutes > 0 ? '+' : '-'; return `UTC${sign}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`; };
const localInputDate = (date) => { const p = parts(date, referenceZone); return `${p.year}-${p.month}-${p.day}`; };
const localInputTime = (date) => { const p = parts(date, referenceZone); return `${p.hour === '24' ? '00' : p.hour}:${p.minute}`; };

function referenceNow() {
  const now = new Date();
  $('reference-city').textContent = cityName(referenceZone);
  $('reference-zone-name').textContent = `${referenceZone}  ·  ${offsetText(now, referenceZone)}`;
  if (!$('date-input').value) { $('date-input').value = localInputDate(now); $('time-input').value = localInputTime(now); }
  updateLocalEditButtons();
  renderClocks(displayReferenceDate(now));
  convert();
}

function updateLocalEditButtons() {
  const value = inputDateAsDate();
  $('time-display').textContent = format(value, referenceZone, { hour:'2-digit', minute:'2-digit', hour12:hour12() });
  $('date-display').textContent = format(value, referenceZone, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
}
function openLocalDialog() { clockPickerMode = 'hour'; $('dialog-date-input').value = $('date-input').value; $('dialog-time-input').value = $('time-input').value; calendarView = new Date(`${$('date-input').value}T12:00:00`); $('local-dialog-zone').textContent = `Based on ${cityName(referenceZone)} · ${referenceZone}`; $('local-dialog').showModal(); }
function applyLocalDialog() { $('date-input').value = $('dialog-date-input').value; $('time-input').value = $('dialog-time-input').value; updateLocalEditButtons(); convert(); renderClocks(inputDateAsDate()); }
function formatTimeValue(value) { const [hour, minute] = (value || '12:00').split(':').map(Number); return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`; }
function updatePeriodButtons() { const hour = Number(($('dialog-time-input').value || '12:00').split(':')[0]); document.querySelectorAll('[data-period]').forEach((button) => button.classList.toggle('active', button.dataset.period === (hour >= 12 ? 'PM' : 'AM'))); }
function setPeriod(period) { const [rawHour, minute] = ($('dialog-time-input').value || '12:00').split(':').map(Number); let hour = rawHour % 12; if (period === 'PM') hour += 12; $('dialog-time-input').value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`; renderClockPicker(); updatePeriodButtons(); }
function updateDialogTimeDisplay() { $('dialog-time-display').value = formatTimeValue($('dialog-time-input').value); }
function parseTypedTime(value) { const match = value.trim().match(/^(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?$/i); if (!match) return null; let hour = Number(match[1]); const minute = Number(match[2] || 0); const period = match[3]?.toUpperCase(); if (minute > 59) return null; if (period) { if (hour < 1 || hour > 12) return null; hour = hour % 12 + (period === 'PM' ? 12 : 0); } else if (hour > 23) return null; return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`; }
function parseTypedDate(value) { const match = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if (!match) return null; const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])); return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}` : null; }
function renderCalendar() { const year = calendarView.getFullYear(); const month = calendarView.getMonth(); $('calendar-month').textContent = new Intl.DateTimeFormat(undefined, { month:'long', year:'numeric' }).format(calendarView); const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate(); const selected = $('dialog-date-input').value; $('calendar-days').innerHTML = `${Array.from({ length:firstDay }, () => '<span></span>').join('')}${Array.from({ length:daysInMonth }, (_, index) => { const day = index + 1; const value = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return `<button type="button" class="calendar-day ${value === selected ? 'selected' : ''}" data-date="${value}">${day}</button>`; }).join('')}`; document.querySelectorAll('.calendar-day').forEach((button) => button.addEventListener('click', () => { $('dialog-date-input').value = button.dataset.date; $('date-input').value = button.dataset.date; calendarView = new Date(year, month, Number(button.textContent)); renderCalendar(); clockPickerMode = 'hour'; renderClockPicker(); })); }
function renderClockPicker() { const [hour, minute] = ($('dialog-time-input').value || '12:00').split(':').map(Number); const isDateMode = clockPickerMode === 'date'; const isMinuteMode = clockPickerMode === 'minute'; updateDialogTimeDisplay(); $('clock-face').hidden = isDateMode; $('clock-picker-value').hidden = isDateMode; $('period-toggle').hidden = isDateMode; $('calendar-panel').hidden = !isDateMode; if (isDateMode) { $('clock-picker-step').textContent = 'Select date'; renderCalendar(); return; } const values = isMinuteMode ? Array.from({ length: 12 }, (_, index) => index * 5) : Array.from({ length: 12 }, (_, index) => index + 1); const selected = isMinuteMode ? Math.round(minute / 5) * 5 % 60 : hour % 12 || 12; const selectedIndex = isMinuteMode ? selected / 5 : selected % 12; $('clock-face').classList.toggle('minute-mode', isMinuteMode); $('clock-face').style.setProperty('--clock-hand-angle', `${selectedIndex * 30}deg`); $('clock-picker-step').textContent = isMinuteMode ? 'Select minutes' : 'Select hour'; $('clock-face').innerHTML = values.map((value, index) => { const angle = (isMinuteMode ? index : index + 1) * 30 - 90; const x = 50 + Math.cos(angle * Math.PI / 180) * 40; const y = 50 + Math.sin(angle * Math.PI / 180) * 40; return `<button type="button" class="clock-number ${value === selected ? 'selected' : ''}" data-value="${value}" style="left:${x}%;top:${y}%">${isMinuteMode ? String(value).padStart(2, '0') : value}</button>`; }).join(''); $('clock-picker-value').textContent = formatTimeValue($('dialog-time-input').value); document.querySelectorAll('.clock-number').forEach((button) => button.addEventListener('click', () => { const value = Number(button.dataset.value); if (clockPickerMode === 'hour') { const nextHour = hour >= 12 ? value % 12 + 12 : value % 12; $('dialog-time-input').value = `${String(nextHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`; clockPickerMode = 'minute'; } else { $('dialog-time-input').value = `${String(hour).padStart(2, '0')}:${String(value).padStart(2, '0')}`; clockPickerMode = 'hour'; } renderClockPicker(); })); }

function displayReferenceDate(now = new Date()) {
  const isCurrentMinute = $('date-input').value === localInputDate(now) && $('time-input').value === localInputTime(now);
  return isCurrentMinute ? now : inputDateAsDate();
}

function populateZones() {
  const options = allZones.map((zone) => `<option value="${zone}">${cityName(zone)}  (${zone})</option>`).join('');
  $('zone-select').innerHTML = options;
  $('city-zone').innerHTML = options;
  $('zone-select').value = referenceZone;
  $('zone-search').value = zoneInputValue(referenceZone);
}

const zoneInputValue = (zone) => `${cityName(zone)} (${zone})`;
function renderAutocomplete(inputId, listId, selectId) { const query = $(inputId).value.trim().toLowerCase(); const matches = allZones.filter((zone) => `${cityName(zone)} ${zone}`.toLowerCase().includes(query)); const list = $(listId); list.innerHTML = matches.map((zone) => `<button type="button" data-zone="${zone}" role="option">${zone === referenceZone ? 'Your location - ' : ''}${cityName(zone)} <small>${zone}</small></button>`).join(''); list.hidden = !matches.length; list.querySelectorAll('button').forEach((button) => button.addEventListener('mousedown', (event) => { event.preventDefault(); $(selectId).value = button.dataset.zone; $(inputId).value = zoneInputValue(button.dataset.zone); list.hidden = true; if (selectId === 'zone-select') convert(); })); }
function syncZoneInput(inputId, listId, selectId) { renderAutocomplete(inputId, listId, selectId); const query = $(inputId).value.trim().toLowerCase(); const match = allZones.find((zone) => zoneInputValue(zone).toLowerCase() === query) || allZones.find((zone) => `${cityName(zone)} ${zone}`.toLowerCase() === query); if (match) { $(selectId).value = match; if (selectId === 'zone-select') convert(); } }

function inputDateAsDate() {
  const date = $('date-input').value;
  const time = $('time-input').value || '00:00';
  if (!date) return new Date();
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const correction = offsetMinutes(guess, referenceZone);
  return new Date(guess.getTime() - correction * 60000);
}

function convert() {
  const date = inputDateAsDate();
  const zone = $('zone-select').value;
  $('result-city').textContent = cityName(zone);
  $('result-zone').textContent = `${zone}  ·  ${offsetText(date, zone)}`;
  $('result-time').textContent = format(date, zone, { hour:'2-digit', minute:'2-digit', hour12:hour12() });
  $('result-date').textContent = format(date, zone, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
}

function renderClocks(now = new Date()) {
  $('empty-state').classList.toggle('visible', savedZones.length === 0);
  $('clock-grid').innerHTML = savedZones.map((clock, index) => `<article class="clock-card" data-index="${index}" draggable="true"><div class="card-top"><span class="card-label">${index === 0 ? 'SAVED LOCATION' : 'WORLD CLOCK'}</span><div class="card-actions"><button class="move-menu-button" data-index="${index}" aria-label="Move ${displayName(clock)}" aria-expanded="false">↕</button><button class="edit-button" data-index="${index}" aria-label="Edit ${displayName(clock)}">✎</button><button class="remove-button" data-index="${index}" aria-label="Remove ${displayName(clock)}">×</button><div class="move-menu" hidden><button data-index="${index}" data-direction="up">Move up</button><button data-index="${index}" data-direction="down">Move down</button></div></div></div><div class="card-name">${displayName(clock)}</div><div class="card-time">${format(now, clock.zone, { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:hour12() })}</div><div class="card-bottom"><span class="card-date">${format(now, clock.zone, { weekday:'short', month:'short', day:'numeric' })}</span><span class="offset">${offsetText(now, clock.zone)}</span></div></article>`).join('');
  document.querySelectorAll('.remove-button').forEach((button) => button.addEventListener('click', () => removeZone(Number(button.dataset.index))));
  document.querySelectorAll('.edit-button').forEach((button) => button.addEventListener('click', () => openCityDialog(Number(button.dataset.index))));
  document.querySelectorAll('.move-menu-button').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); const menu = button.parentElement.querySelector('.move-menu'); const isOpen = !menu.hidden; document.querySelectorAll('.move-menu').forEach((item) => { item.hidden = true; }); menu.hidden = isOpen; button.setAttribute('aria-expanded', String(!isOpen)); }));
  document.querySelectorAll('.move-menu button').forEach((button) => button.addEventListener('click', () => moveZone(Number(button.dataset.index), button.dataset.direction)));
  document.querySelectorAll('.move-button').forEach((button) => button.addEventListener('click', () => moveZone(Number(button.dataset.index), button.dataset.direction)));
  document.querySelectorAll('.clock-card').forEach((card) => {
    let startX = 0;
    let startY = 0;
    card.addEventListener('touchstart', (event) => {
      const touch = event.changedTouches[0];
      startX = touch.clientX;
      startY = touch.clientY;
    }, { passive: true });
    card.addEventListener('touchend', (event) => {
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (Math.abs(deltaY) < 40 || Math.abs(deltaY) < Math.abs(deltaX)) return;
      moveZone(Number(card.dataset.index), deltaY < 0 ? 'up' : 'down');
    }, { passive: true });
    card.addEventListener('dragstart', (event) => { event.dataTransfer.setData('text/plain', card.dataset.index); card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', (event) => { event.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (event) => { event.preventDefault(); card.classList.remove('drag-over'); const fromIndex = Number(event.dataTransfer.getData('text/plain')); const toIndex = Number(card.dataset.index); if (fromIndex === toIndex) return; const [moved] = savedZones.splice(fromIndex, 1); savedZones.splice(toIndex, 0, moved); localStorage.setItem(savedKey, JSON.stringify(savedZones)); renderClocks(displayReferenceDate()); });
  });
}

function addZone() {
  openCityDialog();
}
function openCityDialog(index = null) { editingIndex = index; const clock = index === null ? { zone: $('zone-select').value, label: '' } : savedZones[index]; $('dialog-title').textContent = index === null ? 'Add a city' : 'Edit city'; $('city-zone').value = clock.zone; $('city-search').value = zoneInputValue(clock.zone); $('city-label').value = clock.label; $('city-dialog').showModal(); }
function saveCity() { const clock = { zone: $('city-zone').value, label: $('city-label').value.trim() }; const duplicate = savedZones.some((item, index) => item.zone === clock.zone && index !== editingIndex); if (duplicate) { showToast(`${cityName(clock.zone)} is already saved`); return false; } if (editingIndex === null) savedZones.push(clock); else savedZones[editingIndex] = clock; localStorage.setItem(savedKey, JSON.stringify(savedZones)); renderClocks(); showToast(`${displayName(clock)} saved`); return true; }
function removeZone(index) { const name = displayName(savedZones[index]); savedZones.splice(index, 1); localStorage.setItem(savedKey, JSON.stringify(savedZones)); renderClocks(); showToast(`${name} removed`); }
function moveZone(index, direction) { const next = direction === 'up' ? index - 1 : index + 1; if (next < 0 || next >= savedZones.length) return; [savedZones[index], savedZones[next]] = [savedZones[next], savedZones[index]]; localStorage.setItem(savedKey, JSON.stringify(savedZones)); renderClocks(); }
function setPreference(key, value) { preferences[key] = value; localStorage.setItem(preferencesKey, JSON.stringify(preferences)); }
function applyPreferences() { document.body.classList.toggle('dark', preferences.theme === 'dark'); $('theme-icon').textContent = preferences.theme === 'dark' ? '☀' : '☾'; $('theme-button').setAttribute('aria-label', preferences.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'); document.querySelectorAll('[data-format]').forEach((button) => button.classList.toggle('active', button.dataset.format === preferences.format)); }
function showToast(message) { const toast = $('toast'); toast.textContent = message; toast.classList.add('show'); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2200); }

$('date-input').addEventListener('input', () => { updateLocalEditButtons(); convert(); renderClocks(inputDateAsDate()); }); $('time-input').addEventListener('input', () => { updateLocalEditButtons(); convert(); renderClocks(inputDateAsDate()); }); $('time-edit-button').addEventListener('click', () => { openLocalDialog(); renderClockPicker(); updatePeriodButtons(); }); $('date-edit-button').addEventListener('click', () => { openLocalDialog(); clockPickerMode = 'date'; renderClockPicker(); }); $('dialog-time-display').addEventListener('click', () => { clockPickerMode = 'hour'; renderClockPicker(); updatePeriodButtons(); }); $('dialog-time-display').addEventListener('input', () => { const parsed = parseTypedTime($('dialog-time-display').value); if (!parsed) return; $('dialog-time-input').value = parsed; renderClockPicker(); updatePeriodButtons(); }); $('dialog-date-input').addEventListener('click', () => { clockPickerMode = 'date'; renderClockPicker(); }); $('dialog-date-input').addEventListener('input', () => { const parsed = parseTypedDate($('dialog-date-input').value); if (!parsed) return; $('dialog-date-input').value = parsed; $('date-input').value = parsed; calendarView = new Date(`${parsed}T12:00:00`); clockPickerMode = 'date'; renderClockPicker(); }); $('dialog-time-input').addEventListener('input', () => { renderClockPicker(); updatePeriodButtons(); }); $('calendar-prev').addEventListener('click', () => { calendarView.setMonth(calendarView.getMonth() - 1); renderCalendar(); }); $('calendar-next').addEventListener('click', () => { calendarView.setMonth(calendarView.getMonth() + 1); renderCalendar(); }); document.querySelectorAll('[data-period]').forEach((button) => button.addEventListener('click', () => setPeriod(button.dataset.period))); $('local-form').addEventListener('submit', (event) => { if (event.submitter?.value !== 'save') return; event.preventDefault(); applyLocalDialog(); $('local-dialog').close(); }); $('zone-search').addEventListener('input', () => syncZoneInput('zone-search', 'zone-options', 'zone-select')); $('zone-search').addEventListener('focus', () => renderAutocomplete('zone-search', 'zone-options', 'zone-select')); $('city-search').addEventListener('input', () => syncZoneInput('city-search', 'city-options', 'city-zone')); $('city-search').addEventListener('focus', () => renderAutocomplete('city-search', 'city-options', 'city-zone')); document.addEventListener('click', (event) => { if (!event.target.closest('.field')) document.querySelectorAll('.autocomplete-list').forEach((list) => { list.hidden = true; }); }); $('add-button').addEventListener('click', addZone); $('empty-add').addEventListener('click', addZone); $('now-button').addEventListener('click', () => { $('date-input').value = ''; $('time-input').value = ''; referenceNow(); });
$('theme-button').addEventListener('click', () => { setPreference('theme', preferences.theme === 'dark' ? 'light' : 'dark'); applyPreferences(); });
document.querySelectorAll('[data-format]').forEach((button) => button.addEventListener('click', () => { setPreference('format', button.dataset.format); applyPreferences(); referenceNow(); }));
$('city-form').addEventListener('submit', (event) => { if (event.submitter?.value !== 'save') return; event.preventDefault(); if (saveCity()) $('city-dialog').close(); });
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstall = event; $('install-button').hidden = false; });
$('install-button').addEventListener('click', async () => { if (!deferredInstall) return; deferredInstall.prompt(); deferredInstall = null; $('install-button').hidden = true; });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
populateZones(); applyPreferences(); referenceNow(); window.setInterval(referenceNow, 1000);
