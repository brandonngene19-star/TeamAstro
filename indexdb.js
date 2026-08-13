let db;
let editingGroupId = null;
const DB_NAME = 'InternFlowDB';
const DB_VERSION = 7;

const NAME_REGEX = /^[a-zA-Z\s]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidPhone(phone) {
    return /^\d{9}$/.test(String(phone).replace(/[\s\-()]/g, ''));
}

// Returns a 'YYYY-MM-DD' string for the date's LOCAL calendar day.
// date.toISOString().split('T')[0] is a real bug for any timezone ahead of
// UTC (e.g. UTC+1 and beyond): toISOString() first converts to UTC, which
// rolls the date back by a day for dates built at local midnight (00:00:00)
// — exactly what the weekly Monday–Sunday range calculation does. This keeps
// every "today" / week-boundary calculation locked to the browser's actual
// local date, so the attendance page always matches the real current date.
function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function showAlert(message, type = 'info', duration = 4000) {
    let alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'alertContainer';
        document.body.appendChild(alertContainer);
    }
    
    const alertElement = document.createElement('div');
    alertElement.className = `custom-alert custom-alert-${type} animate-slide-in`;
    
    const icons = {
        success: '✓',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    alertElement.innerHTML = `
        <div class="alert-content">
            <span class="alert-icon">${icons[type]}</span>
            <span class="alert-message">${message}</span>
            <button class="alert-close" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="alert-progress"></div>
    `;
    
    alertContainer.appendChild(alertElement);
    
    setTimeout(() => {
        alertElement.classList.add('animate-slide-out');
        setTimeout(() => alertElement.remove(), 500);
    }, duration);
}

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* 
  COMPLEX FUNCTION: Custom Modal with Promises
  Hey interns! Instead of using simple alert boxes, this function dynamically builds 
  a popup box in HTML and wraps it in a JavaScript Promise. This lets us use "await" 
  when calling this modal to wait until the user clicks Save or Cancel before continuing execution!
*/
function showCustomModal({ title, message, fields = [], confirmText = 'Save', cancelText = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';

        const fieldsHTML = fields.map(field => {
            const lockedAttribute = field.disabled ? 'disabled' : '';

            if (field.type === 'select') {
                const optionsHTML = field.options.map(option => {
                    const optionValue = typeof option === 'object' ? option.value : option;
                    const optionLabel = typeof option === 'object' ? option.label : option;
                    return `<option value="${escapeHTML(optionValue)}" ${String(optionValue) === String(field.value) ? 'selected' : ''}>${escapeHTML(optionLabel)}</option>`;
                }).join('');

                return `
                    <label class="custom-modal-field">
                        <span>${escapeHTML(field.label)}</span>
                        <select name="${escapeHTML(field.name)}" ${lockedAttribute}>
                            ${optionsHTML}
                        </select>
                        ${field.helpText ? `<small>${escapeHTML(field.helpText)}</small>` : ''}
                    </label>
                `;
            }

            const maxlengthAttribute = field.maxlength ? `maxlength="${field.maxlength}"` : '';
            const patternAttribute = field.pattern ? `pattern="${escapeHTML(field.pattern)}"` : '';
            const inputmodeAttribute = field.inputmode ? `inputmode="${field.inputmode}"` : '';
            const inputType = field.type || 'text';

            return `
                <label class="custom-modal-field">
                    <span>${escapeHTML(field.label)}</span>
                    <input name="${escapeHTML(field.name)}" type="${escapeHTML(inputType)}" value="${escapeHTML(field.value || '')}" placeholder="${escapeHTML(field.placeholder || '')}" ${maxlengthAttribute} ${patternAttribute} ${inputmodeAttribute} ${lockedAttribute}>
                    ${field.helpText ? `<small>${escapeHTML(field.helpText)}</small>` : ''}
                </label>
            `;
        }).join('');

        overlay.innerHTML = `
            <div class="custom-modal">
                <div class="custom-modal-header">
                    <div class="custom-modal-icon ${danger ? 'danger' : 'info'}">
                        <i class="fas ${danger ? 'fa-trash' : 'fa-pen'}"></i>
                    </div>
                    <div>
                        <h3>${escapeHTML(title)}</h3>
                        ${message ? `<p>${escapeHTML(message)}</p>` : ''}
                    </div>
                </div>
                ${fieldsHTML ? `<form class="custom-modal-form">${fieldsHTML}</form>` : ''}
                <div class="custom-modal-actions">
                    <button type="button" class="custom-modal-cancel">${escapeHTML(cancelText)}</button>
                    <button type="button" class="custom-modal-confirm ${danger ? 'danger' : ''}">${escapeHTML(confirmText)}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const close = (value) => {
            overlay.classList.add('closing');
            setTimeout(() => {
                overlay.remove();
                resolve(value);
            }, 180);
        };

        overlay.querySelector('.custom-modal-cancel').addEventListener('click', () => close(null));
        overlay.querySelector('.custom-modal-confirm').addEventListener('click', () => {
            const values = {};
            fields.forEach(field => {
                const input = overlay.querySelector(`[name="${field.name}"]`);
                values[field.name] = input ? input.value : '';
            });
            close(fields.length > 0 ? values : true);
        });
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) close(null);
        });
    });
}

function showCustomConfirm(message, options = {}) {
    return showCustomModal({
        title: options.title || 'Confirm Action',
        message,
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        danger: options.danger || false
    });
}

/*
  Generic read-only "Details" popup used by the Details button on every table.
  Pass a title, an optional subtitle, and a list of { label, value } rows to
  display. Unlike showCustomModal, this has a single "Close" button since
  there's nothing to submit.
*/
function showDetailsModal({ title, subtitle = '', rows = [], onExport = null, exportText = 'Export' }) {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';

    const rowsHTML = rows.length
        ? rows.map(row => {
            if (row.type === 'section') {
                return `<div class="details-section-title">${escapeHTML(row.label)}</div>`;
            }
            return `
                <div class="details-row">
                    <span>${escapeHTML(row.label)}</span>
                    <span>${row.value === null || row.value === undefined || row.value === '' ? '-' : escapeHTML(row.value)}</span>
                </div>
            `;
        }).join('')
        : `<p class="details-empty">No details available.</p>`;

    // The export button is opt-in via onExport, so this stays a plain "Close"
    // popup everywhere else (supervisor/performance details) unless a caller
    // explicitly hands us something to export.
    const exportButtonHTML = typeof onExport === 'function'
        ? `<button type="button" class="custom-modal-cancel details-export-btn"><i class="fas fa-download"></i> ${escapeHTML(exportText)}</button>`
        : '';

    overlay.innerHTML = `
        <div class="custom-modal details-modal">
            <div class="custom-modal-header">
                <div class="custom-modal-icon info">
                    <i class="fas fa-circle-info"></i>
                </div>
                <div>
                    <h3>${escapeHTML(title)}</h3>
                    ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}
                </div>
            </div>
            <div class="details-modal-body">
                ${rowsHTML}
            </div>
            <div class="custom-modal-actions${typeof onExport === 'function' ? ' has-export' : ''}">
                ${exportButtonHTML}
                <button type="button" class="custom-modal-confirm details-close-btn">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => {
        overlay.classList.add('closing');
        setTimeout(() => overlay.remove(), 180);
    };

    overlay.querySelector('.details-close-btn').addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
    });

    const exportBtn = overlay.querySelector('.details-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => onExport());
    }
}

/* 
  COMPLEX FUNCTION: Database Setup (IndexedDB Initializer)
  Browser databases use asynchronous request listeners (onsuccess, onerror, onupgradeneeded). 
  We wrap the whole process inside a JavaScript Promise so our app knows to wait until 
  the database tables (Object Stores) are completely created before making any CRUD calls.
*/
function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Database failed to open');
            reject(request.error);
        };

        request.onblocked = () => {
            console.warn('Database upgrade blocked by another open tab/connection.');
            showAlert('Please close other tabs of this app, then reload this page.', 'warning', 6000);
            reject(new Error('Database upgrade blocked by another open connection.'));
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('Database opened successfully');

            db.onversionchange = () => {
                db.close();
                console.warn('Database is outdated; another tab needs an upgrade. Please reload this page.');
                showAlert('This page is out of date. Please reload.', 'warning', 6000);
            };

            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;

            if (!db.objectStoreNames.contains('interns')) {
                const internStore = db.createObjectStore('interns', { keyPath: 'id' });
                internStore.createIndex('name', 'name', { unique: false });
                internStore.createIndex('email', 'email', { unique: true });
                internStore.createIndex('department', 'department', { unique: false });
            }

            if (!db.objectStoreNames.contains('supervisors')) {
                const supervisorStore = db.createObjectStore('supervisors', { keyPath: 'id' });
                supervisorStore.createIndex('name', 'name', { unique: false });
                supervisorStore.createIndex('email', 'email', { unique: true });
                supervisorStore.createIndex('department', 'department', { unique: false });
                supervisorStore.createIndex('role', 'role', { unique: false });
            }

            if (!db.objectStoreNames.contains('attendance')) {
                const attendanceStore = db.createObjectStore('attendance', { keyPath: 'id' });
                attendanceStore.createIndex('internId', 'internId', { unique: false });
                attendanceStore.createIndex('date', 'date', { unique: false });
                attendanceStore.createIndex('status', 'status', { unique: false });
            }

            if (!db.objectStoreNames.contains('performance')) {
                const performanceStore = db.createObjectStore('performance', { keyPath: 'id' });
                performanceStore.createIndex('internId', 'internId', { unique: false });
                performanceStore.createIndex('rating', 'rating', { unique: false });
            }

            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }

            if (!db.objectStoreNames.contains('groups')) {
                const groupStore = db.createObjectStore('groups', { keyPath: 'id' });
                groupStore.createIndex('name', 'name', { unique: false });
                groupStore.createIndex('supervisorId', 'supervisorId', { unique: false });
            }

            console.log('Database schema created');
        };
    });
}

function emailExistsInStore(storeName, email) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index('email');
        const request = index.get(email);

        request.onsuccess = () => resolve(Boolean(request.result));
        request.onerror = () => reject(request.error);
    });
}

function dbAdd(storeName, record) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.add(record);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function dbGetAll(storeName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function dbGet(storeName, id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function dbPut(storeName, record) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(record);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function dbDelete(storeName, id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function rejectWithFriendlyMessage(error, duplicateEmailMessage) {
    if (error?.name === 'ConstraintError') {
        throw new Error(duplicateEmailMessage);
    }
    throw error;
}

function addIntern(intern) {
    return dbAdd('interns', intern).catch(error =>
        rejectWithFriendlyMessage(error, 'An intern with this email is already registered.'));
}

function getAllInterns() {
    return dbGetAll('interns');
}

function getInternById(id) {
    return dbGet('interns', id);
}

function updateIntern(intern) {
    return dbPut('interns', intern).catch(error =>
        rejectWithFriendlyMessage(error, 'Another intern is already using that email.'));
}

function deleteIntern(id) {
    return dbDelete('interns', id);
}

function addSupervisor(supervisor) {
    return dbAdd('supervisors', supervisor).catch(error =>
        rejectWithFriendlyMessage(error, 'A supervisor with this email is already registered.'));
}

function getAllSupervisors() {
    return dbGetAll('supervisors');
}

function getSupervisorById(id) {
    return dbGet('supervisors', id);
}

function updateSupervisor(supervisor) {
    return dbPut('supervisors', supervisor).catch(error =>
        rejectWithFriendlyMessage(error, 'Another supervisor is already using that email.'));
}

function deleteSupervisor(id) {
    return dbDelete('supervisors', id);
}

function addGroup(group) {
    return dbAdd('groups', group);
}

function getAllGroups() {
    return dbGetAll('groups');
}

function getGroupById(id) {
    return dbGet('groups', id);
}

function updateGroup(group) {
    return dbPut('groups', group);
}

function deleteGroup(id) {
    return dbDelete('groups', id);
}

/* 
  COMPLEX FUNCTION: IndexedDB Cursor Delete
  Interns take note: Instead of deleting by a single primary key, this opens a "Cursor" 
  to step through the database one item at a time. It finds all entries matching 
  a specific intern ID and deletes them line-by-line.
*/
function deleteRecordsByInternId(storeName, internId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const index = store.index('internId');
        const request = index.openCursor(IDBKeyRange.only(internId));

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

async function deleteInternWithRecords(internId) {
    await Promise.all([
        deleteRecordsByInternId('attendance', internId),
        deleteRecordsByInternId('performance', internId)
    ]);
    await deleteIntern(internId);
}

function addAttendance(record) {
    return dbAdd('attendance', record);
}

function getAllAttendance() {
    return dbGetAll('attendance');
}

function getAttendanceByInternId(internId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('attendance', 'readonly');
        const store = transaction.objectStore('attendance');
        const index = store.index('internId');
        const request = index.getAll(internId);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function addPerformance(record) {
    return dbAdd('performance', record);
}

function getAllPerformance() {
    return dbGetAll('performance');
}

function getPerformanceByInternId(internId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('performance', 'readonly');
        const store = transaction.objectStore('performance');
        const index = store.index('internId');
        const request = index.getAll(internId);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function updatePerformance(record) {
    return dbPut('performance', record);
}

function saveSetting(key, value) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('settings', 'readwrite');
        const store = transaction.objectStore('settings');
        const request = store.put({ key, value });

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getSetting(key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('settings', 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result?.value ?? null);
        request.onerror = () => reject(request.error);
    });
}

function escapeCSVValue(value) {
    const stringValue = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

// Phone numbers are plain digit strings (e.g. "0612345678"). Written as a
// bare CSV value, spreadsheet apps auto-detect it as a number on open and
// silently drop any leading zero (or switch to scientific notation for
// longer digit strings) — the number itself never changes, just how Excel/
// Sheets chooses to display it. Wrapping it as an ="..." text formula forces
// it to stay literal text so every digit, including a leading zero, survives.
function escapeCSVPhoneValue(value) {
    const stringValue = value === null || value === undefined ? '' : String(value);
    return `="${stringValue.replace(/"/g, '""')}"`;
}

/* 
  CSV Exporter
  Creates a plain text file structured as Comma Separated Values (CSV) in memory using Blobs, 
  creates an invisible HTML link tag (`<a>`), triggers a click to prompt browser download, and then cleans up memory.
*/
function exportToCSV(storeName) {
    return new Promise(async (resolve, reject) => {
        try {
            let data = [];
            if (storeName === 'interns') {
                data = await getAllInterns();
            } else if (storeName === 'supervisors') {
                data = await getAllSupervisors();
            } else if (storeName === 'attendance') {
                const allAttendance = await getAllAttendance();
                const latestByIntern = {};
                allAttendance.forEach(record => {
                    latestByIntern[record.internId] = record;
                });
                data = Object.values(latestByIntern);
            } else if (storeName === 'performance') {
                data = await getAllPerformance();
            }

            if (data.length === 0) {
                reject('No data to export');
                return;
            }

            const ID_FIELDS = new Set(['id', 'internId', 'internId_code', 'supervisorId']);
           
            const EXCLUDED_FIELDS = {
                attendance: new Set(['remarks'])
            };
            const excluded = EXCLUDED_FIELDS[storeName] || new Set();
            const keys = Object.keys(data[0]).filter(key => !ID_FIELDS.has(key) && !excluded.has(key));
            if (storeName === 'attendance') {
                ['permissionReason', 'permissionDate', 'permissionFromTime', 'permissionToTime', 'permissionRecordedAt'].forEach(key => {
                    if (!keys.includes(key)) keys.push(key);
                });
            }
            let csv = ['No.', ...keys].map(escapeCSVValue).join(',') + '\n';

            // Fields that are only ever filled in for a subset of rows (e.g. an
            // intern who was never excused has no originalStatus/excuseReason/
            // excusedAt) show up as a blank cell in the spreadsheet, which is easy
            // to misread as missing data versus "not applicable". Fill those with
            // a literal "-" instead of leaving them empty.
            const DASH_IF_EMPTY_FIELDS = {
                attendance: new Set(['originalStatus', 'excuseReason', 'excusedAt', 'permissionReason', 'permissionDate', 'permissionFromTime', 'permissionToTime', 'permissionRecordedAt'])
            };
            const dashIfEmpty = DASH_IF_EMPTY_FIELDS[storeName] || new Set();

            data.forEach((item, index) => {
                const values = [index + 1, ...keys.map(key => {
                    const rawValue = (dashIfEmpty.has(key) && (item[key] === null || item[key] === undefined || item[key] === ''))
                        ? '-'
                        : item[key];
                    return key === 'phone' ? escapeCSVPhoneValue(rawValue) : escapeCSVValue(rawValue);
                })];
                csv += values.join(',') + '\n';
            });

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${storeName}_export.csv`;
            a.click();
            window.URL.revokeObjectURL(url);

            resolve('Data exported successfully');
        } catch (error) {
            reject(error);
        }
    });
}

async function handleInternFormSubmit(event) {
    event.preventDefault();
    const firstName = document.getElementById('validationCustom01')?.value.trim();
    const lastName = document.getElementById('validationCustom02')?.value.trim();
    const email = document.getElementById('validationCustomUsername')?.value.trim();
    const phone = document.getElementById('validationCustom03')?.value.trim();
    const school = document.getElementById('validationCustom06')?.value.trim();
    const department = document.getElementById('validationCustom04')?.value;
    const gender = document.getElementById('validationCustom05')?.value;

    if (!firstName || !lastName || !email || !phone || !school || !department || !gender) {
        showAlert('Please fill all intern registration fields.', 'warning');
        return;
    }
    if (!NAME_REGEX.test(firstName) || !NAME_REGEX.test(lastName)) {
        showAlert('Names can only contain letters and spaces.', 'error');
        return;
    }
    if (!EMAIL_REGEX.test(email)) {
        showAlert('Please enter a valid email address.', 'error');
        return;
    }
    if (!isValidPhone(phone)) {
        showAlert('Please enter a valid phone number (must be exactly 9 digits).', 'error');
        return;
    }

    try {
        const exists = await emailExistsInStore('interns', email);
        if (exists) {
            showAlert('An intern with this email is already registered.', 'warning');
            return;
        }

        const intern = {
            id: Date.now(),
            firstName,
            lastName,
            email,
            phone,
            school,
            department,
            gender,
            internId: generateInternID(),
            dateAdded: new Date().toISOString()
        };

        await addIntern(intern);
        await createAttendanceRecordForNewIntern(intern);

        showAlert('Intern registered successfully.', 'success');
        event.target.reset();
        closeAddUserModal();
        loadDashboardUsers();
    } catch (error) {
        showAlert('Error registering intern: ' + (error?.message || error), 'error');
    }
}

async function handleSupervisorFormSubmit(event) {
    event.preventDefault();
    const firstName = document.getElementById('supervisorFirstName')?.value.trim();
    const lastName = document.getElementById('supervisorLastName')?.value.trim();
    const gender = document.getElementById('supervisorGender')?.value;
    const email = document.getElementById('supervisorEmail')?.value.trim();
    const phone = document.getElementById('supervisorPhone')?.value.trim();
    const department = document.getElementById('supervisorDepartment')?.value;

    if (!firstName || !lastName || !email || !phone || !department || !gender) {
        showAlert('Please fill all supervisor registration fields.', 'warning');
        return;
    }
    if (!NAME_REGEX.test(firstName) || !NAME_REGEX.test(lastName)) {
        showAlert('Supervisor names can only contain letters and spaces.', 'error');
        return;
    }
    if (!EMAIL_REGEX.test(email)) {
        showAlert('Please enter a valid email address.', 'error');
        return;
    }
    if (!isValidPhone(phone)) {
        showAlert('Please enter a valid phone number (must be exactly 9 digits).', 'error');
        return;
    }

    try {
        const exists = await emailExistsInStore('supervisors', email);
        if (exists) {
            showAlert('A supervisor with this email is already registered.', 'warning');
            return;
        }

        const supervisor = {
            id: Date.now(),
            firstName,
            lastName,
            gender,
            email,
            phone,
            department,
            status: 'Active',
            dateAdded: new Date().toISOString()
        };

        await addSupervisor(supervisor);
        showAlert('Supervisor registered successfully.', 'success');
        event.target.reset();
        closeSupervisorModal();
        loadSupervisorsPage();
    } catch (error) {
        showAlert('Error registering supervisor: ' + (error?.message || error), 'error');
    }
}

function handleFormSubmit(event, formType) {
    if (formType === 'intern') {
        handleInternFormSubmit(event);
    } else if (formType === 'supervisor') {
        handleSupervisorFormSubmit(event);
    }
}

function generateInternID() {
    const year = new Date().getFullYear();
    const randomNum = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    return `INT-${year}-${randomNum}`;
}

async function createAttendanceRecordForNewIntern(intern) {
    const today = getLocalDateString();

    const attendanceRecord = {
        id: Date.now(),
        internId: intern.id,
        internName: `${intern.firstName} ${intern.lastName}`,
        internId_code: intern.internId,
        email: intern.email,
        department: intern.department, 
        date: today,
        checkInTime: null,
        checkOutTime: null,
        status: '-',
        createdAt: new Date().toISOString()
    };
    
    try {
        await addAttendance(attendanceRecord);
        console.log('✅ Attendance record created for:', intern.firstName, intern.lastName);
    } catch (error) {
        console.error('❌ Error creating attendance record:', error);
    }
}

/*
  DAILY RESET + HISTORY
  Attendance records are already keyed by date under the hood (one record per
  intern per day), so history was technically never lost — but two things
  were missing:
    1. A day that passes with an intern never checking in left that day's
       record stuck at status '-' forever, instead of being finalized as
       "Absent". That made the weekly Absent count meaningless.
    2. The attendance table read from ALL records ever created and just took
       whichever one happened to be last per intern, so a stale status from
       a previous day could still show up today instead of resetting.
  This function runs once each time the Attendance page loads and fixes both:
  it finalizes any leftover "-" record from a past day as Absent, and makes
  sure every currently-registered intern has a fresh blank record for today.
*/
async function finalizeAndPrepareAttendanceForToday() {
    const today = getLocalDateString();

    try {
        const [allInterns, allAttendance] = await Promise.all([getAllInterns(), getAllAttendance()]);

        const recordsByIntern = {};
        allAttendance.forEach(record => {
            if (!recordsByIntern[record.internId]) recordsByIntern[record.internId] = [];
            recordsByIntern[record.internId].push(record);
        });

        const writes = [];

        allInterns.forEach((intern, index) => {
            const records = recordsByIntern[intern.id] || [];
            let hasToday = false;

            records.forEach(record => {
                if (record.date === today) {
                    hasToday = true;
                } else if (record.status === '-' || !record.status) {
                    // The day is over and this intern never checked in — file it as Absent.
                    writes.push(dbPut('attendance', {
                        ...record,
                        status: 'Absent',
                        finalizedAt: new Date().toISOString()
                    }));
                }
            });

            if (!hasToday) {
                writes.push(addAttendance({
                    id: Date.now() + index,
                    internId: intern.id,
                    internName: `${intern.firstName} ${intern.lastName}`,
                    internId_code: intern.internId,
                    email: intern.email,
                    department: intern.department,
                    date: today,
                    checkInTime: null,
                    checkOutTime: null,
                    status: '-',
                    createdAt: new Date().toISOString()
                }));
            }
        });

        if (writes.length) {
            await Promise.all(writes);
            console.log(`✅ Attendance day rollover complete: ${writes.length} record(s) finalized/created.`);
        }
    } catch (error) {
        console.error('❌ Error preparing today\'s attendance:', error);
    }
}

// Monday–Sunday boundaries (as 'YYYY-MM-DD' strings) for the week containing referenceDate.
function getWeekRangeStrings(referenceDate = new Date()) {
    const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
    const day = date.getDay(); // 0 = Sunday ... 6 = Saturday
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const monday = new Date(date);
    monday.setDate(date.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const toISODate = (d) => getLocalDateString(d);
    return { start: toISODate(monday), end: toISODate(sunday) };
}

// Tallies how many times an intern was Present / Late / Absent within a week range.
function summarizeWeeklyAttendance(records, weekRange) {
    const summary = { present: 0, late: 0, absent: 0, excused: 0 };
    records.forEach(record => {
        if (record.date < weekRange.start || record.date > weekRange.end) return;
        if (record.status === 'Present') summary.present++;
        else if (record.status === 'Late') summary.late++;
        else if (record.status === 'Absent') summary.absent++;
        else if (record.status === 'Excused') summary.excused++;
    });
    return summary;
}

async function loadAttendanceStatistics() {
    const today = getLocalDateString();
    
    try {
        const allInterns = await getAllInterns();
        const allAttendance = await getAllAttendance();
        const todayAttendance = allAttendance.filter(a => a.date === today);
        
        const totalCount = allInterns.length;
        const presentCount = todayAttendance.filter(a => a.status === 'Present').length;
        const lateCount = todayAttendance.filter(a => a.status === 'Late').length;
        const absentCount = todayAttendance.filter(a => a.status === 'Absent').length;
        const excusedCount = todayAttendance.filter(a => a.status === 'Excused').length;
        
        const totalElement = document.getElementById('totalInterns');
        if (totalElement) totalElement.textContent = totalCount;
        
        const presentElement = document.getElementById('presentToday');
        if (presentElement) presentElement.textContent = presentCount;
        
        const lateElement = document.getElementById('lateToday');
        if (lateElement) lateElement.textContent = lateCount;
        
        const absentElement = document.getElementById('absentToday');
        if (absentElement) absentElement.textContent = absentCount;

        const excusedElement = document.getElementById('excusedToday');
        if (excusedElement) excusedElement.textContent = excusedCount;
        
        console.log(`📊 Attendance Stats - Total: ${totalCount}, Present: ${presentCount}, Late: ${lateCount}, Absent: ${absentCount}, Excused: ${excusedCount}`);
    } catch (error) {
        console.error('❌ Error loading attendance statistics:', error);
    }
}

async function loadAttendanceTable() {
    const today = getLocalDateString();
    
    try {
        const allInterns = await getAllInterns();
        const allAttendance = await getAllAttendance();
        
        // Only today's record should drive what the table shows — this is what
        // makes the view "reset" each day instead of carrying over a stale
        // status from a previous day. Older records stay in the DB untouched.
        const attendanceMap = {};
        allAttendance.forEach(record => {
            if (record.date === today) {
                attendanceMap[record.internId] = record;
            }
        });

        const statusFilterEl = document.getElementById('attendanceStatusFilter');
        const searchInputEl = document.getElementById('attendanceSearchInput');
        const statusFilter = statusFilterEl ? statusFilterEl.value : 'all';
        const searchTerm = searchInputEl ? searchInputEl.value.trim().toLowerCase() : '';

        const filteredInterns = allInterns.filter(intern => {
            const attendance = attendanceMap[intern.id] || { status: '-' };
            const matchesStatus = statusFilter === 'all' || attendance.status === statusFilter;
            const fullName = `${intern.firstName} ${intern.lastName}`.toLowerCase();
            const matchesSearch = !searchTerm ||
                fullName.includes(searchTerm) ||
                (intern.department || '').toLowerCase().includes(searchTerm);
            return matchesStatus && matchesSearch;
        });

        let tableHTML = `
            <table class="table table-hover">
                <thead class="table-light">
                    <tr>
                        <th style="width: 5%"><input type="checkbox" class="form-check-input"></th>
                        <th style="width: 18%">Intern</th>
                        <th style="width: 12%">Department</th>
                        <th style="width: 9%">Check In</th>
                        <th style="width: 12%">Check Out</th>
                        <th style="width: 9%">Status</th>
                        <th style="width: 28%">Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const windowClosed = isAttendanceWindowClosed();

        filteredInterns.forEach(intern => {
            const attendance = attendanceMap[intern.id] || {
                checkInTime: '',
                checkOutTime: '',
                status: '-',
            };
            
            const statusColor = attendance.status === 'Present' ? 'success' :
                                attendance.status === 'Late' ? 'warning' :
                                attendance.status === 'Absent' ? 'danger' :
                                attendance.status === 'Excused' ? 'excused' : 'secondary';
            
            const statusLockIcon = attendance.statusLockedAt ? '<i class="fas fa-lock status-lock-icon" title="Status locked"></i>' : '';

            const excuseReasonIcon = attendance.status === 'Excused' && attendance.excuseReason
                ? `<i class="fas fa-circle-info excuse-reason-icon" title="${escapeHTML(attendance.excuseReason)}"></i>`
                : '';

            const permissionStatusHTML = isPermissionActive(attendance)
                ? `
                    <div class="permission-status">
                        <span class="badge bg-info status-badge">
                            On Permission
                            <i class="fas fa-clock permission-info-icon" title="${escapeHTML(`${attendance.permissionDate || today}, ${formatPermissionTimeRange(attendance)}`)}"></i>
                        </span>
                        <small>${escapeHTML(attendance.permissionReason)}</small>
                    </div>
                `
                : '';

            const statusBadge = permissionStatusHTML || `<span class="badge bg-${statusColor} status-badge">${attendance.status}${statusLockIcon}${excuseReasonIcon}</span>`;

            const hasCheckedIn = Boolean(attendance.checkInTime);
            const hasCheckedOut = Boolean(attendance.checkOutTime);
            const checkInDisabled = windowClosed || hasCheckedIn;
            const checkOutDisabled = windowClosed || !hasCheckedIn || hasCheckedOut;

            // Excusing is available any time attendance isn't already "Present" or
            // "Excused" — including before check-in, so a pre-approved absence can
            // be recorded ahead of time instead of only after the fact.
            const excuseActionHTML = attendance.status === 'Excused'
                ? `<button class="btn btn-light" type="button" title="Remove excused status" onclick="revertExcuse(${intern.id})"><i class="fas fa-rotate-left"></i></button>`
                : attendance.status !== 'Present'
                    ? `<button class="btn btn-light" type="button" title="Mark as excused" onclick="excuseAttendance(${intern.id})"><i class="fas fa-notes-medical"></i></button>`
                    : '';

            tableHTML += `
                <tr>
                    <td><input type="checkbox" class="form-check-input intern-select" value="${intern.id}"></td>
                    <td>
                        <div class="d-flex align-items-center">
                            <span class="dashboard-avatar me-2">${escapeHTML(getUserInitials(intern.firstName, intern.lastName))}</span>
                            <div>
                                <div class="fw-bold">${intern.firstName} ${intern.lastName}</div>
                                
                            </div>
                        </div>
                    </td>
                    <td>${intern.department}</td>
                   <td>
                    ${attendance.checkInTime 
                        ? `<span class="btn-light">${attendance.checkInTime}</span>`
                        : `<button class="btn btn-light btn-outline-secondary" ${checkInDisabled ? 'disabled' : ''} onclick="checkInAttendance(${intern.id})"><i class="fas fa-right-to-bracket"></i> In</button>`
                    }
                    </td>
                    <td>
                        ${attendance.checkOutTime 
                            ? `<span class="btn-light">${attendance.checkOutTime}</span>`
                            : `<button class="btn btn-light btn-outline-secondary" ${checkOutDisabled ? 'disabled' : ''} onclick="checkOutAttendance(${intern.id})"><i class="fas fa-right-from-bracket"></i> Out</button>`
                        }
                    </td>
                    <td>${statusBadge}</td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-light" type="button" title="View details" onclick="viewAttendanceDetails(${intern.id})"><i class="fas fa-eye"></i></button>
                            <button class="btn btn-light" type="button" title="Record temporary permission" onclick="recordTemporaryPermission(${intern.id})"><i class="fas fa-clock"></i></button>
                            ${excuseActionHTML}
                        </div>
                    </td>
                                    </tr>
                                `;
        });
        
        tableHTML += `
                </tbody>
            </table>
        `;

        const tableContainer = document.querySelector('.table-container') || 
                               document.querySelector('[data-attendance-table]');
        if (tableContainer) {
            if (filteredInterns.length === 0) {
                tableContainer.innerHTML = `
                    <div class="dashboard-empty-state">
                        <i class="fas fa-list-check"></i>
                        <h3>No matching attendance records</h3>
                        <p>Try a different status filter or search term.</p>
                    </div>
                `;
            } else {
                tableContainer.innerHTML = tableHTML;
                bindAttendanceSelectionControls();
            }
        }
        
        console.log('✅ Attendance table loaded with', filteredInterns.length, 'of', allInterns.length, 'interns');
    } catch (error) {
        console.error('❌ Error loading attendance table:', error);
    }
}

function applyAttendanceFilters() {
    loadAttendanceTable();
}

function applyGroupInternFilters() {
    loadGroupTools();
}

function applyInternsFilter() {
    loadDashboardUsers();
}

function applySupervisorsFilter() {
    loadSupervisorsPage();
}

function formatPermissionTimeRange(record) {
    const from = record.permissionFromTime || '-';
    const to = record.permissionToTime || '-';
    return `${from} to ${to}`;
}

function hasPermissionRecord(record) {
    return Boolean(record && record.permissionReason);
}

function isPermissionActive(record, now = new Date()) {
    if (!hasPermissionRecord(record) || !record.permissionDate || !record.permissionToTime) {
        return false;
    }

    const permissionEndsAt = new Date(`${record.permissionDate}T${record.permissionToTime}`);
    if (Number.isNaN(permissionEndsAt.getTime())) {
        return false;
    }

    return now <= permissionEndsAt;
}

async function viewAttendanceDetails(internId) {
    try {
        const intern = await getInternById(internId);
        if (!intern) {
            showAlert('Intern record was not found.', 'warning');
            return;
        }

        const records = await getAttendanceByInternId(internId);
        const weekRange = getWeekRangeStrings();
        const weekly = summarizeWeeklyAttendance(records, weekRange);

        const recordsByDate = {};
        records.forEach(record => { recordsByDate[record.date] = record; });

        const today = getLocalDateString();
        const monday = new Date(`${weekRange.start}T00:00:00`);
        const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

        // Build this week's Monday-Friday rows from whatever is already stored
        // for each date (finalizeAndPrepareAttendanceForToday keeps every past
        // day's record around instead of deleting it, so this is just a lookup).
        const weekDays = WEEKDAY_LABELS.map((label, index) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + index);
            const dateStr = getLocalDateString(date);
            const record = recordsByDate[dateStr];

            return {
                label,
                dateStr,
                checkIn: record?.checkInTime || null,
                checkOut: record?.checkOutTime || null,
                status: record?.status && record.status !== '-' ? record.status : null,
                excuseReason: record?.excuseReason || null,
                permissionReason: record?.permissionReason || null,
                permissionTime: record?.permissionReason ? formatPermissionTimeRange(record) : null,
                isToday: dateStr === today,
                isFuture: dateStr > today
            };
        });

        showAttendanceWeekModal({ intern, weekDays, weekly });
    } catch (error) {
        showAlert('Error loading attendance details: ' + error, 'error');
    }
}

/*
  Weekly attendance table modal (Monday-Friday) for a single intern, shown
  by the "View details" button on the Attendance page. Reuses the same
  .custom-modal-overlay / .custom-modal / .details-modal shell as every
  other details popup in the app, so it matches the existing look, and just
  swaps the row-list body for a compact table plus a 3-up stat summary.
*/
function showAttendanceWeekModal({ intern, weekDays, weekly }) {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';

    const initials = getUserInitials(intern.firstName, intern.lastName);

    const STATUS_LABEL = {
        Present: 'present',
        Late: 'late',
        Absent: 'absent',
        Excused: 'excused'
    };

    const formatShortDate = (dateStr) => new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
    });

    const rowsHTML = weekDays.map(day => {
        let pillClass = 'upcoming';
        let pillLabel = '—';

        if (day.status && STATUS_LABEL[day.status]) {
            pillClass = STATUS_LABEL[day.status];
            pillLabel = day.status;
        } else if (day.isToday) {
            pillClass = 'pending';
            pillLabel = 'Pending';
        } else if (!day.isFuture) {
            pillClass = 'absent';
            pillLabel = 'Absent';
        }

        const noteParts = [];
        if (day.excuseReason) noteParts.push(`Excuse: ${day.excuseReason}`);
        if (day.permissionReason) noteParts.push(`Permission: ${day.permissionReason}${day.permissionTime ? ` (${day.permissionTime})` : ''}`);
        const pillTitle = noteParts.length > 0 ? ` title="${escapeHTML(noteParts.join(' | '))}"` : '';

        return `
            <tr>
                <td class="week-day-cell">
                    <span class="week-day-label">${escapeHTML(day.label)}</span>
                    <span class="week-day-date">${escapeHTML(formatShortDate(day.dateStr))}</span>
                </td>
                <td>${escapeHTML(day.checkIn || '-')}</td>
                <td>${escapeHTML(day.checkOut || '-')}</td>
                <td class="week-status-cell"><span class="week-status-pill ${pillClass}"${pillTitle}>${escapeHTML(pillLabel)}</span></td>
            </tr>
        `;
    }).join('');

    overlay.innerHTML = `
        <div class="custom-modal details-modal">
            <div class="custom-modal-header">
                <div class="week-avatar">${escapeHTML(initials)}</div>
                <div>
                    <h3>${escapeHTML(`${intern.firstName} ${intern.lastName}`)}</h3>
                    <p>${escapeHTML(intern.department || '-')}</p>
                </div>
            </div>
            <div class="week-table-wrap">
                <table class="week-attendance-table">
                    <thead>
                        <tr>
                            <th>Day</th>
                            <th>Check in</th>
                            <th>Check out</th>
                            <th class="week-status-cell">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHTML}
                    </tbody>
                </table>
            </div>
            <div class="week-stat-grid">
                <div class="week-stat-card present">
                    <span class="week-stat-label">Present</span>
                    <span class="week-stat-value">${weekly.present}</span>
                </div>
                <div class="week-stat-card late">
                    <span class="week-stat-label">Late</span>
                    <span class="week-stat-value">${weekly.late}</span>
                </div>
                <div class="week-stat-card absent">
                    <span class="week-stat-label">Absent</span>
                    <span class="week-stat-value">${weekly.absent}</span>
                </div>
                <div class="week-stat-card excused">
                    <span class="week-stat-label">Excused</span>
                    <span class="week-stat-value">${weekly.excused}</span>
                </div>
            </div>
            <div class="custom-modal-actions">
                <button type="button" class="custom-modal-confirm details-close-btn">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => {
        overlay.classList.add('closing');
        setTimeout(() => overlay.remove(), 180);
    };

    overlay.querySelector('.details-close-btn').addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
    });
}

function bindAttendanceSelectionControls() {
    const selectAllCheckbox = document.querySelector('.table thead input[type="checkbox"]');
    const rowCheckboxes = Array.from(document.querySelectorAll('.intern-select'));
    const deleteButton = document.getElementById('deleteSelectedInterns');

    if (!deleteButton) return;

    const updateDeleteButton = () => {
        const selectedCount = rowCheckboxes.filter(checkbox => checkbox.checked).length;
        deleteButton.disabled = selectedCount === 0;
        deleteButton.querySelector('span').textContent = selectedCount > 0 ? `Delete (${selectedCount})` : 'Delete';

        if (selectAllCheckbox) {
            selectAllCheckbox.checked = selectedCount > 0 && selectedCount === rowCheckboxes.length;
            selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < rowCheckboxes.length;
        }
    };

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', () => {
            rowCheckboxes.forEach(checkbox => {
                checkbox.checked = selectAllCheckbox.checked;
            });
            updateDeleteButton();
        });
    }

    rowCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateDeleteButton);
    });

    deleteButton.onclick = deleteSelectedAttendanceRecords;
    updateDeleteButton();
}

async function deleteSelectedAttendanceRecords() {
    const selectedIds = Array.from(document.querySelectorAll('.intern-select:checked'))
        .map(checkbox => Number(checkbox.value));

    if (selectedIds.length === 0) {
        showAlert('Select at least one intern to clear attendance for.', 'warning');
        return;
    }

    const label = selectedIds.length === 1 ? 'this intern' : `these ${selectedIds.length} interns`;
    const confirmed = await showCustomConfirm(
        `Delete attendance records for ${label}? The intern record itself will not be affected.`,
        {
            title: 'Delete Attendance Records',
            confirmText: 'Delete',
            danger: true
        }
    );
    if (!confirmed) return;

    try {
        await Promise.all(selectedIds.map(internId => deleteRecordsByInternId('attendance', internId)));
        showAlert(`Attendance cleared for ${selectedIds.length} intern${selectedIds.length === 1 ? '' : 's'}.`, 'success');
        await loadAttendanceStatistics();
        await loadAttendanceTable();
    } catch (error) {
        console.error('Error deleting attendance records:', error);
        showAlert('Error deleting attendance records: ' + error, 'error');
    }
}

function bindPerformanceSelectionControls() {
    const selectAllCheckbox = document.querySelector('.table thead input[type="checkbox"]');
    const rowCheckboxes = Array.from(document.querySelectorAll('.performance-select'));
    const deleteButton = document.getElementById('deleteSelectedInterns');

    if (!deleteButton) return;

    const updateDeleteButton = () => {
        const selectedCount = rowCheckboxes.filter(checkbox => checkbox.checked).length;
        deleteButton.disabled = selectedCount === 0;
        deleteButton.querySelector('span').textContent = selectedCount > 0 ? `Delete (${selectedCount})` : 'Delete';

        if (selectAllCheckbox) {
            const selectableCount = rowCheckboxes.filter(checkbox => !checkbox.disabled).length;
            selectAllCheckbox.checked = selectedCount > 0 && selectedCount === selectableCount;
            selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < selectableCount;
        }
    };

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', () => {
            rowCheckboxes.forEach(checkbox => {
                if (!checkbox.disabled) checkbox.checked = selectAllCheckbox.checked;
            });
            updateDeleteButton();
        });
    }

    rowCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateDeleteButton);
    });

    deleteButton.onclick = deleteSelectedPerformanceRecords;
    updateDeleteButton();
}

async function deleteSelectedPerformanceRecords() {
    const selectedIds = Array.from(document.querySelectorAll('.performance-select:checked'))
        .map(checkbox => Number(checkbox.value));

    if (selectedIds.length === 0) {
        showAlert('Select at least one intern to clear performance reviews for.', 'warning');
        return;
    }

    const label = selectedIds.length === 1 ? 'this intern' : `these ${selectedIds.length} interns`;
    const confirmed = await showCustomConfirm(
        `Delete performance reviews for ${label}? The intern record itself will not be affected.`,
        {
            title: 'Delete Performance Records',
            confirmText: 'Delete',
            danger: true
        }
    );
    if (!confirmed) return;

    try {
        await Promise.all(selectedIds.map(internId => deleteRecordsByInternId('performance', internId)));
        showAlert(`Performance reviews cleared for ${selectedIds.length} intern${selectedIds.length === 1 ? '' : 's'}.`, 'success');
        await loadPerformancePage();
    } catch (error) {
        console.error('Error deleting performance records:', error);
        showAlert('Error deleting performance records: ' + error, 'error');
    }
}

function toggleUserSubmenu(event) {
    event.preventDefault();

    const userLink = event.currentTarget;
    const submenu = userLink.nextElementSibling;
    if (!submenu?.classList.contains('user-submenu')) return;

    userLink.classList.toggle('open');
    submenu.classList.toggle('open');
}

/* ---- mobile / tablet sidebar (hamburger) ---- */

function toggleSidebar() {
    const sidebar = document.querySelector('.side-bar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar) return;

    const isOpen = sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active', isOpen);
    document.body.classList.toggle('sidebar-open', isOpen);
}

function closeSidebar() {
    const sidebar = document.querySelector('.side-bar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    document.body.classList.remove('sidebar-open');
}

// close the sidebar automatically once the viewport is back to desktop size
window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) closeSidebar();
});

// close the sidebar when a nav link inside it is tapped (mobile UX)
document.addEventListener('click', (event) => {
    if (window.innerWidth > 1024) return;
    const sidebar = document.querySelector('.side-bar');
    if (!sidebar || !sidebar.classList.contains('open')) return;

    const tappedToggle = event.target.closest('#menuToggle');
    const tappedNavLink = event.target.closest('.side-bar a.nav-link, .side-bar .nav-sublink');
    if (tappedToggle) return; // toggle button handles itself
    if (tappedNavLink) return; // let the navigation happen, no need to fight it
});

function openAddUserModal() {
    const modal = document.getElementById('addUserModal');
    if (!modal) return;

    modal.hidden = false;
    modal.classList.remove('closing');
    document.body.classList.add('modal-open');
}

function closeAddUserModal() {
    const modal = document.getElementById('addUserModal');
    if (!modal || modal.hidden) return;

    const form = modal.querySelector('form');
    if (form) {
        form.reset();
        form.classList.remove('was-validated');
    }

    modal.classList.add('closing');
    setTimeout(() => {
        modal.hidden = true;
        modal.classList.remove('closing');
        document.body.classList.remove('modal-open');
    }, 180);
}

function openSupervisorModal() {
    const modal = document.getElementById('supervisorModal');
    if (!modal) return;

    modal.hidden = false;
    modal.classList.remove('closing');
    document.body.classList.add('modal-open');
}

function closeSupervisorModal() {
    const modal = document.getElementById('supervisorModal');
    if (!modal || modal.hidden) return;

    const form = modal.querySelector('form');
    if (form) {
        form.reset();
        form.classList.remove('was-validated');
    }

    modal.classList.add('closing');
    setTimeout(() => {
        modal.hidden = true;
        modal.classList.remove('closing');
        document.body.classList.remove('modal-open');
    }, 180);
}

function formatDashboardDate(value) {
    if (!value) return '-';

    return new Date(value).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function getUserInitials(firstName, lastName) {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'U';
}

function recordMatchesNameOrDepartment(record, searchTerm) {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return true;

    const fullName = `${record.firstName || ''} ${record.lastName || ''}`.toLowerCase();
    const department = (record.department || '').toLowerCase();

    return fullName.includes(normalizedSearch) || department.includes(normalizedSearch);
}

async function loadDashboardUsers() {
    const tableContainer = document.querySelector('[data-user-table]');
    if (!tableContainer) return;

    try {
        const allInterns = (await getAllInterns()).sort((a, b) => b.id - a.id);
        const searchInput = document.getElementById('internSearchInput');
        const searchTerm = searchInput ? searchInput.value : '';
        const interns = allInterns.filter(intern => recordMatchesNameOrDepartment(intern, searchTerm));
        const today = getLocalDateString();
        const departmentCount = new Set(allInterns.map(intern => intern.department).filter(Boolean)).size;
        const addedTodayCount = allInterns.filter(intern => intern.dateAdded?.startsWith(today)).length;

        const totalElement = document.getElementById('dashboardTotalUsers');
        const departmentElement = document.getElementById('dashboardDepartments');
        const addedTodayElement = document.getElementById('dashboardAddedToday');

        if (totalElement) totalElement.textContent = allInterns.length;
        if (departmentElement) departmentElement.textContent = departmentCount;
        if (addedTodayElement) addedTodayElement.textContent = addedTodayCount;

        if (allInterns.length === 0) {
            tableContainer.innerHTML = `
                <div class="dashboard-empty-state">
                    <i class="fas fa-users"></i>
                    <h3>No interns yet</h3>
                    <p>Add your first intern to start tracking records.</p>
                </div>
            `;
            return;
        }

        if (interns.length === 0) {
            tableContainer.innerHTML = `
                <div class="dashboard-empty-state">
                    <i class="fas fa-search"></i>
                    <h3>No matching interns</h3>
                    <p>Try a different name or department.</p>
                </div>
            `;
            return;
        }

        const rowsHTML = interns.map(intern => `
            <tr>
                <td>
                    <div class="dashboard-user-cell">
                        <span class="dashboard-avatar">${escapeHTML(getUserInitials(intern.firstName, intern.lastName))}</span>
                        <div>
                            <div class="fw-bold">${escapeHTML(intern.firstName)} ${escapeHTML(intern.lastName)}</div>
                        </div>
                    </div>
                </td>
                <td>${escapeHTML(intern.department)}</td>
                <td>${escapeHTML(intern.school || '-')}</td>
                <td>${escapeHTML(intern.phone)}</td>
                <td>${escapeHTML(intern.gender)}</td>
                <td>${escapeHTML(intern.supervisorName || 'Unassigned')}</td>
                <td>${escapeHTML(formatDashboardDate(intern.dateAdded))}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-light" type="button" title="View details" onclick="viewInternDetails(${intern.id})">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-primary" type="button" title="Update intern" onclick="editIntern(${intern.id})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn btn-primary" type="button" title="Assign supervisor" onclick="assignInternSupervisor(${intern.id})">
                            <i class="fas fa-user-plus"></i>
                        </button>
                        <button class="btn btn-danger" type="button" title="Delete intern" onclick="removeIntern(${intern.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        tableContainer.innerHTML = `
            <table class="table table-hover dashboard-user-table">
                <thead class="table-light">
                    <tr>
                        <th>Name</th>
                        <th>Department</th>
                        <th>School</th>
                        <th>Phone</th>
                        <th>Gender</th>
                        <th>Supervisor</th>
                        <th>Date</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHTML}
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error('Error loading dashboard users:', error);
        showAlert('Error loading dashboard users: ' + error, 'error');
    }
}

async function viewInternDetails(internId) {
    try {
        const intern = await getInternById(internId);
        if (!intern) {
            showAlert('Intern record was not found.', 'warning');
            return;
        }

        showDetailsModal({
            title:'Intern Details',
            rows: [       
                { label: 'Name', value: `${intern.firstName} ${intern.lastName}` },
                { label: 'Intern ID', value: intern.internId },
                { label: 'Email', value: intern.email },
                { label: 'Phone', value: intern.phone },
                { label: 'Department', value: intern.department },
                { label: 'School', value: intern.school },
                { label: 'Gender', value: intern.gender },
                { label: 'Supervisor', value: intern.supervisorName || 'Unassigned' },
                { label: 'Date', value: formatDashboardDate(intern.dateAdded) }
            ],
            exportText: 'Export Details',
            onExport: () => exportInternDetailsToCSV(intern)
        });
    } catch (error) {
        showAlert('Error loading intern details: ' + error, 'error');
    }
}

/*
  Exports every field for a single intern (the same information shown in the
  "Intern Details" popup) as its own standalone CSV. This is separate from
  exportToCSV(), which dumps every intern into one bulk file — the Attendance
  page's Export button keeps using that bulk exporter unchanged.
*/
function exportInternDetailsToCSV(intern) {
    try {
        const detailRows = [
            ['Name', `${intern.firstName} ${intern.lastName}`],
            ['Intern ID', intern.internId],
            ['Email', intern.email],
            ['Phone', intern.phone],
            ['Department', intern.department],
            ['School', intern.school],
            ['Gender', intern.gender],
            ['Supervisor', intern.supervisorName || 'Unassigned'],
            ['Date Added', formatDashboardDate(intern.dateAdded)]
        ];

        let csv = ['Field', 'Value'].map(escapeCSVValue).join(',') + '\n';
        detailRows.forEach(([label, value]) => {
            const escapedValue = label === 'Phone' ? escapeCSVPhoneValue(value) : escapeCSVValue(value);
            csv += [escapeCSVValue(label), escapedValue].join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = `${intern.firstName}_${intern.lastName}`.replace(/\s+/g, '_');
        a.download = `intern_${safeName}_details.csv`;
        a.click();
        window.URL.revokeObjectURL(url);

        showAlert('Intern details exported successfully.', 'success');
    } catch (error) {
        showAlert('Error exporting intern details: ' + error, 'error');
    }
}

async function editIntern(internId) {
    try {
        const intern = await getInternById(internId);
        if (!intern) {
            showAlert('Intern record was not found.', 'warning');
            return;
        }

        const values = await showCustomModal({
            title: 'Update Intern',
            message: `${intern.firstName} ${intern.lastName}`,
            confirmText: 'Update',
            fields: [
                { label: 'First name', name: 'firstName', value: intern.firstName || '' },
                { label: 'Last name', name: 'lastName', value: intern.lastName || '' },
                { label: 'Email', name: 'email', value: intern.email || '' },
                { label: 'Phone', name: 'phone', value: intern.phone || '', maxlength: 9, pattern: '\\d{9}', inputmode: 'numeric', helpText: 'Exactly 9 digits' },
                { label: 'School', name: 'school', value: intern.school || '' },
                {
                    label: 'Department',
                    name: 'department',
                    type: 'select',
                    value: intern.department || 'Software Engineering',
                    options: ['PDL','MANAGEMENT','ACCOUNTING','FINISHING','FABRIC OFFICE','GRAPHICS AND PRINTING','BINDING','MOUNTING','EDITING','MARKETING','SCREEN PRINTING','SECURITY','MAINTENANCE','TYPESETTING']

                },
                {
                    label: 'Gender',
                    name: 'gender',
                    type: 'select',
                    value: intern.gender || 'Male',
                    options: ['Male', 'Female']
                },
            ]
        });

        if (!values) return;

        if (!values.firstName.trim() || !values.lastName.trim() || !values.email.trim() || !values.phone.trim() || !values.school.trim() || !values.department || !values.gender) {
            showAlert('Please complete all intern fields.', 'warning');
            return;
        }
        if (!NAME_REGEX.test(values.firstName.trim()) || !NAME_REGEX.test(values.lastName.trim())) {
            showAlert('Intern names can only contain letters and spaces.', 'error');
            return;
        }
        if (!EMAIL_REGEX.test(values.email.trim())) {
            showAlert('Please enter a valid email address.', 'error');
            return;
        }
        if (!isValidPhone(values.phone)) {
            showAlert('Please enter a valid phone number (must be exactly 9 digits).', 'error');
            return;
        }

        await updateIntern({
            ...intern,
            firstName: values.firstName.trim(),
            lastName: values.lastName.trim(),
            email: values.email.trim(),
            phone: values.phone.trim(),
            school: values.school.trim(),
            department: values.department,
            gender: values.gender,
            updatedAt: new Date().toISOString()
        });

        showAlert('Intern updated successfully.', 'success');
        await loadDashboardUsers();
        if (document.querySelector('[data-supervisor-table]')) {
            await loadSupervisorsPage();
            await loadGroupTools();
        }
    } catch (error) {
        showAlert('Error updating intern: ' + error, 'error');
    }
}

async function assignInternSupervisor(internId) {
    try {
        const [intern, supervisors] = await Promise.all([
            getInternById(internId),
            getAllSupervisors()
        ]);

        if (!intern) {
            showAlert('Intern record was not found.', 'warning');
            return;
        }
        if (supervisors.length === 0) {
            showAlert('Register a supervisor before assigning interns.', 'warning');
            return;
        }

        const activeSupervisors = supervisors.filter(supervisor => (supervisor.status || 'Active') === 'Active');
        if (activeSupervisors.length === 0) {
            showAlert('No active supervisors are available for assignment.', 'warning');
            return;
        }

        const currentSupervisorIsActive = activeSupervisors.some(supervisor => supervisor.id === intern.supervisorId);

        const values = await showCustomModal({
            title: 'Assign Supervisor',
            message: `${intern.firstName} ${intern.lastName}`,
            confirmText: 'Assign',
            fields: [
                {
                    label: 'Supervisor',
                    name: 'supervisorId',
                    type: 'select',
                    value: currentSupervisorIsActive ? intern.supervisorId : activeSupervisors[0].id,
                    options: activeSupervisors.map(supervisor => ({
                        value: supervisor.id,
                        label: `${supervisor.firstName} ${supervisor.lastName} - ${supervisor.department}`
                    }))
                }
            ]
        });

        if (!values) return;

        const supervisor = activeSupervisors.find(item => item.id === Number(values.supervisorId));
        if (!supervisor) {
            showAlert('Supervisor record was not found or is no longer active.', 'warning');
            return;
        }

        await updateIntern({
            ...intern,
            supervisorId: supervisor.id,
            supervisorName: `${supervisor.firstName} ${supervisor.lastName}`,
            updatedAt: new Date().toISOString()
        });

        showAlert('Supervisor assigned successfully.', 'success');
        await loadDashboardUsers();
    } catch (error) {
        showAlert('Error assigning supervisor: ' + error, 'error');
    }
}

/* 
  COMPLEX FUNCTION: Delete Intern Cascade
  When removing an intern, we must also update all group mappings and delete 
  their dependent attendance/performance histories across multiple store tables.
*/
async function removeIntern(internId) {
    try {
        const intern = await getInternById(internId);
        if (!intern) {
            showAlert('Intern record was not found.', 'warning');
            return;
        }

        const confirmed = await showCustomConfirm(
            `Delete ${intern.firstName} ${intern.lastName}? This will also remove linked attendance and performance records.`,
            {
                title: 'Delete Intern',
                confirmText: 'Delete',
                danger: true
            }
        );

        if (!confirmed) return;

        const groups = await getAllGroups();
        await Promise.all(groups
            .filter(group => (group.internIds || []).includes(internId))
            .map(group => updateGroup({
                ...group,
                internIds: (group.internIds || []).filter(id => id !== internId),
                updatedAt: new Date().toISOString()
            })));

        await deleteInternWithRecords(internId);
        showAlert('Intern deleted successfully.', 'success');
        await loadDashboardUsers();
    } catch (error) {
        showAlert('Error deleting intern: ' + error, 'error');
    }
}

async function loadSupervisorsPage() {
    const tableContainer = document.querySelector('[data-supervisor-table]');
    if (!tableContainer) return;

    try {
        const [supervisors, interns] = await Promise.all([
            getAllSupervisors(),
            getAllInterns()
        ]);
        const searchInput = document.getElementById('supervisorSearchInput');
        const searchTerm = searchInput ? searchInput.value : '';
        const filteredSupervisors = supervisors.filter(supervisor => recordMatchesNameOrDepartment(supervisor, searchTerm));
        const assignedInternCounts = interns.reduce((counts, intern) => {
            if (intern.supervisorId) {
                counts[intern.supervisorId] = (counts[intern.supervisorId] || 0) + 1;
            }
            return counts;
        }, {});
        const today = getLocalDateString();
        const departmentCount = new Set(supervisors.map(supervisor => supervisor.department).filter(Boolean)).size;
        const addedTodayCount = supervisors.filter(supervisor => supervisor.dateAdded?.startsWith(today)).length;

        const totalElement = document.getElementById('supervisorTotalUsers');
        const departmentElement = document.getElementById('supervisorDepartments');
        const addedTodayElement = document.getElementById('supervisorAddedToday');

        if (totalElement) totalElement.textContent = supervisors.length;
        if (departmentElement) departmentElement.textContent = departmentCount;
        if (addedTodayElement) addedTodayElement.textContent = addedTodayCount;

        if (supervisors.length === 0) {
            tableContainer.innerHTML = `
                <div class="dashboard-empty-state">
                    <i class="fas fa-user-tie"></i>
                    <h3>No supervisors yet</h3>
                    <p>Use the form above to register the first supervisor.</p>
                </div>
            `;
            return;
        }

        if (filteredSupervisors.length === 0) {
            tableContainer.innerHTML = `
                <div class="dashboard-empty-state">
                    <i class="fas fa-search"></i>
                    <h3>No matching supervisors</h3>
                    <p>Try a different name or department.</p>
                </div>
            `;
            return;
        }

        const rowsHTML = filteredSupervisors.map(supervisor => {
            const status = supervisor.status || 'Active';
            const isActive = status === 'Active';

            return `
            <tr>
                <td>
                    <div class="dashboard-user-cell">
                        <span class="dashboard-avatar">${escapeHTML(getUserInitials(supervisor.firstName, supervisor.lastName))}</span>
                        <div>
                            <div class="fw-bold">${escapeHTML(supervisor.firstName)} ${escapeHTML(supervisor.lastName)}</div>
                        </div>
                    </div>
                </td>
                <td>${escapeHTML(supervisor.gender)}</td>
                <td>${escapeHTML(supervisor.phone)}</td>
                <td>${escapeHTML(supervisor.department)}</td>
                <td>${assignedInternCounts[supervisor.id] || 0}</td>
                <td>${escapeHTML(formatDashboardDate(supervisor.dateAdded))}</td>
               
                <td>
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" role="switch" id="switchCheck${supervisor.id}" ${isActive ? 'checked' : ''} onchange="toggleSupervisorStatus(${supervisor.id}, this.checked)">
                        <label class="form-check-label" for="switchCheck${supervisor.id}">${escapeHTML(status)}</label>
                    </div>
                </td>
                 <td>
                    <div class="table-actions">
                        <button class="btn btn-light" type="button" title="View details" onclick="viewSupervisorDetails(${supervisor.id})">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-primary" type="button" title="Update supervisor" onclick="editSupervisor(${supervisor.id})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn btn-primary" type="button" title="${isActive ? 'Assign supervisor to intern' : 'Inactive supervisors cannot be assigned'}" onclick="assignSupervisorToIntern(${supervisor.id})" ${isActive ? '' : 'disabled'}>
                            <i class="fas fa-user-plus"></i>
                        </button>
                        <button class="btn btn-danger" type="button" title="Delete supervisor" onclick="removeSupervisor(${supervisor.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        }).join('');

        tableContainer.innerHTML = `
            <table class="table table-hover dashboard-user-table">
                <thead class="table-light">
                    <tr>
                        <th>Name</th>
                        <th>Gender</th>
                        <th>Phone</th>
                        <th>Department</th>
                        <th>Interns</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Action</th>
                        
                    </tr>
                </thead>
                <tbody>
                    ${rowsHTML}
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error('Error loading supervisors:', error);
        showAlert('Error loading supervisors: ' + error, 'error');
    }
}


async function viewSupervisorDetails(supervisorId) {
    try {
        const [supervisor, interns] = await Promise.all([
            getSupervisorById(supervisorId),
            getAllInterns()
        ]);
        if (!supervisor) {
            showAlert('Supervisor record was not found.', 'warning');
            return;
        }

        const assignedCount = interns.filter(intern => intern.supervisorId === supervisor.id).length;

        showDetailsModal({
            title: 'Supervisor Details:' ,
            rows: [

                { label: 'Name', value: `${supervisor.firstName} ${supervisor.lastName}` },
                { label: 'Email', value: supervisor.email },
                { label: 'Phone', value: supervisor.phone },
                { label: 'Gender', value: supervisor.gender },
                { label: 'Department', value: supervisor.department },
                { label: 'Assigned Interns', value: assignedCount },
                { label: 'Status', value: supervisor.status || 'Active' },
                { label: 'Date', value: formatDashboardDate(supervisor.dateAdded) }
            ]
        });
    } catch (error) {
        showAlert('Error loading supervisor details: ' + error, 'error');
    }
}

async function editSupervisor(supervisorId) {
    try {
        const supervisor = await getSupervisorById(supervisorId);
        if (!supervisor) {
            showAlert('Supervisor record was not found.', 'warning');
            return;
        }

        const values = await showCustomModal({
            title: 'Update Supervisor',
            message: `${supervisor.firstName} ${supervisor.lastName}`,
            confirmText: 'Update',
            fields: [
                { label: 'First name', name: 'firstName', value: supervisor.firstName || '' },
                { label: 'Last name', name: 'lastName', value: supervisor.lastName || '' },
                { label: 'Email', name: 'email', value: supervisor.email || '' },
                { label: 'Phone', name: 'phone', value: supervisor.phone || '', maxlength: 9, pattern: '\\d{9}', inputmode: 'numeric', helpText: 'Exactly 9 digits' },
                { label: 'Gender',
                  name: 'gender',
                    type: 'select',
                    value: supervisor.gender ||'choose..',
                    options: ['Male', 'Female']

                },
                {
                    label: 'Department',
                    name: 'department',
                    type: 'select',
                    value: supervisor.department ||'software Engineering',
                    options: ['PDL', 'MANAGEMENT', 'ACCOUNTING', 'FINISHING', 'FABRIC OFFICE', 'GRAPHICS AND PRINTING', 'BINDING', 'MOUNTING', 'EDITING', 'MARKETING', 'SCREEN PRINTING', 'SECURITY', 'MAINTENANCE', 'TYPESETTING']
                },
                {
                    label: 'Status',
                    name: 'status',
                    type: 'select',
                    value: supervisor.status || 'Active',
                    options: ['Active', 'Inactive']
                },
                
            ]
        });

        if (!values) return;

        if (!values.firstName.trim() || !values.lastName.trim() || !values.email.trim() || !values.phone.trim() || !values.department) {
            showAlert('Please complete all supervisor fields.', 'warning');
            return;
        }
        if (!NAME_REGEX.test(values.firstName.trim()) || !NAME_REGEX.test(values.lastName.trim())) {
            showAlert('Supervisor names can only contain letters and spaces.', 'error');
            return;
        }
        if (!EMAIL_REGEX.test(values.email.trim())) {
            showAlert('Please enter a valid email address.', 'error');
            return;
        }
        if (!isValidPhone(values.phone)) {
            showAlert('Please enter a valid phone number (must be exactly 9 digits).', 'error');
            return;
        }

        await updateSupervisor({
            ...supervisor,
            firstName: values.firstName.trim(),
            lastName: values.lastName.trim(),
            gender: values.gender,
            email: values.email.trim(),
            phone: values.phone.trim(),
            department: values.department,
            status: values.status || supervisor.status || 'Active',
            updatedAt: new Date().toISOString()
        });
        showAlert('Supervisor updated successfully.', 'success');
        await loadSupervisorsPage();
        await loadGroupTools();
    } catch (error) {
        showAlert('Error updating supervisor: ' + error, 'error');
    }
}

async function toggleSupervisorStatus(supervisorId, isActive) {
    try {
        const supervisor = await getSupervisorById(supervisorId);
        if (!supervisor) {
            showAlert('Supervisor record was not found.', 'warning');
            await loadSupervisorsPage();
            return;
        }

        const newStatus = isActive ? 'Active' : 'Inactive';

        await updateSupervisor({
            ...supervisor,
            status: newStatus,
            updatedAt: new Date().toISOString()
        });

        showAlert(`${supervisor.firstName} ${supervisor.lastName} is now ${newStatus}.`, 'success');
        await loadSupervisorsPage();
    } catch (error) {
        showAlert('Error updating supervisor status: ' + error, 'error');
        await loadSupervisorsPage();
    }
}

async function assignSupervisorToIntern(supervisorId) {
    try {
        const [supervisor, interns] = await Promise.all([
            getSupervisorById(supervisorId),
            getAllInterns()
        ]);

        if (!supervisor) {
            showAlert('Supervisor record was not found.', 'warning');
            return;
        }
        if (interns.length === 0) {
            showAlert('Register interns before assigning supervisors.', 'warning');
            return;
        }

        const values = await showCustomModal({
            title: 'Assign Supervisor',
            message: `${supervisor.firstName} ${supervisor.lastName}`,
            confirmText: 'Assign',
            fields: [
                {
                    label: 'Intern',
                    name: 'internId',
                    type: 'select',
                    value: interns[0].id,
                    options: interns.map(intern => ({
                        value: intern.id,
                        label: `${intern.firstName} ${intern.lastName} - ${intern.department}`
                    }))
                }
            ]
        });

        if (!values) return;

        const intern = await getInternById(Number(values.internId));
        if (!intern) {
            showAlert('Intern record was not found.', 'warning');
            return;
        }
        if (isActive = status === 'inactive') {
            showAlert('Cannot assign a supervisor to an inactive intern.', 'warning');
            return;
        }

        await updateIntern({
            ...intern,
            supervisorId: supervisor.id,
            supervisorName: `${supervisor.firstName} ${supervisor.lastName}`,
            updatedAt: new Date().toISOString()
        });

        showAlert('Supervisor assigned to intern successfully.', 'success');
        await loadSupervisorsPage();
        await loadGroupTools();
    } catch (error) {
        showAlert('Error assigning supervisor: ' + error, 'error');
    }
}

async function removeSupervisor(supervisorId) {
    try {
        const supervisor = await getSupervisorById(supervisorId);
        if (!supervisor) {
            showAlert('Supervisor record was not found.', 'warning');
            return;
        }

        const confirmed = await showCustomConfirm(
            `Delete ${supervisor.firstName} ${supervisor.lastName}? Their interns will be unassigned.`,
            {
                title: 'Delete Supervisor',
                confirmText: 'Delete',
                danger: true
            }
        );

        if (!confirmed) return;

        const [interns, groups] = await Promise.all([
            getAllInterns(),
            getAllGroups()
        ]);

        await Promise.all(interns
            .filter(intern => intern.supervisorId === supervisorId)
            .map(intern => updateIntern({
                ...intern,
                supervisorId: null,
                supervisorName: '',
                updatedAt: new Date().toISOString()
            })));

        await Promise.all(groups
            .filter(group => group.supervisorId === supervisorId)
            .map(group => updateGroup({
                ...group,
                supervisorId: '',
                updatedAt: new Date().toISOString()
            })));

        await deleteSupervisor(supervisorId);
        showAlert('Supervisor deleted successfully.', 'success');
        await loadSupervisorsPage();
        await loadGroupTools();
    } catch (error) {
        showAlert('Error deleting supervisor: ' + error, 'error');
    }
}

function showSupervisorTab(tabName) {
    document.querySelectorAll('[data-supervisor-panel]').forEach(panel => {
        panel.hidden = panel.dataset.supervisorPanel !== tabName;
    });
    document.querySelectorAll('[data-supervisor-tab]').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.supervisorTab === tabName);
    });

    if (tabName === 'groups') {
        loadGroupTools();
    }
}

async function removeGroup(groupId) {
    try {
        const group = await getGroupById(groupId);
        if (!group) return;

        const confirmed = await showCustomConfirm(
            `Delete "${group.name}"? Interns in this group will be unassigned.`,
            {
                title: 'Delete group',
                confirmText: 'Delete',
                danger: true
            }
        );

        if (!confirmed) return;

        const groupInternIds = group.internIds || [];
        const interns = await getAllInterns();

        await Promise.all(interns
            .filter(intern => groupInternIds.includes(intern.id))
            .map(intern => updateIntern({
                ...intern,
                supervisorId: null,
                supervisorName: '',
                groupName: '',
                updatedAt: new Date().toISOString()
            })));

        await deleteGroup(groupId);
        if (editingGroupId === groupId) {
            cancelGroupEdit();
        }
        showAlert('Group deleted successfully.', 'success');
        await loadSupervisorsPage();
        await loadGroupTools();
    } catch (error) {
        showAlert('Error deleting group: ' + error, 'error');
    }
}

async function loadGroupTools() {
    const supervisorSelect = document.getElementById('groupSupervisor');
    const descriptionInput = document.getElementById('groupDescription');
    const internList = document.querySelector('[data-group-intern-list]');
    const groupsContainer = document.querySelector('[data-group-list]');
    if (!supervisorSelect || !internList || !groupsContainer) return;

    try {
        const [supervisors, allInterns, groups] = await Promise.all([
            getAllSupervisors(),
            getAllInterns(),
            getAllGroups()
        ]);

        supervisorSelect.innerHTML = `
            <option value="">No supervisor</option>
            ${supervisors.map(supervisor => (
                `<option value="${supervisor.id}">${escapeHTML(supervisor.firstName)} ${escapeHTML(supervisor.lastName)}</option>`
            )).join('')}
        `;

        if (descriptionInput) {
            descriptionInput.value = '';
        }

        const searchInputEl = document.getElementById('groupInternSearchInput');
        const searchTerm = searchInputEl ? searchInputEl.value.trim().toLowerCase() : '';

        const interns = allInterns.filter(intern => {
            if (!searchTerm) return true;
            const fullName = `${intern.firstName} ${intern.lastName}`.toLowerCase();
            const department = (intern.department || '').toLowerCase();
            return fullName.includes(searchTerm) || department.includes(searchTerm);
        });

        internList.innerHTML = interns.length === 0
            ? '<p class="text-muted">No interns available yet.</p>'
            : interns.map(intern => `
                <label class="group-intern-option">
                    <input type="checkbox" value="${intern.id}">
                    <span>
                        <strong>${escapeHTML(intern.firstName)} ${escapeHTML(intern.lastName)}</strong>
                        <small>${escapeHTML(intern.department)}${intern.supervisorName ? ` - ${escapeHTML(intern.supervisorName)}` : ''}</small>
                    </span>
                </label>
            `).join('');

        const supervisorMap = supervisors.reduce((map, supervisor) => {
            map[supervisor.id] = `${supervisor.firstName} ${supervisor.lastName}`;
            return map;
        }, {});
        const internMap = allInterns.reduce((map, intern) => {
            map[intern.id] = `${intern.firstName} ${intern.lastName}`;
            return map;
        }, {});

        groupsContainer.innerHTML = groups.length === 0
            ? `
                <div class="dashboard-empty-state compact">
                    <i class="fas fa-layer-group"></i>
                    <h3>No groups yet</h3>
                    <p>Create a group to organize interns.</p>
                </div>
            `
            : groups.map(group => {
                const groupInternIds = group.internIds || [];
                return `
                <div class="group-card">
                    <div>
                        <h4 class="group-card-title">${escapeHTML(group.name)}</h4>
                        <p class="group-card-supervisor">${escapeHTML(supervisorMap[group.supervisorId] || 'No supervisor assigned')}</p>
                        <p class="group-card-description">${escapeHTML(group.description || 'No description.')}</p>
                        <div class="group-card-meta">
                            <span>Created: ${escapeHTML(formatDashboardDate(group.dateAdded))}</span>
                            <span>Updated: ${escapeHTML(formatDashboardDate(group.updatedAt || group.dateAdded))}</span>
                        </div>            
                    </div>
                    <span class="role-badge user">${groupInternIds.length} intern${groupInternIds.length === 1 ? '' : 's'}</span>
                    <div class="group-members">
                        ${groupInternIds.map(internId => `<span>${escapeHTML(internMap[internId] || 'Unknown intern')}</span>`).join('')}
                    </div>
                    <div class="group-card-actions">
                        <button class="btn btn-edit-group" type="button" onclick="editGroup(${group.id})">
                            <i class="fas fa-pen"></i>
                            <span>Edit</span>
                        </button>
                        <button class="btn btn-delete-user" type="button" onclick="removeGroup(${group.id})">
                            <i class="fas fa-trash"></i>
                            <span>Delete</span>
                        </button>
                    </div>
                </div>
            `;
            }).join('');
    } catch (error) {
        showAlert('Error loading group tools: ' + error, 'error');
    }
}

async function editGroup(groupId) {
    try {
        const group = await getGroupById(groupId);
        if (!group) {
            showAlert('Group record was not found.', 'warning');
            return;
        }

        showSupervisorTab('groups');
        await loadGroupTools();

        editingGroupId = group.id;

        const nameInput = document.getElementById('groupName');
        const descriptionInput = document.getElementById('groupDescription');
        const supervisorSelect = document.getElementById('groupSupervisor');
        const internCheckboxes = document.querySelectorAll('[data-group-intern-list] input[type="checkbox"]');

        if (nameInput) nameInput.value = group.name || '';
        if (descriptionInput) descriptionInput.value = group.description || '';
        if (supervisorSelect) supervisorSelect.value = group.supervisorId || '';

        const groupInternIds = (group.internIds || []).map(Number);
        internCheckboxes.forEach(checkbox => {
            checkbox.checked = groupInternIds.includes(Number(checkbox.value));
        });

        const submitBtn = document.getElementById('groupFormSubmitBtn');
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-save"></i><span>Update Group</span>';
        }
        const cancelBtn = document.getElementById('groupFormCancelBtn');
        if (cancelBtn) cancelBtn.hidden = false;

        document.querySelector('.group-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
        showAlert('Error loading group for edit: ' + error, 'error');
    }
}

function cancelGroupEdit() {
    editingGroupId = null;

    const form = document.querySelector('.group-form');
    if (form) form.reset();

    const submitBtn = document.getElementById('groupFormSubmitBtn');
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-plus"></i><span>Create Group</span>';
    }
    const cancelBtn = document.getElementById('groupFormCancelBtn');
    if (cancelBtn) cancelBtn.hidden = true;
}

async function handleCreateGroupSubmit(event) {
    event.preventDefault();

    const name = document.getElementById('groupName')?.value.trim();
    const description = document.getElementById('groupDescription')?.value.trim();  
    const supervisorId = Number(document.getElementById('groupSupervisor')?.value) || '';
    const internIds = Array.from(document.querySelectorAll('[data-group-intern-list] input:checked'))
        .map(input => Number(input.value));

    if (!name) {
        showAlert('Group name is required.', 'warning');
        return;
    }
    if (internIds.length === 0) {
        showAlert('Select at least one intern for the group.', 'warning');
        return;
    }
    if (!supervisorId) {
        showAlert('Select a supervisor for the group.', 'warning');
        return;
    }
    
    if(!description) {
        showAlert('Group description is required.', 'warning');
        return;
    }

    if (internIds.length < 3 ) {
        showAlert('Select at least three interns for the group.', 'warning');
        return;
    }
    if (internIds.length > 5 ) {
        showAlert('Select at most five interns for the group.', 'warning');
        return;
    }


    try {
        const supervisors = await getAllSupervisors();
        const supervisor = supervisors.find(item => item.id === supervisorId);

        if (editingGroupId) {
            const existingGroup = await getGroupById(editingGroupId);
            if (!existingGroup) {
                showAlert('Group record was not found.', 'warning');
                editingGroupId = null;
                return;
            }

            const previousInternIds = existingGroup.internIds || [];
            const removedInternIds = previousInternIds.filter(id => !internIds.includes(id));

            await Promise.all(removedInternIds.map(async (internId) => {
                const intern = await getInternById(internId);
                if (!intern) return;
                await updateIntern({
                    ...intern,
                    supervisorId: null,
                    supervisorName: '',
                    groupName: '',
                    updatedAt: new Date().toISOString()
                });
            }));

            await updateGroup({
                ...existingGroup,
                name,
                description,
                supervisorId,
                internIds,
                updatedAt: new Date().toISOString()
            });

            if (supervisor) {
                await Promise.all(internIds.map(async (internId) => {
                    const intern = await getInternById(internId);
                    if (!intern) return;
                    await updateIntern({
                        ...intern,
                        supervisorId: supervisor.id,
                        supervisorName: `${supervisor.firstName} ${supervisor.lastName}`,
                        groupName: name,
                        updatedAt: new Date().toISOString()
                    });
                }));
            }

            cancelGroupEdit();
            showAlert('Group updated successfully.', 'success');
        } else {
            await addGroup({
                id: Date.now(),
                name,
                description,
                supervisorId,
                internIds,
                dateAdded: new Date().toISOString()
            });

            if (supervisor) {
                await Promise.all(internIds.map(async (internId) => {
                    const intern = await getInternById(internId);
                    if (!intern) return;
                    await updateIntern({
                        ...intern,
                        supervisorId: supervisor.id,
                        supervisorName: `${supervisor.firstName} ${supervisor.lastName}`,
                        groupName: name,
                        updatedAt: new Date().toISOString()
                    });
                }));
            }

            event.target.reset();
            showAlert('Group created successfully.', 'success');
        }

        await loadSupervisorsPage();
        await loadGroupTools();
    } catch (error) {
        showAlert('Error saving group: ' + error, 'error');
    }
}

function renderFeedbackCell(remarks) {
    const text = (remarks || '').trim();
    if (!text) return '-';

    const words = text.split(/\s+/);
    const preview = words.slice(0, 3).join(' ');
    const isTruncated = words.length > 3;

    if (!isTruncated) return escapeHTML(text);

    const previewLabel = `${escapeHTML(preview)}...`;
    const full = escapeHTML(text);

    // Pure CSS tooltip (no bootstrap.js dependency): the full text sits in
    // a hidden ::after-positioned bubble that only appears on hover/focus.
    return `<span class="feedback-preview" tabindex="0" data-tooltip="${full}">${previewLabel}</span>`;
}

function getPerformanceScoreClass(score) {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    return 'needs-work';
}

async function loadPerformancePage() {
    const tableContainer = document.querySelector('[data-performance-table]');
    if (!tableContainer) return;

    try {
        const allInterns = await getAllInterns();
        const allPerformance = await getAllPerformance();
        const performanceMap = {};

        allPerformance.forEach(record => {
            const currentRecord = performanceMap[record.internId];
            if (!currentRecord || new Date(record.updatedAt || record.createdAt) > new Date(currentRecord.updatedAt || currentRecord.createdAt)) {
                performanceMap[record.internId] = record;
            }
        });

        const reviewedRecords = Object.values(performanceMap);
        const averageScore = reviewedRecords.length
            ? Math.round(reviewedRecords.reduce((total, record) => total + Number(record.score || 0), 0) / reviewedRecords.length)
            : 0;

        const ratingFilterEl = document.getElementById('performanceRatingFilter');
        const searchInputEl = document.getElementById('performanceSearchInput');
        const ratingFilter = ratingFilterEl ? ratingFilterEl.value : 'all';
        const searchTerm = searchInputEl ? searchInputEl.value.trim().toLowerCase() : '';

        const filteredInterns = allInterns.filter(intern => {
            const performance = performanceMap[intern.id];
            const rating = performance?.rating || 'Not reviewed';
            const matchesRating = ratingFilter === 'all' || rating === ratingFilter;
            const fullName = `${intern.firstName} ${intern.lastName}`.toLowerCase();
            const matchesSearch = !searchTerm ||
                fullName.includes(searchTerm) ||
                (intern.department || '').toLowerCase().includes(searchTerm);
            return matchesRating && matchesSearch;
        });

        const totalElement = document.getElementById('performanceTotalInterns');
        const reviewedElement = document.getElementById('performanceReviewed');
        const averageElement = document.getElementById('performanceAverage');

        if (totalElement) totalElement.textContent = allInterns.length;
        if (reviewedElement) reviewedElement.textContent = reviewedRecords.length;
        if (averageElement) averageElement.textContent = averageScore;

        if (allInterns.length === 0) {
            tableContainer.innerHTML = `
                <div class="dashboard-empty-state">
                    <i class="fas fa-chart-line"></i>
                    <h3>No interns to review</h3>
                    <p>Add interns from the User tab before creating performance records.</p>
                </div>
            `;
            return;
        }

        if (filteredInterns.length === 0) {
            tableContainer.innerHTML = `
                <div class="dashboard-empty-state">
                    <i class="fas fa-chart-line"></i>
                    <h3>No matching performance records</h3>
                    <p>Try a different rating filter or search term.</p>
                </div>
            `;
            return;
        }

        const rowsHTML = filteredInterns.map(intern => {
            const performance = performanceMap[intern.id];
            const score = Number(performance?.score || 0);
            const scoreLabel = performance ? `${score}%` : 'Pending';
            const checkboxDisabled = performance ? '' : 'disabled title="No performance review to delete yet"';

            return `
                <tr>
                    <td><input type="checkbox" class="form-check-input performance-select" value="${intern.id}" ${checkboxDisabled}></td>
                    <td>
                        <div class="dashboard-user-cell">
                            <span class="dashboard-avatar">${escapeHTML(getUserInitials(intern.firstName, intern.lastName))}</span>
                            <div class="fw-bold">${escapeHTML(intern.firstName)} ${escapeHTML(intern.lastName)}</div>
                        </div>
                    </td>
                    <td>${escapeHTML(intern.department)}</td>
                    <td>
                        <span class="performance-score ${performance ? getPerformanceScoreClass(score) : 'pending'}">${escapeHTML(scoreLabel)}</span>
                    </td>
                    <td>${escapeHTML(performance?.rating || 'Not reviewed')}</td>
                    <td>${renderFeedbackCell(performance?.remarks)}</td>
                    <td>${escapeHTML(formatDashboardDate(performance?.updatedAt || performance?.createdAt))}</td>
                    <td>
                        <div class="table-actions">
                            <button class=btn btn-light" type="button" title="View details" onclick="viewPerformanceDetails(${intern.id})"><i class="fas fa-eye"></i></button>
                            <button class="btn btn-light" type="button" title="Update performance" onclick="editPerformance(${intern.id})"><i class="fas fa-pen"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        tableContainer.innerHTML = `
            <table class="table table-hover dashboard-user-table">
                <thead class="table-light">
                    <tr>
                        <th style="width: 5%"><input type="checkbox" class="form-check-input"></th>
                        <th>Intern</th>
                        <th>Department</th>
                        <th>Score</th>
                        <th>Rating</th>
                        <th>Feedback</th>
                        <th>Last Review</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHTML}
                </tbody>
            </table>
        `;
        bindPerformanceSelectionControls();
    } catch (error) {
        console.error('Error loading performance page:', error);
        showAlert('Error loading performance records: ' + error, 'error');
    }
}

function applyPerformanceFilters() {
    loadPerformancePage();
}

async function viewPerformanceDetails(internId) {
    try {
        const intern = await getInternById(internId);
        if (!intern) {
            showAlert('Intern record was not found.', 'warning');
            return;
        }

        const existingRecords = await getPerformanceByInternId(internId);
        const performance = existingRecords[existingRecords.length - 1];

        showDetailsModal({
            title: 'Performance Details',
            rows: [
                { label: 'Name', value: `${intern.firstName} ${intern.lastName}` },
                { label: 'Department', value: intern.department },
                { label: 'Score', value: performance ? `${performance.score}%` : 'Pending' },
                { label: 'Rating', value: performance?.rating || 'Not reviewed' },
                { label: 'Feedback', value: performance?.remarks || 'No feedback yet' },
                { label: 'Last Review', value: formatDashboardDate(performance?.updatedAt || performance?.createdAt) },

            ]
        });
    } catch (error) {
        showAlert('Error loading performance details: ' + error, 'error');
    }
}

async function editPerformance(internId) {
    try {
        const intern = await getInternById(internId);
        const existingRecords = await getPerformanceByInternId(internId);
        const performanceRecord = existingRecords[existingRecords.length - 1] || {
            id: Date.now(),
            internId,
            internName: intern ? `${intern.firstName} ${intern.lastName}` : '',
            department: intern?.department || '',
            createdAt: new Date().toISOString()
        };

        const MAX_TYPE_SCORE = 25;
        const PERFORMANCE_TYPES = [
            { key: 'teamWork', label: 'Team Work' },
            { key: 'punctuality', label: 'Punctuality' },
            { key: 'individualEfforts', label: 'Individual Efforts' },
            { key: 'behavior', label: 'Behavior' }
        ];

        const values = await showCustomModal({
            title: 'Update Performance',
            message: intern ? `${intern.firstName} ${intern.lastName}` : 'Intern performance review',
            confirmText: 'Save Review',
            fields: [
                ...PERFORMANCE_TYPES.map(type => ({
                    label: `${type.label} (max ${MAX_TYPE_SCORE})`,
                    name: type.key,
                    value: performanceRecord[type.key] ?? '',
                    placeholder: `0 - ${MAX_TYPE_SCORE}`
                })),
                {
                    label: 'Rating',
                    name: 'rating',
                    type: 'select',
                    value: performanceRecord.rating || 'Good',
                    options: ['Excellent', 'Good', 'Average', 'Needs Improvement']
                },
                {
                    label: 'Feedback',
                    name: 'remarks',
                    value: performanceRecord.remarks || '',
                    placeholder: 'Short review note'
                }
            ]
        });

        if (!values) return;

        const typeScores = {};
        for (const type of PERFORMANCE_TYPES) {
            const typeScore = Number(values[type.key]);
            if (!Number.isFinite(typeScore) || typeScore < 0 || typeScore > MAX_TYPE_SCORE) {
                showAlert(`${type.label} score must be between 0 and ${MAX_TYPE_SCORE}.`, 'warning');
                return;
            }
            typeScores[type.key] = typeScore;
        }

        // Each type is capped at 25, so the four together add up to a 0-100 overall score.
        const score = Math.round(
            PERFORMANCE_TYPES.reduce((total, type) => total + typeScores[type.key], 0)
        );

        const recordToSave = {
            ...performanceRecord,
            internId,
            internName: intern ? `${intern.firstName} ${intern.lastName}` : performanceRecord.internName,
            department: intern?.department || performanceRecord.department,
            ...typeScores,
            score,
            rating: values.rating,
            remarks: (values.remarks) || '',
            updatedAt: new Date().toISOString()
        };

        if (existingRecords.length > 0) {
            await updatePerformance(recordToSave);
        } else {
            await addPerformance(recordToSave);
        }

        showAlert('Performance review saved successfully.', 'success');
        await loadPerformancePage();
    } catch (error) {
        showAlert('Error saving performance review: ' + error, 'error');
    }
}

async function loadSettingsPage() {
    const settingsForm = document.querySelector('.settings-form');
    if (!settingsForm) return;

    try {
        const [interns, supervisors, attendance] = await Promise.all([
            getAllInterns(),
            getAllSupervisors(),
            getAllAttendance()
        ]);

        const internCount = document.getElementById('settingsInternCount');
        const supervisorCount = document.getElementById('settingsSupervisorCount');
        const attendanceCount = document.getElementById('settingsAttendanceCount');

        if (internCount) internCount.textContent = interns.length;
        if (supervisorCount) supervisorCount.textContent = supervisors.length;
        if (attendanceCount) attendanceCount.textContent = attendance.length;

        document.getElementById('settingsWorkspaceName').value = await getSetting('workspaceName') || 'InternFlow';
        document.getElementById('settingsAdminEmail').value = await getSetting('adminEmail') || DEFAULT_ADMIN_EMAIL;
    } catch (error) {
        console.error('Error loading settings page:', error);
        showAlert('Error loading settings: ' + error, 'error');
    }
}

async function saveSettingsForm(event) {
    event.preventDefault();

    const workspaceName = document.getElementById('settingsWorkspaceName')?.value.trim();
    const adminEmail = document.getElementById('settingsAdminEmail')?.value.trim();

    if (!workspaceName || !adminEmail) {
        showAlert('Please complete all settings fields.', 'warning');
        return;
    }

    try {
        await Promise.all([
            saveSetting('workspaceName', workspaceName),
            saveSetting('adminEmail', adminEmail)
        ]);
        await syncHeaderAdminEmail();
        showAlert('Settings saved successfully.', 'success');
    } catch (error) {
        showAlert('Error saving settings: ' + error, 'error');
    }
}

// Attendance window used to auto-determine status from the exact check-in time:
//   before 7:00 AM        -> Present
//   7:00 AM - 1:24 PM     -> Late
//   1:25 PM onward        -> Absent
function determineAttendanceStatus(date) {
    const totalMinutes = date.getHours() * 60 + date.getMinutes();
    const presentCutoff = 7 * 60;        // 7:00 AM
    const absentCutoff = 16 * 60 + 30;   // 1:25 PM

    if (totalMinutes < presentCutoff) {
        return 'Present';
    } else if (totalMinutes < absentCutoff) {
        return 'Late';
    }
    return 'Absent';
}

// Check-in/out is disabled from 5:00 PM onward.
function isAttendanceWindowClosed(date = new Date()) {
    return date.getHours() >= 17;
}

function formatExactTime(date = new Date()) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

async function checkInAttendance(internId) {
    try {
        const now = new Date();
        if (isAttendanceWindowClosed(now)) {
            showAlert('Check-in is disabled after 5:00 PM.', 'warning');
            return;
        }

        const today = getLocalDateString(now);
        const intern = await getInternById(internId);
        const existingRecords = await getAttendanceByInternId(internId);
        const existingRecord = existingRecords.find(record => record.date === today);

        if (existingRecord && existingRecord.checkInTime) {
            showAlert('This intern has already checked in today.', 'warning');
            return;
        }

        const checkInTime = formatExactTime(now);
        // If an admin already excused this intern for today (e.g. a pre-approved
        // doctor's appointment), a late check-in shouldn't silently overwrite
        // that with "Late"/"Absent" again — keep the excused status and just
        // record the real check-in time for reference.
        const status = (existingRecord && existingRecord.status === 'Excused')
            ? 'Excused'
            : determineAttendanceStatus(now);

        const recordToSave = {
            ...(existingRecord || {
                id: Date.now(),
                internId: internId,
                internName: intern ? `${intern.firstName} ${intern.lastName}` : '',
                internId_code: intern ? intern.internId : '',
                email: intern ? intern.email : '',
                department: intern ? intern.department : '',
                date: today,
                checkOutTime: null,
                createdAt: new Date().toISOString()
            }),
            checkInTime,
            status,
            statusLockedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (existingRecord) {
            await dbPut('attendance', recordToSave);
        } else {
            await addAttendance(recordToSave);
        }

        showAlert(`Checked in at ${checkInTime} — marked ${status}.`, 'success', 4000);
        await loadAttendanceStatistics();
        await loadAttendanceTable();
    } catch (error) {
        showAlert('Error checking in: ' + error, 'error');
    }
}

async function checkOutAttendance(internId) {
    try {
        const now = new Date();
        if (isAttendanceWindowClosed(now)) {
            showAlert('Check-out is disabled after 5:00 PM.', 'warning');
            return;
        }

        const today = getLocalDateString(now);
        const existingRecords = await getAttendanceByInternId(internId);
        const existingRecord = existingRecords.find(record => record.date === today);

        if (!existingRecord || !existingRecord.checkInTime) {
            showAlert('This intern must check in before checking out.', 'warning');
            return;
        }
        if (existingRecord.checkOutTime) {
            showAlert('This intern has already checked out today.', 'warning');
            return;
        }

        const checkOutTime = formatExactTime(now);

        await dbPut('attendance', {
            ...existingRecord,
            checkOutTime,
            updatedAt: new Date().toISOString()
        });

        showAlert(`Checked out at ${checkOutTime}.`, 'success', 4000);
        await loadAttendanceStatistics();
        await loadAttendanceTable();
    } catch (error) {
        showAlert('Error checking out: ' + error, 'error');
    }
}

async function recordTemporaryPermission(internId) {
    try {
        const intern = await getInternById(internId);
        if (!intern) {
            showAlert('Intern record was not found.', 'warning');
            return;
        }

        const today = getLocalDateString();
        const existingRecords = await getAttendanceByInternId(internId);
        const existingRecord = existingRecords.find(record => record.date === today);

        const values = await showCustomModal({
            title: 'Temporary Permission',
            message: `${intern.firstName} ${intern.lastName}`,
            confirmText: 'Save Permission',
            fields: [
                {
                    name: 'reason',
                    label: 'Reason',
                    value: existingRecord?.permissionReason || '',
                    placeholder: 'e.g. Bank errand, medical appointment'
                },
                {
                    name: 'date',
                    label: 'Permission date',
                    type: 'date',
                    value: existingRecord?.permissionDate || today
                },
                {
                    name: 'fromTime',
                    label: 'Departure time',
                    type: 'time',
                    value: existingRecord?.permissionFromTime || ''
                },
                {
                    name: 'toTime',
                    label: 'Expected return time',
                    type: 'time',
                    value: existingRecord?.permissionToTime || ''
                }
            ]
        });

        if (!values) return;

        const reason = (values.reason || '').trim();
        const permissionDate = values.date || today;
        const fromTime = values.fromTime || '';
        const toTime = values.toTime || '';

        if (!reason || !permissionDate || !fromTime || !toTime) {
            showAlert('Please provide the permission reason, date, departure time, and return time.', 'warning');
            return;
        }

        if (fromTime >= toTime) {
            showAlert('Expected return time must be after the departure time.', 'warning');
            return;
        }

        const recordToSave = {
            ...(existingRecord || {
                id: Date.now(),
                internId,
                internName: `${intern.firstName} ${intern.lastName}`,
                internId_code: intern.internId || '',
                email: intern.email || '',
                department: intern.department || '',
                date: today,
                checkInTime: null,
                checkOutTime: null,
                status: '-',
                createdAt: new Date().toISOString()
            }),
            permissionReason: reason,
            permissionDate,
            permissionFromTime: fromTime,
            permissionToTime: toTime,
            permissionRecordedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (existingRecord) {
            await dbPut('attendance', recordToSave);
        } else {
            await addAttendance(recordToSave);
        }

        showAlert('Temporary permission recorded successfully.', 'success');
        await loadAttendanceTable();
    } catch (error) {
        showAlert('Error recording permission: ' + error, 'error');
    }
}

/*
  EXCUSED ATTENDANCE
  Auto-computed status (Present/Late/Absent) has no way to account for a
  legitimate reason — a doctor's appointment, a supervisor-approved errand,
  etc. This lets an admin override today's record with "Excused" plus a
  required reason, without deleting the original clock-based status: it's
  kept as originalStatus so nothing is lost, and the record can be reverted.
  Works whether the intern has already checked in (Late/Absent) or hasn't
  checked in at all yet (a pre-approved absence, status still '-').
*/
async function excuseAttendance(internId) {
    try {
        const intern = await getInternById(internId);
        const today = getLocalDateString();
        const existingRecords = await getAttendanceByInternId(internId);
        const existingRecord = existingRecords.find(record => record.date === today);

        if (existingRecord && existingRecord.status === 'Excused') {
            showAlert('This intern is already marked as excused for today.', 'info', 3000);
            return;
        }

        const currentStatus = existingRecord && existingRecord.status && existingRecord.status !== '-'
            ? existingRecord.status
            : 'Absent';

        const result = await showCustomModal({
            title: 'Mark as Excused',
            message: `${intern ? intern.firstName + ' ' + intern.lastName : 'This intern'} is currently "${currentStatus}" for today. Record why this is excused (e.g. doctor's appointment, supervisor-approved errand) — this note is kept with the record.`,
            fields: [
                { name: 'reason', label: 'Reason', placeholder: "e.g. Doctor's appointment, approved by supervisor" }
            ],
            confirmText: 'Mark Excused'
        });

        if (!result) return; // cancelled

        const reason = (result.reason || '').trim();
        if (!reason) {
            showAlert('Please provide a reason before marking as excused.', 'warning');
            return;
        }

        const recordToSave = {
            ...(existingRecord || {
                id: Date.now(),
                internId,
                internName: intern ? `${intern.firstName} ${intern.lastName}` : '',
                internId_code: intern ? intern.internId : '',
                email: intern ? intern.email : '',
                department: intern ? intern.department : '',
                date: today,
                checkInTime: null,
                checkOutTime: null,
                createdAt: new Date().toISOString()
            }),
            originalStatus: currentStatus,
            status: 'Excused',
            excuseReason: reason,
            excusedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (existingRecord) {
            await dbPut('attendance', recordToSave);
        } else {
            await addAttendance(recordToSave);
        }

        showAlert(`Marked as Excused: ${reason}`, 'success', 4000);
        await loadAttendanceStatistics();
        await loadAttendanceTable();
    } catch (error) {
        showAlert('Error marking attendance as excused: ' + error, 'error');
    }
}

// Undo an excused mark, restoring whatever status was in effect before it
// (Late/Absent/Present), in case an admin applied it by mistake.
async function revertExcuse(internId) {
    try {
        const today = getLocalDateString();
        const existingRecords = await getAttendanceByInternId(internId);
        const existingRecord = existingRecords.find(record => record.date === today);

        if (!existingRecord || existingRecord.status !== 'Excused') return;

        const confirmed = await showCustomConfirm(
            'Remove the excused mark and restore the original attendance status for today?',
            { title: 'Remove Excuse', confirmText: 'Remove' }
        );
        if (!confirmed) return;

        await dbPut('attendance', {
            ...existingRecord,
            status: existingRecord.originalStatus || 'Absent',
            excuseReason: null,
            excusedAt: null,
            updatedAt: new Date().toISOString()
        });

        showAlert('Excused status removed.', 'success', 3000);
        await loadAttendanceStatistics();
        await loadAttendanceTable();
    } catch (error) {
        showAlert('Error removing excused status: ' + error, 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!requireLogin()) return;

    initDatabase().then(() => {
        console.log('Database initialized and ready to use');
        
        const attendanceElement = document.getElementById('totalInterns');
        if (attendanceElement) {
            finalizeAndPrepareAttendanceForToday().then(() => {
                loadAttendanceStatistics();
                loadAttendanceTable();
            });

            const attendanceStatusFilter = document.getElementById('attendanceStatusFilter');
            if (attendanceStatusFilter) {
                attendanceStatusFilter.addEventListener('change', applyAttendanceFilters);
            }
            const attendanceSearchInput = document.getElementById('attendanceSearchInput');
            if (attendanceSearchInput) {
                attendanceSearchInput.addEventListener('input', applyAttendanceFilters);
                attendanceSearchInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        applyAttendanceFilters();
                    }
                });
            }

            setInterval(() => {
                loadAttendanceTable();
            }, 30000);
        }

        const dashboardTable = document.querySelector('[data-user-table]');
        if (dashboardTable) {
            loadDashboardUsers();

            const internSearchInput = document.getElementById('internSearchInput');
            if (internSearchInput) {
                internSearchInput.addEventListener('input', applyInternsFilter);
                internSearchInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        applyInternsFilter();
                    }
                });
            }
        }

        const supervisorTable = document.querySelector('[data-supervisor-table]');
        if (supervisorTable) {
            loadSupervisorsPage();
            loadGroupTools();

            const supervisorSearchInput = document.getElementById('supervisorSearchInput');
            if (supervisorSearchInput) {
                supervisorSearchInput.addEventListener('input', applySupervisorsFilter);
                supervisorSearchInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        applySupervisorsFilter();
                    }
                });
            }

            const groupInternSearchInput = document.getElementById('groupInternSearchInput');
            if (groupInternSearchInput) {
                groupInternSearchInput.addEventListener('input', applyGroupInternFilters);
                groupInternSearchInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        applyGroupInternFilters();
                    }
                });
            }
        }

        const performanceTable = document.querySelector('[data-performance-table]');
        if (performanceTable) {
            loadPerformancePage();

            const performanceRatingFilter = document.getElementById('performanceRatingFilter');
            if (performanceRatingFilter) {
                performanceRatingFilter.addEventListener('change', applyPerformanceFilters);
            }
            const performanceSearchInput = document.getElementById('performanceSearchInput');
            if (performanceSearchInput) {
                performanceSearchInput.addEventListener('input', applyPerformanceFilters);
                performanceSearchInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        applyPerformanceFilters();
                    }
                });
            }
        }

        const settingsForm = document.querySelector('.settings-form');
        if (settingsForm) {
            loadSettingsPage();
        }

        syncHeaderAdminEmail();

        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            initLoginPage();
        }
    }).catch(error => {
        console.error('Failed to initialize database:', error);
        showAlert('Could not open the local database: ' + (error?.message || error), 'error', 6000);
    });
});

const ADMIN_SESSION_KEY = 'internflow_admin_logged_in';
const DEFAULT_ADMIN_EMAIL = 'TeamAstro@gmail.com';

async function syncHeaderAdminEmail() {
    const headerEmailEl = document.getElementById('headerAdminEmail');
    if (!headerEmailEl) return;

    try {
        headerEmailEl.textContent = (await getSetting('adminEmail')) || DEFAULT_ADMIN_EMAIL;
    } catch (error) {
        console.error('Could not load admin email for header:', error);
    }
}

function isAdminLoggedIn(){
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === "true" ||
           localStorage.getItem(ADMIN_SESSION_KEY) === "true";
}

function requireLogin(){
    if (document.getElementById('loginForm')) return true;
    if(!isAdminLoggedIn()){
        window.location.href= 'login.html';
        return false;
    }
    return true;
}

function initLoginPage(){
    const form = document.getElementById('loginForm');
    if (!form) return;

    if (isAdminLoggedIn()) {
        window.location.href = 'interns.html';
        return;
    }

    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const errorEl = document.getElementById('loginError');
    const rememberInput = document.getElementById('rememberLogin');
    const toggleBtn = document.getElementById('togglePassword');

    if (toggleBtn && passwordInput) {
        toggleBtn.addEventListener('click', () => {
            passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
            const icon = toggleBtn.querySelector('i');
            icon?.classList.toggle('fa-eye');
            icon?.classList.toggle('fa-eye-slash');
        });
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (errorEl) errorEl.textContent = '';

        const email = emailInput?.value.trim();
        const password = passwordInput?.value;

        if (!email || !password) {
            if (errorEl) errorEl.textContent = 'Please enter both your email and password.';
            return;
        }

        let adminEmail = DEFAULT_ADMIN_EMAIL;
        try {
            adminEmail = (await getSetting('adminEmail')) || adminEmail;
        } catch (error) {
            console.error('Could not read saved admin email, using default:', error);
        }
        const DEMO_ADMIN_PASSWORD = 'TeamAstro1234';

        if (email.toLowerCase() !== adminEmail.toLowerCase() || password !== DEMO_ADMIN_PASSWORD) {
            if (errorEl) errorEl.textContent = 'Incorrect email or password.';
            return;
        }

        const storage = rememberInput?.checked ? localStorage : sessionStorage;
        storage.setItem(ADMIN_SESSION_KEY, 'true');
        window.location.href = 'interns.html';
    });
} 

function logoutAdmin() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    localStorage.removeItem(ADMIN_SESSION_KEY);
    window.location.href = 'login.html';
}

const dropdownElementList = document.querySelectorAll('.dropdown-toggle')
const dropdownList = [...dropdownElementList].map(dropdownToggleEl => new bootstrap.Dropdown(dropdownToggleEl))
