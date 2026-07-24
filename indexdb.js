
// Database reference - will be set when database opens
let db;

// Database name - identifies the database in browser storage
const DB_NAME = 'InternFlowDB';

// Database version - incremented when schema changes
const DB_VERSION = 4;

// ============================================================================
// Custom Alert System - Creates beautiful, attractive notifications
// ============================================================================

function showAlert(message, type = 'info', duration = 4000) {
    // type can be: 'success', 'error', 'warning', 'info'
    
    // Create alert container if it doesn't exist
    let alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) {
        // Create container element
        alertContainer = document.createElement('div');
        // Set unique ID for container
        alertContainer.id = 'alertContainer';
        // Add to document body
        document.body.appendChild(alertContainer);
    }
    
    // Create alert element
    const alertElement = document.createElement('div');
    // Set alert class with type (success, error, warning, info)
    alertElement.className = `custom-alert custom-alert-${type} animate-slide-in`;
    
    // Define icons for different alert types
    const icons = {
        // Check icon for success
        success: '✓',
        // Exclamation icon for error
        error: '❌',
        // Warning icon for warning
        warning: '⚠️',
        // Info icon for info
        info: 'ℹ️'
    };
    
    // Set the inner HTML with icon and message
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
    
    // Add alert to container
    alertContainer.appendChild(alertElement);
    
    // Auto-dismiss after specified duration
    setTimeout(() => {
        // Add fade-out animation class
        alertElement.classList.add('animate-slide-out');
        // Remove element after animation completes
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

function showCustomModal({ title, message, fields = [], confirmText = 'Save', cancelText = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';

        const fieldsHTML = fields.map(field => {
            // Disable fields when a saved value should be shown but not changed.
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

// ============================================================================
// IndexedDB Configuration
// ============================================================================

// Initialize IndexedDB
function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // Fires if the DB can't be opened at all (e.g. storage disabled).
        request.onerror = () => {
            console.error('Database failed to open');
            reject(request.error);
        };

        // Fires if an older connection (usually in another open tab) is
        // still holding the database and blocking this upgrade. Without
        // this handler, neither onsuccess nor onerror ever fires and `db`
        // stays undefined forever, causing "Cannot read properties of
        // undefined (reading 'transaction')" the moment any db function runs.
        request.onblocked = () => {
            console.warn('Database upgrade blocked by another open tab/connection.');
            showAlert('Please close other tabs of this app, then reload this page.', 'warning', 6000);
            reject(new Error('Database upgrade blocked by another open connection.'));
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('Database opened successfully');

            // If another tab later needs to upgrade the schema, this
            // connection must close itself so that tab isn't blocked in turn.
            db.onversionchange = () => {
                db.close();
                console.warn('Database is outdated; another tab needs an upgrade. Please reload this page.');
                showAlert('This page is out of date. Please reload.', 'warning', 6000);
            };

            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;

            // Create Interns Store
            if (!db.objectStoreNames.contains('interns')) {
                const internStore = db.createObjectStore('interns', { keyPath: 'id' });
                internStore.createIndex('name', 'name', { unique: false });
                internStore.createIndex('email', 'email', { unique: true });
                internStore.createIndex('department', 'department', { unique: false });
            }

            // Create Supervisors Store
            if (!db.objectStoreNames.contains('supervisors')) {
                const supervisorStore = db.createObjectStore('supervisors', { keyPath: 'id' });
                supervisorStore.createIndex('name', 'name', { unique: false });
                supervisorStore.createIndex('email', 'email', { unique: true });
                supervisorStore.createIndex('department', 'department', { unique: false });
                supervisorStore.createIndex('role', 'role', { unique: false });
            }

            // Create Attendance Store
            if (!db.objectStoreNames.contains('attendance')) {
                const attendanceStore = db.createObjectStore('attendance', { keyPath: 'id' });
                attendanceStore.createIndex('internId', 'internId', { unique: false });
                attendanceStore.createIndex('date', 'date', { unique: false });
                attendanceStore.createIndex('status', 'status', { unique: false });
            }

            // Create Performance Store
            if (!db.objectStoreNames.contains('performance')) {
                const performanceStore = db.createObjectStore('performance', { keyPath: 'id' });
                performanceStore.createIndex('internId', 'internId', { unique: false });
                performanceStore.createIndex('rating', 'rating', { unique: false });
            }

            // Create Settings Store
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }

            // Create Groups Store
            if (!db.objectStoreNames.contains('groups')) {
                const groupStore = db.createObjectStore('groups', { keyPath: 'id' });
                groupStore.createIndex('name', 'name', { unique: false });
                groupStore.createIndex('supervisorId', 'supervisorId', { unique: false });
            }

            console.log('Database schema created');
        };
    });
}
//check whether a store already has a record with this email.
// Both 'interns' and 'supervisors' have a UNIQUE index on 'email', so
// store.add() throws a raw ConstraintError if you try to reuse one.
// Checking first lets us show a friendly message instead of that error.
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

// Add Intern
function addIntern(intern) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('interns', 'readwrite');
        const store = transaction.objectStore('interns');
        const request = store.add(intern);

        request.onsuccess = () => {
            console.log('Intern added:', intern);
            resolve(request.result);
        };

        request.onerror = () => {
            console.error('Error adding intern:', request.error);
            if (request.error?.name === 'ConstraintError') {
                reject(new Error('An intern with this email is already registered.'));
            } else {
                reject(request.error);
            }
        };
    });
}

// Get All Interns
function getAllInterns() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('interns', 'readonly');
        const store = transaction.objectStore('interns');
        const request = store.getAll();

        request.onsuccess = () => {
            console.log('Interns retrieved:', request.result);
            resolve(request.result);
        };

        request.onerror = () => {
            console.error('Error retrieving interns:', request.error);
            reject(request.error);
        };
    });
}

// Get Intern by ID
function getInternById(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('interns', 'readonly');
        const store = transaction.objectStore('interns');
        const request = store.get(id);

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

// Update Intern
function updateIntern(intern) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('interns', 'readwrite');
        const store = transaction.objectStore('interns');
        const request = store.put(intern);

        request.onsuccess = () => {
            console.log('Intern updated:', intern);
            resolve(request.result);
        };

        request.onerror = () => {
            console.error('Error updating intern:', request.error);
            if (request.error?.name === 'ConstraintError') {
                reject(new Error('Another intern is already using that email.'));
            } else {
                reject(request.error);
            }
        };
    });
}

// Add Supervisor
function addSupervisor(supervisor) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('supervisors', 'readwrite');
        const store = transaction.objectStore('supervisors');
        const request = store.add(supervisor);

        request.onsuccess = () => {
            console.log('Supervisor added:', supervisor);
            resolve(request.result);
        };

        request.onerror = () => {
            console.error('Error adding supervisor:', request.error);
            if (request.error?.name === 'ConstraintError') {
                reject(new Error('A supervisor with this email is already registered.'));
            } else {
                reject(request.error);
            }
        };
    });
}

// Get All Supervisors
function getAllSupervisors() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('supervisors', 'readonly');
        const store = transaction.objectStore('supervisors');
        const request = store.getAll();

        request.onsuccess = () => {
            console.log('Supervisors retrieved:', request.result);
            resolve(request.result);
        };

        request.onerror = () => {
            console.error('Error retrieving supervisors:', request.error);
            reject(request.error);
        };
    });
}

// Get Supervisor by ID
function getSupervisorById(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('supervisors', 'readonly');
        const store = transaction.objectStore('supervisors');
        const request = store.get(id);

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

// Update Supervisor
function updateSupervisor(supervisor) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('supervisors', 'readwrite');
        const store = transaction.objectStore('supervisors');
        const request = store.put(supervisor);

        request.onsuccess = () => {
            console.log('Supervisor updated:', supervisor);
            resolve(request.result);
        };

        request.onerror = () => {
            console.error('Error updating supervisor:', request.error);
            if (request.error?.name === 'ConstraintError') {
                reject(new Error('Another supervisor is already using that email.'));
            } else {
                reject(request.error);
            }
        };
    });
}

// Delete Supervisor
function deleteSupervisor(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('supervisors', 'readwrite');
        const store = transaction.objectStore('supervisors');
        const request = store.delete(id);

        request.onsuccess = () => {
            console.log('Supervisor deleted with ID:', id);
            resolve();
        };

        request.onerror = () => {
            console.error('Error deleting supervisor:', request.error);
            reject(request.error);
        };
    });
}

function addGroup(group) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('groups', 'readwrite');
        const store = transaction.objectStore('groups');
        const request = store.add(group);

        request.onsuccess = () => {
            console.log('Group added:', group);
            resolve(request.result);
        };

        request.onerror = () => {
            console.error('Error adding group:', request.error);
            reject(request.error);
        };
    });
}

function getAllGroups() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('groups', 'readonly');
        const store = transaction.objectStore('groups');
        const request = store.getAll();

        request.onsuccess = () => {
            console.log('Groups retrieved:', request.result);
            resolve(request.result);
        };

        request.onerror = () => {
            console.error('Error retrieving groups:', request.error);
            reject(request.error);
        };
    });
}

function updateGroup(group) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('groups', 'readwrite');
        const store = transaction.objectStore('groups');
        const request = store.put(group);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
function getGroupById(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('groups', 'readonly');
        const store = transaction.objectStore('groups');
        const request = store.get(id);

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

function deleteGroup(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('groups', 'readwrite');
        const store = transaction.objectStore('groups');
        const request = store.delete(id);

        request.onsuccess = () => {
            console.log('group :', id);
            resolve();
        };

        request.onerror = () => {
            console.error('Error deleting intern:', request.error);
            reject(request.error);
        };
    });
}

// Delete Intern
function deleteIntern(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('interns', 'readwrite');
        const store = transaction.objectStore('interns');
        const request = store.delete(id);

        request.onsuccess = () => {
            console.log('Intern deleted with ID:', id);
            resolve();
        };

        request.onerror = () => {
            console.error('Error deleting intern:', request.error);
            reject(request.error);
        };
    });
}

// Delete related records for an intern from a store that has an internId index
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

// Delete an intern and their linked attendance/performance records
async function deleteInternWithRecords(internId) {
    await Promise.all([
        deleteRecordsByInternId('attendance', internId),
        deleteRecordsByInternId('performance', internId)
    ]);
    await deleteIntern(internId);
}

// Add Attendance Record
function addAttendance(record) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('attendance', 'readwrite');
        const store = transaction.objectStore('attendance');
        const request = store.add(record);

        request.onsuccess = () => {
            console.log('Attendance record added:', record);
            resolve(request.result);
        };

        request.onerror = () => {
            console.error('Error adding attendance:', request.error);
            reject(request.error);
        };
    });
}

// Get All Attendance Records
function getAllAttendance() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('attendance', 'readonly');
        const store = transaction.objectStore('attendance');
        const request = store.getAll();

        request.onsuccess = () => {
            console.log('Attendance records retrieved:', request.result);
            resolve(request.result);
        };

        request.onerror = () => {
            console.error('Error retrieving attendance:', request.error);
            reject(request.error);
        };
    });
}

// Get Attendance by Intern ID
function getAttendanceByInternId(internId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('attendance', 'readonly');
        const store = transaction.objectStore('attendance');
        const index = store.index('internId');
        const request = index.getAll(internId);

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

// Get a single attendance record so status lock rules can compare old and new values.
function getAttendanceById(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('attendance', 'readonly');
        const store = transaction.objectStore('attendance');
        const request = store.get(id);

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

// Update Attendance
async function updateAttendance(record) {
    // Once statusLockedAt exists, the saved attendance status is final.
    const existingRecord = await getAttendanceById(record.id);
    if (existingRecord?.statusLockedAt && existingRecord.status !== record.status) {
        throw new Error('Attendance status has already been set and cannot be modified.');
    }

    // Check-in time becomes final after a value has been saved.
    if (existingRecord?.checkInTime && existingRecord.checkInTime !== record.checkInTime) {
        throw new Error('Check-in time has already been set and cannot be modified.');
    }

    // Check-out time becomes final after a value has been saved.
    if (existingRecord?.checkOutTime && existingRecord.checkOutTime !== record.checkOutTime) {
        throw new Error('Check-out time has already been set and cannot be modified.');
    }

    // The first saved attendance status gets a lock timestamp for future edits.
    const recordToSave = {
        ...record,
        statusLockedAt: existingRecord?.statusLockedAt || record.statusLockedAt || new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('attendance', 'readwrite');
        const store = transaction.objectStore('attendance');
        const request = store.put(recordToSave);

        request.onsuccess = () => {
            console.log('Attendance record updated:', recordToSave);
            resolve(request.result);
        };

        request.onerror = () => {
            console.error('Error updating attendance:', request.error);
            reject(request.error);
        };
    });
}

// Add Performance Record
function addPerformance(record) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('performance', 'readwrite');
        const store = transaction.objectStore('performance');
        const request = store.add(record);

        request.onsuccess = () => {
            console.log('Performance record added:', record);
            resolve(request.result);
        };

        request.onerror = () => {
            console.error('Error adding performance:', request.error);
            reject(request.error);
        };
    });
}

// Get All Performance Records
function getAllPerformance() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('performance', 'readonly');
        const store = transaction.objectStore('performance');
        const request = store.getAll();

        request.onsuccess = () => {
            console.log('Performance records retrieved:', request.result);
            resolve(request.result);
        };

        request.onerror = () => {
            console.error('Error retrieving performance:', request.error);
            reject(request.error);
        };
    });
}

// Get Performance by Intern ID
function getPerformanceByInternId(internId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('performance', 'readonly');
        const store = transaction.objectStore('performance');
        const index = store.index('internId');
        const request = index.getAll(internId);

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

// Update Performance
function updatePerformance(record) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('performance', 'readwrite');
        const store = transaction.objectStore('performance');
        const request = store.put(record);

        request.onsuccess = () => {
            console.log('Performance record updated:', record);
            resolve(request.result);
        };

        request.onerror = () => {
            console.error('Error updating performance:', request.error);
            reject(request.error);
        };
    });
}

// Save a single settings value in the IndexedDB settings store.
function saveSetting(key, value) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('settings', 'readwrite');
        const store = transaction.objectStore('settings');
        const request = store.put({ key, value });

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Retrieve one settings value by key and return null when it has not been saved.
function getSetting(key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('settings', 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result?.value ?? null);
        request.onerror = () => reject(request.error);
    });
}

// Export Data to CSV
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
            let csv = keys.join(',') + '\n';

            data.forEach(item => {
                const values = keys.map(key => item[key]);
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

// Handle Form Submission (for Registration and other forms)
function handleFormSubmit(event, formType) {
    event.preventDefault();

    if (formType === 'intern') {
        // Get form field values
        const firstName = document.getElementById('validationCustom01')?.value.trim();
        const lastName = document.getElementById('validationCustom02')?.value.trim();
        const email = document.getElementById('validationCustomUsername')?.value.trim();
        const phone = document.getElementById('validationCustom03')?.value.trim();
        const school = document.getElementById('validationCustom06')?.value.trim();
        const department = document.getElementById('validationCustom04')?.value;
        const gender = document.getElementById('validationCustom05')?.value;

        // Validate all fields are filled
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

        // Name validation - only letters and spaces allowed
        const nameRegex = /^[a-zA-Z\s]+$/;
        if (!nameRegex.test(firstName)) {
            showAlert('First name can only contain letters and spaces. No numbers or special characters allowed.', 'error');
            return;
        }
        if (!nameRegex.test(lastName)) {
            showAlert('Last name can only contain letters and spaces. No numbers or special characters allowed.', 'error');
            return;
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showAlert('Please enter a valid email address.', 'error');
            return;
        }

        // Phone validation (checks if it's numeric with at least 10 digits)
        if (!/^\d{10,}$/.test(phone.replace(/[\s\-()]/g, ''))) {
            showAlert('Please enter a valid phone number (at least 10 digits).', 'error');
            return;
        }

        // Check for a duplicate email before writing anything, so the
        // person gets a clear warning instead of a raw database error.
        emailExistsInStore('interns', email).then((exists) => {
            if (exists) {
                showAlert('An intern with this email is already registered.', 'warning');
                return;
            }

            // Create intern object with all required fields including auto-generated ID
            const intern = {
                // Unique ID generated using current timestamp in milliseconds
                id: Date.now(),
                // Store first name as entered by user
                firstName: firstName,
                // Store last name as entered by user
                lastName: lastName,
                // Store email as entered by user
                email: email,
                // Store phone number as entered by user
                phone: phone,
                // Store school as entered by user
                school: school,
                // Store selected department
                department: department,
                // Store selected gender
                gender: gender,
                // Create an Intern ID in format: INT-YYYY-XXX (e.g., INT-2025-001)
                internId: generateInternID(),
                // Store the current date and time when intern was registered
                dateAdded: new Date().toISOString()
            };

            // Add intern to database and create corresponding attendance record
            addIntern(intern).then((internData) => {
                // Call function to automatically create attendance record for new intern
                createAttendanceRecordForNewIntern(intern);
                // Show success message with beautiful alert
                showAlert('Intern registered successfully.', 'success');
                // Clear all form fields after successful registration
                event.target.reset();
                // Close the dashboard registration modal when this form is inside one.
                if (document.getElementById('addUserModal')) {
                    closeAddUserModal();
                }
                // Refresh the dashboard user list so the new intern appears immediately.
                loadDashboardUsers();
            }).catch(error => {
                // Show error message if registration fails
                showAlert('Error registering intern: ' + (error?.message || error), 'error');
            });
        }).catch(error => {
            showAlert('Error checking existing records: ' + (error?.message || error), 'error');
        });
    } else if (formType === 'supervisor') {
        // Get supervisor form field values from the dedicated supervisors page.
        const firstName = document.getElementById('supervisorFirstName')?.value.trim();
        const lastName = document.getElementById('supervisorLastName')?.value.trim();
        const email = document.getElementById('supervisorEmail')?.value.trim();
        const phone = document.getElementById('supervisorPhone')?.value.trim();
        const department = document.getElementById('supervisorDepartment')?.value;

        if (!firstName || !lastName || !email || !phone || !department) {
            showAlert('Please fill all supervisor registration fields.', 'warning');
            return;
        }

        // Supervisor names follow the same letters-and-spaces rule as interns.
        const nameRegex = /^[a-zA-Z\s]+$/;
        if (!nameRegex.test(firstName) || !nameRegex.test(lastName)) {
            showAlert('Supervisor names can only contain letters and spaces.', 'error');
            return;
        }

        // Supervisor email and phone use the same validation standard as intern registration.
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showAlert('Please enter a valid email address.', 'error');
            return;
        }

        if (!/^\d{10,}$/.test(phone.replace(/[\s\-()]/g, ''))) {
            showAlert('Please enter a valid phone number (at least 10 digits).', 'error');
            return;
        }

        // Check for a duplicate email before writing anything, so the
        // person gets a clear warning instead of a raw database error.
        emailExistsInStore('supervisors', email).then((exists) => {
            if (exists) {
                showAlert('A supervisor with this email is already registered.', 'warning');
                return;
            }

            // Store supervisors separately so intern attendance records remain intern-only.
            const supervisor = {
                id: Date.now(),
                firstName,
                lastName,
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


// Parse a "HH:MM AM/PM" string into minutes-since-midnight, or null if it
// doesn't match that format. Used to validate and compare attendance times.
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

// Generate unique Intern ID in format INT-YYYY-XXX
function generateInternID() {
    // Get current year (e.g., 2025)
    const year = new Date().getFullYear();
    // Generate random number between 0-999 and pad with zeros (e.g., 001)
    const randomNum = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    // Return formatted ID (e.g., INT-2025-001)
    return `INT-${year}-${randomNum}`;
}

// Automatically create attendance record when new intern is registered
function createAttendanceRecordForNewIntern(intern) {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    
    // Create attendance record object with initial "Absent" status
    const attendanceRecord = {
        // Unique ID for this attendance record
        id: Date.now(),
        // Link attendance record to the intern using their ID
        internId: intern.id,
        // Store intern's full name for display in attendance table
        internName: `${intern.firstName} ${intern.lastName}`,
        // Store intern's unique ID code (INT-YYYY-XXX)
        internId_code: intern.internId,
        // Store intern's email for contact purposes
        email: intern.email,
        // Store intern's department for filtering
        department: intern.department,
        // Today's date in YYYY-MM-DD format
        date: today,
        // Check-in time (null by default until marked as present)
        checkInTime: null,
        // Check-out time (null by default)
        checkOutTime: null,
        // Initial status set to "Absent" until marked otherwise
        status: 'Absent',
        // Additional notes about attendance (empty by default)
        remarks: '',
        // Timestamp when attendance record was created
        createdAt: new Date().toISOString()
    };
    
    // Add the attendance record to database
    addAttendance(attendanceRecord).then(() => {
        // Log success message to browser console
        console.log('✅ Attendance record created for:', intern.firstName, intern.lastName);
        // Show beautiful success notification
        showAlert(`Attendance record created for ${intern.firstName} ${intern.lastName}`, 'success', 3000);
    }).catch(error => {
        // Log error if attendance record creation fails
        console.error('❌ Error creating attendance record:', error);
    });
}

// Load and update attendance statistics (Total, Present, Late, Absent)
async function loadAttendanceStatistics() {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    
    try {
        // Retrieve all interns from database
        const allInterns = await getAllInterns();
        // Get all attendance records for today
        const allAttendance = await getAllAttendance();
        // Filter attendance records to only today's records
        const todayAttendance = allAttendance.filter(a => a.date === today);
        
        // Count total number of registered interns
        const totalCount = allInterns.length;
        // Count interns marked as "Present" today
        const presentCount = todayAttendance.filter(a => a.status === 'Present').length;
        // Count interns marked as "Late" today
        const lateCount = todayAttendance.filter(a => a.status === 'Late').length;
        // Count interns marked as "Absent" today
        const absentCount = todayAttendance.filter(a => a.status === 'Absent').length;
        
        // Update Total Interns count in HTML
        const totalElement = document.getElementById('totalInterns');
        if (totalElement) totalElement.textContent = totalCount;
        
        // Update Present Today count in HTML
        const presentElement = document.getElementById('presentToday');
        if (presentElement) presentElement.textContent = presentCount;
        
        // Update Late Today count in HTML
        const lateElement = document.getElementById('lateToday');
        if (lateElement) lateElement.textContent = lateCount;
        
        // Update Absent Today count in HTML
        const absentElement = document.getElementById('absentToday');
        if (absentElement) absentElement.textContent = absentCount;
        
        // Log statistics to console for debugging
        console.log(`📊 Attendance Stats - Total: ${totalCount}, Present: ${presentCount}, Late: ${lateCount}, Absent: ${absentCount}`);
    } catch (error) {
        // Log error if statistics loading fails
        console.error('❌ Error loading attendance statistics:', error);
    }
}

// Load and display attendance table with all intern records
async function loadAttendanceTable() {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    
    try {
        // Retrieve all interns from database
        const allInterns = await getAllInterns();
        // Retrieve all attendance records
        const allAttendance = await getAllAttendance();
        
        // Create a map of attendance records by intern ID for quick lookup
        const attendanceMap = {};
        allAttendance.forEach(record => {
            // Use intern ID as key to store their most recent attendance
            attendanceMap[record.internId] = record;
        });
        
        // Start building HTML table structure
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
        
        // Loop through each intern to create table rows
        allInterns.forEach(intern => {
            // Get attendance record for this intern (or use default if not found)
            const attendance = attendanceMap[intern.id] || {
                checkInTime: '-',
                checkOutTime: '-',
                status: 'Absent',
                remarks: ''
            };
            
            // Determine status badge color: green=Present, orange=Late, red=Absent
            const statusColor = attendance.status === 'Present' ? 'success' : 
                                attendance.status === 'Late' ? 'warning' : 'danger';
            
            // Show a lock icon beside statuses that have already been saved and made final.
            const statusLockIcon = attendance.statusLockedAt ? '<i class="fas fa-lock status-lock-icon" title="Status locked"></i>' : '';

            // Generate a status badge with appropriate color and optional lock indicator
            const statusBadge = `<span class="badge bg-${statusColor} status-badge">${attendance.status}${statusLockIcon}</span>`;
            
            // Add row to HTML table for this intern
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
        
        // Close HTML table structure
        tableHTML += `
                </tbody>
            </table>
        `;
        
        // Find the table container in HTML and insert the generated table
        const tableContainer = document.querySelector('.table-container') || 
                               document.querySelector('[data-attendance-table]');
        if (tableContainer) {
            // Insert the generated table HTML into the container
            tableContainer.innerHTML = tableHTML;
            bindAttendanceSelectionControls();
        }
        
        // Log success message to console
        console.log('✅ Attendance table loaded with', allInterns.length, 'interns');
    } catch (error) {
        // Log error if table loading fails
        console.error('❌ Error loading attendance table:', error);
    }
}

// Keep row checkboxes, header checkbox, and delete button in sync
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

    deleteButton.onclick = deleteSelectedInterns;
    updateDeleteButton();
}

// Delete all selected interns from the attendance roster
async function deleteSelectedInterns() {
    const selectedIds = Array.from(document.querySelectorAll('.intern-select:checked'))
        .map(checkbox => Number(checkbox.value));

    if (selectedIds.length === 0) {
        showAlert('Select at least one intern to delete.', 'warning');
        return;
    }

    const label = selectedIds.length === 1 ? 'this intern' : `these ${selectedIds.length} interns`;
    const confirmed = await showCustomConfirm(
        `Delete ${label}? This will also remove linked attendance and performance records.`,
        {
            title: 'Delete Selected Interns',
            confirmText: 'Delete',
            danger: true
        }
    );
    if (!confirmed) return;

    try {
        await Promise.all(selectedIds.map(deleteInternWithRecords));
        showAlert(`${selectedIds.length} intern${selectedIds.length === 1 ? '' : 's'} deleted successfully.`, 'success');
        await loadAttendanceStatistics();
        await loadAttendanceTable();
    } catch (error) {
        console.error('Error deleting selected interns:', error);
        showAlert('Error deleting selected interns: ' + error, 'error');
    }
}

// Toggle the animated Users submenu in the sidebar without navigating away.
function toggleUserSubmenu(event) {
    event.preventDefault();

    const userLink = event.currentTarget;
    const submenu = userLink.nextElementSibling;
    if (!submenu?.classList.contains('user-submenu')) return;

    userLink.classList.toggle('open');
    submenu.classList.toggle('open');
}

// Open the dashboard add-user modal that contains the existing registration form.
function openAddUserModal() {
    const modal = document.getElementById('addUserModal');
    if (!modal) return;

    modal.hidden = false;
    modal.classList.remove('closing');
    document.body.classList.add('modal-open');
}

// Close and reset the dashboard registration modal without changing saved users.
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

// Format stored registration dates into a compact dashboard-friendly value.
function formatDashboardDate(value) {
    if (!value) return '-';

    return new Date(value).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Build a short initials badge for users that do not have an uploaded avatar.
function getUserInitials(firstName, lastName) {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'U';
}

// Load all registered interns into the admin dashboard user table and summary cards.
async function loadDashboardUsers() {
    const tableContainer = document.querySelector('[data-user-table]');
    if (!tableContainer) return;

    try {
        const allInterns = await getAllInterns();
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
                    options: ['Software Engineering', 'Computer Science and Networks', 'Quality Assurance']
                },
                {
                    label: 'Gender',
                    name: 'gender',
                    type: 'select',
                    value: intern.gender || 'Male',
                    options: ['Male', 'Female']
                },
                {
                    label: 'Role',
                    name: 'role',
                    type: 'select',
                    value: intern.role || 'User',
                    options: ['User', 'Admin']
                }
            ]
        });

        if (!values) return;

        const nameRegex = /^[a-zA-Z\s]+$/;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!values.firstName.trim() || !values.lastName.trim() || !values.email.trim() || !values.phone.trim() || !values.school.trim() || !values.department || !values.gender) {
            showAlert('Please complete all intern fields.', 'warning');
            return;
        }
        if (!nameRegex.test(values.firstName.trim()) || !nameRegex.test(values.lastName.trim())) {
            showAlert('Intern names can only contain letters and spaces.', 'error');
            return;
        }
        if (!emailRegex.test(values.email.trim())) {
            showAlert('Please enter a valid email address.', 'error');
            return;
        }
        if (!/^\d{10,}$/.test(values.phone.replace(/[\s\-()]/g, ''))) {
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
            role: values.role || 'User',
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

// Load supervisors into the dedicated supervisors page table and summary cards.
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
                <td>${escapeHTML(supervisor.department)}</td>
                <td>${escapeHTML(supervisor.phone)}</td>
                <td>${assignedInternCounts[supervisor.id] || 0}</td>
                <td>${escapeHTML(formatDashboardDate(supervisor.dateAdded))}</td>
                <td>
<<<<<<< HEAD
                
                <div class="table-actions">
                     <button class="btn btn-sm btn-primary"type="button"title"update supervisor"onclick"editSupervisor(${supervisor.id})">
                      <i class="fes fa-pen"></i>
                    </button>
                    <button class="btn btn-sm btn-assign"type="button"title="assign supervisor to intern" onclick="assignSupversorToIntern(${supervisor.id}">
                        <i class="fas fa-user-plus"></i>
                    </button>
                     <i class="fas fa-trash"></i>  - delete this too
                    <button class="btn btn-sm btn-danger"type= "button"=deleteSupervisor(${supervisor.id}">
                    <i class="fas fa-trash></i

                       </button>
=======
                    <div class="table-actions">
                        <button class="btn btn-sm btn-primary" type="button" title="Update supervisor" onclick="editSupervisor(${supervisor.id})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn btn-sm btn-assign" type="button" title="Assign supervisor to intern" onclick="assignSupervisorToIntern(${supervisor.id})">
                            <i class="fas fa-user-plus"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" type="button" title="Delete supervisor" onclick="removeSupervisor(${supervisor.id})">
                            <i class="fas fa-trash"></i>
                        
>>>>>>> 6e3577f34d37e0892e262722123af992e15fdeb4
                    </div>
                </td>
            </tr>
        `).join('');

        tableContainer.innerHTML = `
            <table class="table table-hover dashboard-user-table">
                <thead class="table-light">
                    <tr>
                        <th>Supervisor</th>
                        <th>Department</th>
                        <th>Phone</th>
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
                {
                    label: 'Department',
                    name: 'department',
                    type: 'select',
                    value: supervisor.department || 'Software Engineering',
                    options: ['Software Engineering', 'Computer Science and Networks', 'Quality Assurance']
                },
                {
                    label: 'Role',
                    name: 'role',
                    type: 'select',
                    value: supervisor.role || 'User',
                    options: ['User', 'Admin']
                }
            ]
        });

        if (!values) return;

        const nameRegex = /^[a-zA-Z\s]+$/;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!values.firstName.trim() || !values.lastName.trim() || !values.email.trim() || !values.phone.trim() || !values.department) {
            showAlert('Please complete all supervisor fields.', 'warning');
            return;
        }
        if (!nameRegex.test(values.firstName.trim()) || !nameRegex.test(values.lastName.trim())) {
            showAlert('Supervisor names can only contain letters and spaces.', 'error');
            return;
        }
        if (!emailRegex.test(values.email.trim())) {
            showAlert('Please enter a valid email address.', 'error');
            return;
        }
        if (!/^\d{10,}$/.test(values.phone.replace(/[\s\-()]/g, ''))) {
            showAlert('Please enter a valid phone number (at least 10 digits).', 'error');
            return;
        }

        await updateSupervisor({
            ...supervisor,
            firstName: values.firstName.trim(),
            lastName: values.lastName.trim(),
            email: values.email.trim(),
            phone: values.phone.trim(),
            department: values.department,
            role: values.role || 'User',
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
        const supervisor = await getSupervisorById(groupId);

        const confirmed = await showCustomConfirm(
            'Delete ${group}',
             {
                title: 'Delete group',
                confirmText: 'Delete',
                danger: true
            }
           
        );

        if (!confirmed) return;

        const [interns, supervisors] = await Promise.all([
            getAllInterns(),
            getAllSupervisors()
            
        ]);

        await Promise.all(interns
            .filter(intern => intern.supervisorId === supervisorId)
            .map(intern => updateIntern({
                ...intern,
                supervisorId: null,
                supervisorName: '',
                updatedAt: new Date().toISOString()
            })));

        await Promise.all(supervisors
            .filter(supervisor => supervisor.groupId === groupId)
            .map(supervisor => updateSupervisor({
                ...supervisor,
                group: '',
                updatedAt: new Date().toISOString()
            })));

        await deleteGroup(group);
        showAlert('group deleted successfully.', 'success');
        await loadSupervisorsPage();
        await loadGroupTools();
    } catch (error) {
        showAlert('Error deleting: ' + error, 'error');
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
                </div>
            `;
            }).join('');
    } catch (error) {
        showAlert('Error loading group tools: ' + error, 'error');
    }
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

    try {
        const supervisors = await getAllSupervisors();
        const supervisor = supervisors.find(item => item.id === supervisorId);

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
        await loadSupervisorsPage();
        await loadGroupTools();
    } catch (error) {
        showAlert('Error creating group: ' + error, 'error');
    }
}

// Convert a performance score into a compact visual badge class.
function getPerformanceScoreClass(score) {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    return 'needs-work';
}

// Load all interns with their latest performance review into the performance page.
async function loadPerformancePage() {
    const tableContainer = document.querySelector('[data-performance-table]');
    if (!tableContainer) return;

    try {
        const allInterns = await getAllInterns();
        const allPerformance = await getAllPerformance();
        const performanceMap = {};

        // Keep the most recent performance record per intern for the overview table.
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

        const rowsHTML = allInterns.map(intern => {
            const performance = performanceMap[intern.id];
            const score = Number(performance?.score || 0);
            const scoreLabel = performance ? `${score}%` : 'Pending';

            return `
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
    } catch (error) {
        console.error('Error loading performance page:', error);
        showAlert('Error loading performance records: ' + error, 'error');
    }
}

// Open a focused modal for adding or updating an intern performance review.
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

// Load settings page counters and populate saved workspace preferences.
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
        document.getElementById('settingsAdminEmail').value = await getSetting('adminEmail') || 'Admin@MIT.flo';
    } catch (error) {
        console.error('Error loading settings page:', error);
        showAlert('Error loading settings: ' + error, 'error');
    }
}

// Persist workspace preferences from the settings form.
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
        showAlert('Settings saved successfully.', 'success');
    } catch (error) {
        showAlert('Error saving settings: ' + error, 'error');
    }
}

// Edit attendance record for a specific intern
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
        // A locked status can still be viewed in the edit modal, but it cannot be changed.
        const isStatusLocked = Boolean(attendanceRecord.statusLockedAt);
        // Saved times remain visible for review, then become read-only after first entry.
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

        // Only fields the person could actually edit need validating —
        // locked fields keep whatever was already saved.
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

        // Update the existing attendance record while preserving its IndexedDB key
        await updateAttendance({
            ...attendanceRecord,
            internId: internId,
            checkInTime: rawCheckIn,
            checkOutTime: rawCheckOut,
            // Preserve the stored status when the field is locked in the modal.
            status: isStatusLocked ? attendanceRecord.status : attendanceValues.status,
            remarks: attendanceValues.remarks || '',
            updatedAt: new Date().toISOString()
        });

        // Show success message after update with beautiful alert
        showAlert('Attendance updated successfully!', 'success', 4000);
        await loadAttendanceStatistics();
        // Reload the attendance table to show updated data
        await loadAttendanceTable();
    } catch (error) {
        // Show beautiful error message if update fails
        showAlert('Error updating attendance: ' + error, 'error');
    }
}


// Initialize database when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the IndexedDB database
    initDatabase().then(() => {
        // Log success message when database opens
        console.log('Database initialized and ready to use');
        
        // Check if this is the attendance page by looking for attendance stat elements
        const attendanceElement = document.getElementById('totalInterns');
        if (attendanceElement) {
            // If attendance page is detected, load statistics
            loadAttendanceStatistics();
            // Load and display the attendance table
            loadAttendanceTable();
        }

        // Check if this is the admin dashboard by looking for the user table container
        const dashboardTable = document.querySelector('[data-user-table]');
        if (dashboardTable) {
            // Load dashboard summary cards and the full registered user list
            loadDashboardUsers();
        }

        // Check if this is the supervisors page by looking for the supervisor table container
        const supervisorTable = document.querySelector('[data-supervisor-table]');
        if (supervisorTable) {
            // Load supervisor summary cards and the full registered supervisor list
            loadSupervisorsPage();
            loadGroupTools();
        }

        // Check if this is the performance page by looking for its table container
        const performanceTable = document.querySelector('[data-performance-table]');
        if (performanceTable) {
            // Load performance summary cards and review table
            loadPerformancePage();
        }

        // Check if this is the settings page by looking for the preferences form
        const settingsForm = document.querySelector('.settings-form');
        if (settingsForm) {
            // Load saved preferences and data summary cards
            loadSettingsPage();
        }
    }).catch(error => {
        // Log error if database initialization fails
        console.error('Failed to initialize database:', error);
        // Surface it to the user too -- previously this failed silently,
        // and the first sign of trouble was a "reading transaction of
        // undefined" error on whatever button was clicked next.
        showAlert('Could not open the local database: ' + (error?.message || error), 'error', 6000);
    });
});
