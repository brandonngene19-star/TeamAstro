let db;
let editingGroupId = null;
const DB_NAME = 'InternFlowDB';
const DB_VERSION = 7;

const NAME_REGEX = /^[a-zA-Z\s]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidPhone(phone) {
    return /^\d{10,}$/.test(String(phone).replace(/[\s\-()]/g, ''));
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

            return `
                <label class="custom-modal-field">
                    <span>${escapeHTML(field.label)}</span>
                    <input name="${escapeHTML(field.name)}" type="text" value="${escapeHTML(field.value || '')}" placeholder="${escapeHTML(field.placeholder || '')}" ${lockedAttribute}>
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

function getAttendanceById(id) {
    return dbGet('attendance', id);
}

async function updateAttendance(record) {
    const existingRecord = await getAttendanceById(record.id);
    if (existingRecord?.statusLockedAt && existingRecord.status !== record.status) {
        throw new Error('Attendance status has already been set and cannot be modified.');
    }

    if (existingRecord?.checkInTime && existingRecord.checkInTime !== record.checkInTime) {
        throw new Error('Check-in time has already been set and cannot be modified.');
    }

    if (existingRecord?.checkOutTime && existingRecord.checkOutTime !== record.checkOutTime) {
        throw new Error('Check-out time has already been set and cannot be modified.');
    }

    const recordToSave = {
        ...record,
        statusLockedAt: existingRecord?.statusLockedAt || record.statusLockedAt || new Date().toISOString()
    };

    return dbPut('attendance', recordToSave);
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
                data = await getAllAttendance();
            } else if (storeName === 'performance') {
                data = await getAllPerformance();
            }

            if (data.length === 0) {
                reject('No data to export');
                return;
            }

            const keys = Object.keys(data[0]);
            let csv = keys.map(escapeCSVValue).join(',') + '\n';

            data.forEach(item => {
                const values = keys.map(key => escapeCSVValue(item[key]));
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

function handleFormSubmit(event, formType) {
    event.preventDefault();

    if (formType === 'intern') {
        const firstName = document.getElementById('validationCustom01')?.value.trim();
        const lastName = document.getElementById('validationCustom02')?.value.trim();
        const email = document.getElementById('validationCustomUsername')?.value.trim();
        const phone = document.getElementById('validationCustom03')?.value.trim();
        const school = document.getElementById('validationCustom06')?.value.trim();
        const department = document.getElementById('validationCustom04')?.value;
        const gender = document.getElementById('validationCustom05')?.value;

        if (!firstName) {
            showAlert('First name is required!', 'warning');
            return;
        }
        if (!lastName) {
            showAlert('Last name is required!', 'warning');
            return;
        }
        if (!email) {
            showAlert('Email is required!', 'warning');
            return;
        }
        if (!phone) {
            showAlert('Phone number is required!', 'warning');
            return;
        }
        if (!school) {
            showAlert('School is required!', 'warning');
            return;
        }
        if (!department || department === '') {
            showAlert('Department is required!', 'warning');
            return;
        }
        if (!gender || gender === '') {
            showAlert('Gender is required!', 'warning');
            return;
        }

        if (!NAME_REGEX.test(firstName)) {
            showAlert('First name can only contain letters and spaces. No numbers or special characters allowed.', 'error');
            return;
        }
        if (!NAME_REGEX.test(lastName)) {
            showAlert('Last name can only contain letters and spaces. No numbers or special characters allowed.', 'error');
            return;
        }

        if (!EMAIL_REGEX.test(email)) {
            showAlert('Please enter a valid email address.', 'error');
            return;
        }

        if (!isValidPhone(phone)) {
            showAlert('Please enter a valid phone number (at least 10 digits).', 'error');
            return;
        }

        emailExistsInStore('interns', email).then((exists) => {
            if (exists) {
                showAlert('An intern with this email is already registered.', 'warning');
                return;
            }

            const intern = {
                id: Date.now(),
                firstName: firstName,
                lastName: lastName,
                email: email,
                phone: phone,
                school: school,
                department: department,
                gender: gender,
                internId: generateInternID(),
                dateAdded: new Date().toISOString()
            };

            addIntern(intern).then((internData) => {
                createAttendanceRecordForNewIntern(intern);
                showAlert('Intern registered successfully.', 'success');
                event.target.reset();
                if (document.getElementById('addUserModal')) {
                    closeAddUserModal();
                }
                loadDashboardUsers();
            }).catch(error => {
                showAlert('Error registering intern: ' + (error?.message || error), 'error');
            });
        }).catch(error => {
            showAlert('Error checking existing records: ' + (error?.message || error), 'error');
        });
    } else if (formType === 'supervisor') {
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
        if (gender === '') {
            showAlert('Gender is required!', 'warning');
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
            showAlert('Please enter a valid phone number (at least 10 digits).', 'error');
            return;
        }

        emailExistsInStore('supervisors', email).then((exists) => {
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
                dateAdded: new Date().toISOString()
            };

            addSupervisor(supervisor).then(() => {
                showAlert('Supervisor registered successfully.', 'success');
                event.target.reset();
                if (document.getElementById('supervisorModal')) {
                    closeSupervisorModal();
                }
                loadSupervisorsPage();
            }).catch(error => {
                showAlert('Error registering supervisor: ' + (error?.message || error), 'error');
            });
        }).catch(error => {
            showAlert('Error checking existing records: ' + (error?.message || error), 'error');
        });
    }
}

function parseTimeToMinutes(timeStr) {
    const match = /^(\d{1,2}):([0-5]\d)\s?(AM|PM)$/i.exec(String(timeStr).trim());
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const meridiem = match[3].toUpperCase();

    if (hours < 1 || hours > 12) return null;

    if (meridiem === 'AM') {
        if (hours === 12) hours = 0;
    } else if (hours !== 12) {
        hours += 12;
    }

    return hours * 60 + minutes;
}

function generateInternID() {
    const year = new Date().getFullYear();
    const randomNum = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    return `INT-${year}-${randomNum}`;
}

function createAttendanceRecordForNewIntern(intern) {
    const today = new Date().toISOString().split('T')[0];
    
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
        status: 'Absent',
        remarks: '',
        createdAt: new Date().toISOString()
    };
    
    addAttendance(attendanceRecord).then(() => {
        console.log('✅ Attendance record created for:', intern.firstName, intern.lastName);
        showAlert(`Attendance record created for ${intern.firstName} ${intern.lastName}`, 'success', 3000);
    }).catch(error => {
        console.error('❌ Error creating attendance record:', error);
    });
}

async function loadAttendanceStatistics() {
    const today = new Date().toISOString().split('T')[0];
    
    try {
        const allInterns = await getAllInterns();
        const allAttendance = await getAllAttendance();
        const todayAttendance = allAttendance.filter(a => a.date === today);
        
        const totalCount = allInterns.length;
        const presentCount = todayAttendance.filter(a => a.status === 'Present').length;
        const lateCount = todayAttendance.filter(a => a.status === 'Late').length;
        const absentCount = todayAttendance.filter(a => a.status === 'Absent').length;
        
        const totalElement = document.getElementById('totalInterns');
        if (totalElement) totalElement.textContent = totalCount;
        
        const presentElement = document.getElementById('presentToday');
        if (presentElement) presentElement.textContent = presentCount;
        
        const lateElement = document.getElementById('lateToday');
        if (lateElement) lateElement.textContent = lateCount;
        
        const absentElement = document.getElementById('absentToday');
        if (absentElement) absentElement.textContent = absentCount;
        
        console.log(`📊 Attendance Stats - Total: ${totalCount}, Present: ${presentCount}, Late: ${lateCount}, Absent: ${absentCount}`);
    } catch (error) {
        console.error('❌ Error loading attendance statistics:', error);
    }
}

async function loadAttendanceTable() {
    const today = new Date().toISOString().split('T')[0];
    
    try {
        const allInterns = await getAllInterns();
        const allAttendance = await getAllAttendance();
        
        const attendanceMap = {};
        allAttendance.forEach(record => {
            attendanceMap[record.internId] = record;
        });

        const statusFilterEl = document.getElementById('attendanceStatusFilter');
        const searchInputEl = document.getElementById('attendanceSearchInput');
        const statusFilter = statusFilterEl ? statusFilterEl.value : 'all';
        const searchTerm = searchInputEl ? searchInputEl.value.trim().toLowerCase() : '';

        const filteredInterns = allInterns.filter(intern => {
            const attendance = attendanceMap[intern.id] || { status: 'Absent' };
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
                        <th style="width: 15%">Intern</th>
                        <th style="width: 15%">Department</th>
                        <th style="width: 12%">Check In</th>
                        <th style="width: 12%">Check Out</th>
                        <th style="width: 10%">Status</th>
                        <th style="width: 15%">Remarks</th>
                        <th style="width: 4%">Action</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        filteredInterns.forEach(intern => {
            const attendance = attendanceMap[intern.id] || {
                checkInTime: '-',
                checkOutTime: '-',
                status: 'Absent',
                remarks: ''
            };
            
            const statusColor = attendance.status === 'Present' ? 'success' : 
                                attendance.status === 'Late' ? 'warning' : 'danger';
            
            const statusLockIcon = attendance.statusLockedAt ? '<i class="fas fa-lock status-lock-icon" title="Status locked"></i>' : '';

            const statusBadge = `<span class="badge bg-${statusColor} status-badge">${attendance.status}${statusLockIcon}</span>`;
            
            tableHTML += `
                <tr>
                    <td><input type="checkbox" class="form-check-input intern-select" value="${intern.id}"></td>
                    <td>
                        <div class="d-flex align-items-center">
                            <span class="dashboard-avatar me-2">${escapeHTML(getUserInitials(intern.firstName, intern.lastName))}</span>
                            <div>
                                <div class="fw-bold">${intern.firstName} ${intern.lastName}</div>
                                <small class="text-muted">${intern.email}</small>
                            </div>
                        </div>
                    </td>
                    <td>${intern.department}</td>
                    <td><span class="badge bg-success">${attendance.checkInTime || '-'}</span></td>
                    <td><span class="badge bg-info">${attendance.checkOutTime || '-'}</span></td>
                    <td>${statusBadge}</td>
                    <td><small>${attendance.remarks || '-'}</small></td>
                    <td><button class="btn btn-sm btn-primary" onclick="editAttendance(${intern.id})"><i class="fas fa-edit"></i></button></td>
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

async function loadDashboardUsers() {
    const tableContainer = document.querySelector('[data-user-table]');
    if (!tableContainer) return;

    try {
        const allInterns = (await getAllInterns()).sort((a, b) => b.id - a.id);
        const today = new Date().toISOString().split('T')[0];
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

        const rowsHTML = allInterns.map(intern => `
            <tr>
                <td>
                    <div class="dashboard-user-cell">
                        <span class="dashboard-avatar">${escapeHTML(getUserInitials(intern.firstName, intern.lastName))}</span>
                        <div>
                            <div class="fw-bold">${escapeHTML(intern.firstName)} ${escapeHTML(intern.lastName)}</div>
                            <small class="text-muted">${escapeHTML(intern.email)}</small>
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
                        <button class="btn btn-sm btn-primary" type="button" title="Update intern" onclick="editIntern(${intern.id})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn btn-sm btn-assign" type="button" title="Assign supervisor" onclick="assignInternSupervisor(${intern.id})">
                            <i class="fas fa-user-tie"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" type="button" title="Delete intern" onclick="removeIntern(${intern.id})">
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
                        <th>User</th>
                        <th>Department</th>
                        <th>School</th>
                        <th>Phone</th>
                        <th>Gender</th>
                        <th>Supervisor</th>
                        <th>Date Added</th>
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
                { label: 'Phone', name: 'phone', value: intern.phone || '' },
                { label: 'School', name: 'school', value: intern.school || '' },
                {
                    label: 'Department',
                    name: 'department',
                    type: 'select',
                    value: intern.department || 'Software Engineering',
                    options: ['SOFTWWARE ENGINEERING','COMPUTER SCIENCE AND NETWORKS','QUALITY ASSURANCE','ACCOUNTING','DRIVING SCHOOL','FABRIC OFFICE','GRAPHICS AND PRINTING','BINDING','MOUNTING','EDITING','MARKETING','SCREEN PRINTING','OFFICE AUTOMATION']

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
            showAlert('Please enter a valid phone number (at least 10 digits).', 'error');
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

        const values = await showCustomModal({
            title: 'Assign Supervisor',
            message: `${intern.firstName} ${intern.lastName}`,
            confirmText: 'Assign',
            fields: [
                {
                    label: 'Supervisor',
                    name: 'supervisorId',
                    type: 'select',
                    value: intern.supervisorId || supervisors[0].id,
                    options: supervisors.map(supervisor => ({
                        value: supervisor.id,
                        label: `${supervisor.firstName} ${supervisor.lastName} - ${supervisor.department}`
                    }))
                }
            ]
        });

        if (!values) return;

        const supervisor = supervisors.find(item => item.id === Number(values.supervisorId));
        if (!supervisor) {
            showAlert('Supervisor record was not found.', 'warning');
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
        const assignedInternCounts = interns.reduce((counts, intern) => {
            if (intern.supervisorId) {
                counts[intern.supervisorId] = (counts[intern.supervisorId] || 0) + 1;
            }
            return counts;
        }, {});
        const today = new Date().toISOString().split('T')[0];
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

        const rowsHTML = supervisors.map(supervisor => `
            <tr>
                <td>
                    <div class="dashboard-user-cell">
                        <span class="dashboard-avatar">${escapeHTML(getUserInitials(supervisor.firstName, supervisor.lastName))}</span>
                        <div>
                            <div class="fw-bold">${escapeHTML(supervisor.firstName)} ${escapeHTML(supervisor.lastName)}</div>
                            <small class="text-muted">${escapeHTML(supervisor.email)}</small>
                        </div>
                    </div>
                </td>
                <td>${escapeHTML(supervisor.gender)}</td>
                <td>${escapeHTML(supervisor.department)}</td>
                <td>${escapeHTML(supervisor.phone)}</td>
                <td>${assignedInternCounts[supervisor.id] || 0}</td>
                <td>${escapeHTML(formatDashboardDate(supervisor.dateAdded))}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-primary" type="button" title="Update supervisor" onclick="editSupervisor(${supervisor.id})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn btn-sm btn-assign" type="button" title="Assign supervisor to intern" onclick="assignSupervisorToIntern(${supervisor.id})">
                            <i class="fas fa-user-plus"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" type="button" title="Delete supervisor" onclick="removeSupervisor(${supervisor.id})">
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
                        <th>Supervisor</th>
                        <th>Gender</th>
                        <th>Phone</th>
                        <th>Department</th>
                        <th>Interns</th>
                        <th>Date Added</th>
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
                { label: 'Phone', name: 'phone', value: supervisor.phone || '' },
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
                    options: ['SOFTWARE ENGINEERING', 'COMPUTER SCIENCE and NETWORKS', 'QUALITY ASSURANCE','ACCOUNTING','DRIVING SCHOOL','FABRIC OFFICE','GRAPHICS AND PRINTING','BINDING','MOUNTING','EDITING','MARKETING','SCREEN PRINTING','OFFICE OUTOMATION']    
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
            showAlert('Please enter a valid phone number (at least 10 digits).', 'error');
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
            updatedAt: new Date().toISOString()
        });
        showAlert('Supervisor updated successfully.', 'success');
        await loadSupervisorsPage();
        await loadGroupTools();
    } catch (error) {
        showAlert('Error updating supervisor: ' + error, 'error');
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
    const internList = document.querySelector('[data-group-intern-list]');
    const groupsContainer = document.querySelector('[data-group-list]');
    if (!supervisorSelect || !internList || !groupsContainer) return;

    try {
        const [supervisors, interns, groups] = await Promise.all([
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
        const internMap = interns.reduce((map, intern) => {
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
                        <h4>${escapeHTML(group.name)}</h4>
                        <p>${escapeHTML(supervisorMap[group.supervisorId] || 'No supervisor assigned')}</p>
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
        const supervisorSelect = document.getElementById('groupSupervisor');
        const internCheckboxes = document.querySelectorAll('[data-group-intern-list] input[type="checkbox"]');

        if (nameInput) nameInput.value = group.name || '';
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
                            <div>
                                <div class="fw-bold">${escapeHTML(intern.firstName)} ${escapeHTML(intern.lastName)}</div>
                                <small class="text-muted">${escapeHTML(intern.email)}</small>
                            </div>
                        </div>
                    </td>
                    <td>${escapeHTML(intern.department)}</td>
                    <td><span class="performance-score ${performance ? getPerformanceScoreClass(score) : 'pending'}">${escapeHTML(scoreLabel)}</span></td>
                    <td>${escapeHTML(performance?.rating || 'Not reviewed')}</td>
                    <td>${escapeHTML(performance?.remarks || '-')}</td>
                    <td>${escapeHTML(formatDashboardDate(performance?.updatedAt || performance?.createdAt))}</td>
                    <td><button class="btn btn-sm btn-primary" onclick="editPerformance(${intern.id})"><i class="fas fa-pen"></i></button></td>
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

        const values = await showCustomModal({
            title: 'Update Performance',
            message: intern ? `${intern.firstName} ${intern.lastName}` : 'Intern performance review',
            confirmText: 'Save Review',
            fields: [
                {
                    label: 'Score',
                    name: 'score',
                    value: performanceRecord.score || '',
                    placeholder: '0 - 100'
                },
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

        const score = Number(values.score);
        if (!Number.isFinite(score) || score < 0 || score > 100) {
            showAlert('Performance score must be between 0 and 100.', 'warning');
            return;
        }

        const recordToSave = {
            ...performanceRecord,
            internId,
            internName: intern ? `${intern.firstName} ${intern.lastName}` : performanceRecord.internName,
            department: intern?.department || performanceRecord.department,
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

async function editAttendance(internId) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const intern = await getInternById(internId);
        const existingRecords = await getAttendanceByInternId(internId);
        const attendanceRecord = existingRecords.find(record => record.date === today) ||
                                 existingRecords[existingRecords.length - 1] ||
                                 {
                                     id: Date.now(),
                                     internId: internId,
                                     internName: intern ? `${intern.firstName} ${intern.lastName}` : '',
                                     internId_code: intern ? intern.internId : '',
                                     email: intern ? intern.email : '',
                                     department: intern ? intern.department : '',
                                     date: today,
                                     createdAt: new Date().toISOString()
                                 };

        const isStatusLocked = Boolean(attendanceRecord.statusLockedAt);
        const isCheckInLocked = Boolean(attendanceRecord.checkInTime);
        const isCheckOutLocked = Boolean(attendanceRecord.checkOutTime);

        const attendanceValues = await showCustomModal({
            title: 'Update Attendance',
            message: intern ? `${intern.firstName} ${intern.lastName}` : 'Edit intern attendance record',
            confirmText: 'Update',
            fields: [
                {
                    label: 'Check In',
                    name: 'checkIn',
                    value: attendanceRecord.checkInTime || '',
                    placeholder: 'HH:MM AM/PM',
                    disabled: isCheckInLocked,
                    helpText: isCheckInLocked ? 'Check-in time is locked after the first save.' : 'Format: HH:MM AM/PM, e.g. 08:30 AM'
                },
                {
                    label: 'Check Out',
                    name: 'checkOut',
                    value: attendanceRecord.checkOutTime || '',
                    placeholder: 'HH:MM AM/PM',
                    disabled: isCheckOutLocked,
                    helpText: isCheckOutLocked ? 'Check-out time is locked after the first save.' : 'Format: HH:MM AM/PM, must be after check-in'
                },
                {
                    label: 'Status',
                    name: 'status',
                    type: 'select',
                    value: attendanceRecord.status || 'Absent',
                    options: ['Present', 'Late', 'Absent'],
                    disabled: isStatusLocked,
                    helpText: isStatusLocked ? 'Status is locked after the first save.' : ''
                },
                {
                    label: 'Remarks',
                    name: 'remarks',
                    value: attendanceRecord.remarks || '',
                    placeholder: 'Optional'
                }
            ]
        });

        if (!attendanceValues) return;

        const rawCheckIn = isCheckInLocked ? attendanceRecord.checkInTime : (attendanceValues.checkIn.trim() || null);
        const rawCheckOut = isCheckOutLocked ? attendanceRecord.checkOutTime : (attendanceValues.checkOut.trim() || null);

        if (!isCheckInLocked && rawCheckIn && parseTimeToMinutes(rawCheckIn) === null) {
            showAlert('Check-in time must be in HH:MM AM/PM format, e.g. 08:30 AM.', 'error');
            return;
        }
        if (!isCheckOutLocked && rawCheckOut && parseTimeToMinutes(rawCheckOut) === null) {
            showAlert('Check-out time must be in HH:MM AM/PM format, e.g. 05:00 PM.', 'error');
            return;
        }

        if (rawCheckIn && rawCheckOut) {
            const checkInMinutes = parseTimeToMinutes(rawCheckIn);
            const checkOutMinutes = parseTimeToMinutes(rawCheckOut);
            if (checkInMinutes !== null && checkOutMinutes !== null && checkOutMinutes <= checkInMinutes) {
                showAlert('Check-out time must be later than check-in time.', 'error');
                return;
            }
        }

        await updateAttendance({
            ...attendanceRecord,
            internId: internId,
            checkInTime: rawCheckIn,
            checkOutTime: rawCheckOut,
            status: isStatusLocked ? attendanceRecord.status : attendanceValues.status,
            remarks: attendanceValues.remarks || '',
            updatedAt: new Date().toISOString()
        });

        showAlert('Attendance updated successfully!', 'success', 4000);
        await loadAttendanceStatistics();
        await loadAttendanceTable();
    } catch (error) {
        showAlert('Error updating attendance: ' + error, 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!requireLogin()) return;

    initDatabase().then(() => {
        console.log('Database initialized and ready to use');
        
        const attendanceElement = document.getElementById('totalInterns');
        if (attendanceElement) {
            loadAttendanceStatistics();
            loadAttendanceTable();

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
        }

        const dashboardTable = document.querySelector('[data-user-table]');
        if (dashboardTable) {
            loadDashboardUsers();
        }

        const supervisorTable = document.querySelector('[data-supervisor-table]');
        if (supervisorTable) {
            loadSupervisorsPage();
            loadGroupTools();
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

