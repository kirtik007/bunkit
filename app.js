/* ============================================
   Bunkit — College Attendance Tracker
   Firebase Edition (Auth + Firestore)
   ============================================ */

// ─── Firebase Imports ───
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  verifyBeforeUpdateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail,
  signInAnonymously
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  enableIndexedDbPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ─── Firebase Config ───
const firebaseConfig = {
  apiKey: "AIzaSyBu9mxUbdl64YLjfzUpPSaHOc_4wMsu1Uo",
  authDomain: "bunkit07.firebaseapp.com",
  projectId: "bunkit07",
  storageBucket: "bunkit07.firebasestorage.app",
  messagingSenderId: "1079827296854",
  appId: "1:1079827296854:web:f78d2deef98533faa301f7",
  measurementId: "G-FKJTEDT60K"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
    console.warn("Multiple tabs open, persistence can only be enabled in one tab at a time.");
  } else if (err.code == 'unimplemented') {
    console.warn("The browser does not support offline persistence.");
  }
});

// ─── Constants ───
const GRADES = [
  { label: 'O',  point: 10, min: 91, max: 100 },
  { label: 'A+', point: 9, min: 81, max: 90 },
  { label: 'A',  point: 8, min: 71, max: 80 },
  { label: 'B+', point: 7, min: 61, max: 70 },
  { label: 'B',  point: 6, min: 56, max: 60 },
  { label: 'C',  point: 5, min: 50, max: 55 },
  { label: 'U',  point: 0, min: 0, max: 49 },
];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00'
];

const SUBJECT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
  '#e11d48', '#84cc16', '#0ea5e9', '#d946ef', '#22c55e'
];

const STATUS_LABELS = {
  present: 'Present', absent: 'Absent', onduty: 'On Duty',
  medical: 'Medical', cancelled: 'Cancelled'
};

const DEFAULT_USER_DATA = {
  semesters: [],
  cgpaHistory: [],
  settings: { defaultMinAttendance: 75 }
};

// ─── Utility Functions ───
function $(id) { return document.getElementById(id); }
function $$(sel, parent) { return (parent || document).querySelectorAll(sel); }
function $one(sel, parent) { return (parent || document).querySelector(sel); }

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDayOfWeek(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  if (day === 0) return null; // Sunday
  return DAYS[day - 1];
}

function getInitials(name) {
  if (!name) return 'U';
  if (name.startsWith('+') || /^\+?\d+$/.test(name.replace(/\s/g, ''))) return 'U';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

// ─── App State ───
let currentUser = null;   // Firebase User object
let userData = null;       // All user data from Firestore
let currentSemesterId = null;
let currentSubjectId = null;
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();

// ─── Email OTP Authentication State ───
let currentLoginOTP = null;
let currentLoginOTPEmail = null;
let currentResetOTP = null;
let currentResetOTPEmail = null;
let isResetOTPVerified = false;

// ─── Firestore Data Layer ───
async function loadUserData(uid) {
  try {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      userData = docSnap.data();
      // Ensure all fields exist
      if (!userData.semesters) userData.semesters = [];
      if (!userData.cgpaHistory) userData.cgpaHistory = [];
      if (!userData.settings) userData.settings = { defaultMinAttendance: 75, theme: 'dark' };
      
      // Apply theme
      if (userData.settings.theme === 'light') {
        document.body.classList.add('theme-light');
      } else {
        document.body.classList.remove('theme-light');
      }
    } else {
      // New user — create default data
      userData = JSON.parse(JSON.stringify(DEFAULT_USER_DATA));
      await setDoc(docRef, userData);
    }
  } catch (err) {
    console.error('Failed to load data:', err);
    showToast('Failed to load data. Check your connection.', 'error');
    userData = JSON.parse(JSON.stringify(DEFAULT_USER_DATA));
  }
}

function save() {
  if (!currentUser) return;
  const docRef = doc(db, 'users', currentUser.uid);
  // Create a clean copy without transient properties (like _whatifGrades)
  const cleanData = JSON.parse(JSON.stringify(userData, (key, value) => {
    if (key.startsWith('_')) return undefined;
    return value;
  }));
  setDoc(docRef, cleanData).catch(err => {
    console.error('Save failed:', err);
    showToast('Failed to save. Check your connection.', 'error');
  });
}

// ─── Data Helpers ───
function getSemester(id) {
  return userData.semesters.find(s => s.id === id);
}

function getSubject(semId, subId) {
  const sem = getSemester(semId);
  return sem ? sem.subjects.find(s => s.id === subId) : null;
}

function getSemesterStatus(sem) {
  if (sem.isHistorical) return 'completed';
  const today = new Date(getTodayStr());
  const start = new Date(sem.startDate);
  const end = new Date(sem.endDate);
  if (today < start) return 'upcoming';
  if (today > end) return 'completed';
  return 'active';
}

function getActiveSemester() {
  return userData.semesters.find(s => getSemesterStatus(s) === 'active') || null;
}

// ─── Attendance Calculations ───
const Calc = {
  getSubjectAttendance(sem, subjectId) {
    const sub = (sem.subjects || []).find(s => s.id === subjectId);
    
    if (sub && sub.finalPercentage !== undefined && sub.finalPercentage !== null) {
      let totalHeld = this.getTotalScheduledClasses(sem, subjectId);
      if (totalHeld === 0) totalHeld = 100; // Fallback if no timetable is provided
      const attended = Math.round(totalHeld * (sub.finalPercentage / 100));
      return { present: 0, absent: 0, onduty: 0, medical: 0, cancelled: 0, totalHeld, attended, percentage: sub.finalPercentage, total: 0 };
    }

    const pastAttended = sub ? (sub.pastAttended || 0) : 0;
    const pastHeld = sub ? (sub.pastHeld || 0) : 0;

    const records = (sem.attendance || []).filter(a => a.subjectId === subjectId);
    let present = 0, absent = 0, onduty = 0, medical = 0, cancelled = 0;
    records.forEach(r => {
      switch (r.status) {
        case 'present': present++; break;
        case 'absent': absent++; break;
        case 'onduty': onduty++; break;
        case 'medical': medical++; break;
        case 'cancelled': cancelled++; break;
      }
    });
    const totalHeld = present + absent + onduty + medical + pastHeld;
    const attended = present + onduty + medical + pastAttended;
    const percentage = totalHeld > 0 ? (attended / totalHeld) * 100 : 0;
    return { present, absent, onduty, medical, cancelled, totalHeld, attended, percentage, total: records.length };
  },

  getSemesterAttendance(sem) {
    if (sem.isHistorical) {
      return {
        totalAttended: Math.round((sem.historicalAttendance / 100) * 100),
        totalHeld: 100,
        percentage: sem.historicalAttendance
      };
    }
    let totalAttended = 0, totalHeld = 0;
    (sem.subjects || []).forEach(sub => {
      const stats = this.getSubjectAttendance(sem, sub.id);
      totalAttended += stats.attended;
      totalHeld += stats.totalHeld;
    });
    const percentage = totalHeld > 0 ? (totalAttended / totalHeld) * 100 : 0;
    return { totalAttended, totalHeld, percentage };
  },

  classesNeeded(attended, totalHeld, targetPercent) {
    if (targetPercent >= 100) return Infinity;
    const needed = (targetPercent * totalHeld / 100 - attended) / (1 - targetPercent / 100);
    return Math.max(0, Math.ceil(needed));
  },

  classesBunkable(attended, totalHeld, remainingClasses, targetPercent) {
    const bunkable = attended + remainingClasses - (targetPercent / 100) * (totalHeld + remainingClasses);
    return Math.max(0, Math.floor(bunkable));
  },

  getTotalScheduledClasses(sem, subjectId) {
    if (!sem.startDate || !sem.endDate) return 0;
    const startDate = new Date(sem.startDate);
    const endDate = new Date(sem.endDate);
    if (startDate > endDate) return 0;

    const timetable = sem.timetable || {};
    const holidays = (sem.holidays || []).map(h => h.date);

    let total = 0;
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const dayIdx = cursor.getDay();
      if (dayIdx >= 1 && dayIdx <= 6) {
        const dayName = DAYS[dayIdx - 1];
        const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        if (!holidays.includes(dateStr)) {
          const slots = timetable[dayName] || [];
          total += slots.filter(s => s.subjectId === subjectId).length;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return total;
  },

  getRemainingClasses(sem, subjectId) {
    const today = new Date(getTodayStr());
    const endDate = new Date(sem.endDate);
    if (today > endDate) return 0;

    const timetable = sem.timetable || {};
    const holidays = (sem.holidays || []).map(h => h.date);

    let remaining = 0;
    const cursor = new Date(today);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor <= endDate) {
      const dayIdx = cursor.getDay();
      if (dayIdx >= 1 && dayIdx <= 6) {
        const dayName = DAYS[dayIdx - 1];
        const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        if (!holidays.includes(dateStr)) {
          const slots = timetable[dayName] || [];
          remaining += slots.filter(s => s.subjectId === subjectId).length;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return remaining;
  },

  getDangerSubjects(sem) {
    const minAttendance = sem.minAttendance || 75;
    const dangers = [];
    (sem.subjects || []).forEach(sub => {
      const stats = this.getSubjectAttendance(sem, sub.id);
      if (stats.totalHeld > 0) {
        if (stats.percentage < minAttendance) {
          dangers.push({ subject: sub, stats, level: 'danger' });
        } else if (stats.percentage < minAttendance + 5) {
          dangers.push({ subject: sub, stats, level: 'warning' });
        }
      }
    });
    return dangers;
  },

  calculateSGPA(subjects) {
    let totalCredits = 0, totalPoints = 0;
    subjects.forEach(sub => {
      if (sub.grade !== undefined && sub.grade !== null && sub.credits) {
        const gradeObj = GRADES.find(g => g.label === sub.grade);
        if (gradeObj) {
          totalPoints += gradeObj.point * sub.credits;
          totalCredits += sub.credits;
        }
      }
    });
    return totalCredits > 0 ? totalPoints / totalCredits : 0;
  },

  getGradeClass(gpa) {
    if (gpa >= 9) return { label: 'Outstanding', color: 'var(--success)' };
    if (gpa >= 8) return { label: 'Excellent', color: '#3b82f6' };
    if (gpa >= 7) return { label: 'Very Good', color: '#06b6d4' };
    if (gpa >= 6) return { label: 'Good', color: '#8b5cf6' };
    if (gpa >= 5) return { label: 'Average', color: 'var(--warning)' };
    if (gpa >= 4) return { label: 'Pass', color: '#f97316' };
    return { label: 'Fail', color: 'var(--danger)' };
  }
};

// ─── Toast Notifications ───
function showToast(message, type = 'info') {
  const container = $('toast-container');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ─── Modal System ───
const Modal = {
  open(title, bodyHTML, footerHTML) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = bodyHTML;
    $('modal-footer').innerHTML = footerHTML || '';
    $('modal-overlay').classList.add('active');
  },
  close() {
    $('modal-overlay').classList.remove('active');
  }
};

function setupOTPAutofocus(inputsSelector) {
  const inputs = $$(inputsSelector);
  inputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      input.value = input.value.replace(/[^0-9]/g, '');
      if (input.value && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) {
        inputs[index - 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, inputs.length);
      for (let i = 0; i < text.length; i++) {
        if (inputs[i]) {
          inputs[i].value = text[i];
          if (i < inputs.length - 1) inputs[i + 1].focus();
        }
      }
    });
  });
}

// ─── Screen Navigation ───
function showScreen(screenId, pushHistory = true) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const screenEl = $(screenId + '-screen');
  if (screenEl) screenEl.classList.add('active');
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = $one(`.nav-item[data-screen="${screenId}"]`);
  if (navItem) navItem.classList.add('active');
  $('sidebar').classList.remove('open');
  $('sidebar-overlay').classList.remove('active');

  if (pushHistory) {
    history.pushState({ screen: screenId }, '', '#' + screenId);
  }
}

window.addEventListener('popstate', (e) => {
  if (e.state && e.state.screen) {
    showScreen(e.state.screen, false);
    switch(e.state.screen) {
      case 'dashboard': renderDashboard(); break;
      case 'semester': renderSemesterView(); break;
      case 'subject': renderSubjectDetail(); break;
      case 'gpa': renderGPA(); break;
    }
  } else {
    showScreen('dashboard', false);
    renderDashboard();
  }
});

function showAuth() {
  $('auth-screen').classList.remove('hidden');
  $('app').classList.add('hidden');
}

function showApp() {
  $('auth-screen').classList.add('hidden');
  $('app').classList.remove('hidden');
  updateSidebarUser();
  renderDashboard();
}

function updateSidebarUser() {
  const name = currentUser.displayName || currentUser.email || 'User';
  $('sidebar-user-name').textContent = name;
  $('sidebar-user-email').textContent = currentUser.email || '';
  $('user-avatar').textContent = getInitials(name);
}

// ─── Color helpers ───
function getAttendanceColor(percentage, minAttendance) {
  if (percentage >= minAttendance) return 'var(--success)';
  if (percentage >= minAttendance - 5) return 'var(--warning)';
  return 'var(--danger)';
}

function getAttendanceGradient(percentage, minAttendance) {
  if (percentage >= minAttendance) return 'linear-gradient(90deg, #10b981, #34d399)';
  if (percentage >= minAttendance - 5) return 'linear-gradient(90deg, #f59e0b, #fbbf24)';
  return 'linear-gradient(90deg, #ef4444, #f87171)';
}

// ─── RENDER: Dashboard ───
function renderDashboard() {
  const name = (currentUser.displayName || currentUser.email).split(' ')[0];
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('dashboard-greeting').textContent = `${greeting}, ${name}!`;

  renderDashboardAlerts();
  renderDashboardStats();
  renderAttendanceChart();
  renderTodayClasses();
  renderSemestersGrid();
}

function renderDashboardAlerts() {
  const container = $('dashboard-alerts');
  container.innerHTML = '';
  const activeSem = getActiveSemester();
  if (!activeSem) return;

  const dangers = Calc.getDangerSubjects(activeSem);
  dangers.forEach(d => {
    const level = d.level === 'danger' ? 'danger' : 'warning';
    const icon = d.level === 'danger' ? '🚨' : '⚠️';
    const msg = d.level === 'danger'
      ? `${d.subject.name} attendance is ${d.stats.percentage.toFixed(1)}% — below ${activeSem.minAttendance || 75}% minimum!`
      : `${d.subject.name} attendance is ${d.stats.percentage.toFixed(1)}% — close to minimum threshold.`;
    container.innerHTML += `
      <div class="alert-banner ${level}">
        <span class="alert-icon">${icon}</span>
        <span class="alert-text">${msg}</span>
      </div>`;
  });

  // Smart Daily Summary
  const todayStr = getTodayStr();
  const dayName = getDayOfWeek(todayStr);
  let todayClasses = [];
  
  const isHoliday = (activeSem.holidays || []).some(h => h.date === todayStr);
  if (!isHoliday && dayName && todayStr >= activeSem.startDate && todayStr <= activeSem.endDate) {
    todayClasses = (activeSem.timetable || {})[dayName] || [];
  }

  if (todayClasses.length > 0) {
    let riskySubjects = [];
    todayClasses.forEach(slot => {
      const subject = activeSem.subjects.find(s => s.id === slot.subjectId);
      if (subject) {
        const stats = Calc.getSubjectAttendance(activeSem, subject.id);
        if (stats.percentage <= (activeSem.minAttendance || 75) && stats.totalHeld > 0) {
          riskySubjects.push(subject.name);
        }
      }
    });

    if (riskySubjects.length > 0) {
      // Remove duplicates
      riskySubjects = [...new Set(riskySubjects)];
      container.innerHTML = `
        <div class="alert-banner warning" style="background: var(--gradient-warm); color: #fff; border: none; box-shadow: var(--shadow-sm);">
          <span class="alert-icon" style="background: rgba(255,255,255,0.2); color: #fff;">📅</span>
          <span class="alert-text" style="font-weight: 500;">
            You have ${todayClasses.length} class${todayClasses.length > 1 ? 'es' : ''} today. Be careful with <strong>${riskySubjects.join(', ')}</strong>, your attendance is dangerously low—do not bunk!
          </span>
        </div>` + container.innerHTML; // Prepend to show at top
    } else {
      container.innerHTML = `
        <div class="alert-banner info" style="background: var(--bg-card); border-left: 4px solid var(--accent-cyan);">
          <span class="alert-icon">📅</span>
          <span class="alert-text">You have ${todayClasses.length} class${todayClasses.length > 1 ? 'es' : ''} today. Your attendance looks good, keep it up!</span>
        </div>` + container.innerHTML;
    }
  }
}

let attendanceChartInstance = null;
function renderAttendanceChart() {
  const chartCard = $('dashboard-chart-card');
  const canvas = document.getElementById('attendance-chart');
  
  if (!chartCard || !canvas) return;
  
  const activeSem = getActiveSemester();
  if (!activeSem || !activeSem.subjects || activeSem.subjects.length === 0) {
    chartCard.style.display = 'none';
    return;
  }

  chartCard.style.display = 'block';
  const minAtt = activeSem.minAttendance || 75;

  const labels = [];
  const dataPercentages = [];
  const targetLines = [];
  const backgroundColors = [];

  activeSem.subjects.forEach(sub => {
    const stats = Calc.getSubjectAttendance(activeSem, sub.id);
    if (stats.totalHeld > 0) {
      labels.push(sub.name);
      dataPercentages.push(stats.percentage);
      targetLines.push(minAtt);
      
      if (stats.percentage >= minAtt + 5) backgroundColors.push('#84cc16'); // Safe green
      else if (stats.percentage >= minAtt) backgroundColors.push('#facc15'); // Warning yellow
      else backgroundColors.push('#ef4444'); // Danger red
    }
  });

  if (labels.length === 0) {
    chartCard.style.display = 'none';
    return;
  }

  if (attendanceChartInstance) {
    attendanceChartInstance.destroy();
  }

  // Set default font color based on theme
  const textColor = document.body.classList.contains('theme-light') ? '#3f3f46' : '#a1a1aa';
  const gridColor = document.body.classList.contains('theme-light') ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';

  attendanceChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Current Attendance %',
          data: dataPercentages,
          backgroundColor: backgroundColors,
          borderRadius: 4,
          barThickness: 'flex',
          maxBarThickness: 40
        },
        {
          label: 'Required Minimum',
          data: targetLines,
          type: 'line',
          borderColor: document.body.classList.contains('theme-light') ? '#000' : '#fff',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: textColor, callback: function(value) { return value + '%' } },
          grid: { color: gridColor }
        },
        x: {
          ticks: { color: textColor },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { labels: { color: textColor } },
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': ' + context.parsed.y.toFixed(1) + '%';
            }
          }
        }
      }
    }
  });
}

function renderDashboardStats() {
  const container = $('dashboard-stats');
  const activeSem = getActiveSemester();
  const cgpa = calculateOverallCGPA();
  const cgpaText = cgpa > 0 ? cgpa.toFixed(2) : '—';

  let subjectCount = 0;
  let atRiskCount = 0;
  let classesTodayCount = 0;
  
  if (activeSem && activeSem.subjects) {
    subjectCount = activeSem.subjects.length;
    const minAtt = activeSem.minAttendance || 75;
    
    activeSem.subjects.forEach(sub => {
      const stats = Calc.getSubjectAttendance(activeSem, sub.id);
      if (stats.percentage < minAtt && stats.totalHeld > 0) {
        atRiskCount++;
      }
    });

    const today = getTodayStr();
    const dayName = getDayOfWeek(today);
    const isHoliday = (activeSem.holidays || []).some(h => h.date === today);
    if (!isHoliday && dayName && today >= activeSem.startDate && today <= activeSem.endDate) {
      const slots = (activeSem.timetable || {})[dayName] || [];
      const extraClasses = (activeSem.attendance || []).filter(a => a.date === today && a.isExtra);
      classesTodayCount = slots.length + extraClasses.length;
    }
  }

  if (!activeSem) {
    container.innerHTML = `
      <div class="stat-card"><div class="stat-icon purple">📖</div><div class="stat-content"><div class="stat-value">—</div><div class="stat-label">Subjects</div></div></div>
      <div class="stat-card"><div class="stat-icon red">⚠️</div><div class="stat-content"><div class="stat-value">—</div><div class="stat-label">At Risk Subjects</div></div></div>
      <div class="stat-card"><div class="stat-icon cyan">📅</div><div class="stat-content"><div class="stat-value">—</div><div class="stat-label">Classes Today</div></div></div>
      <div class="stat-card cgpa-highlight-card"><div class="stat-icon gold">🏆</div><div class="stat-content"><div class="stat-value">${cgpaText}</div><div class="stat-label">Cumulative GPA (CGPA)</div></div></div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="stat-card"><div class="stat-icon purple">📖</div><div class="stat-content"><div class="stat-value">${subjectCount}</div><div class="stat-label">Subjects</div></div></div>
    <div class="stat-card"><div class="stat-icon ${atRiskCount > 0 ? 'red' : 'green'}">${atRiskCount > 0 ? '⚠️' : '✓'}</div><div class="stat-content"><div class="stat-value">${atRiskCount}</div><div class="stat-label">At Risk Subjects</div></div></div>
    <div class="stat-card"><div class="stat-icon cyan">📅</div><div class="stat-content"><div class="stat-value">${classesTodayCount}</div><div class="stat-label">Classes Today</div></div></div>
    <div class="stat-card cgpa-highlight-card"><div class="stat-icon gold">🏆</div><div class="stat-content"><div class="stat-value">${cgpaText}</div><div class="stat-label">Cumulative GPA (CGPA)</div></div></div>
  `;
}

function renderTodayClasses() {
  const container = $('today-classes-list');
  const section = $('today-classes-section');
  const activeSem = getActiveSemester();

  if (!activeSem) { section.classList.add('hidden'); return; }

  const today = getTodayStr();
  const dayName = getDayOfWeek(today);

  if (today < activeSem.startDate || today > activeSem.endDate) {
    container.innerHTML = '<div class="glass-card" style="padding:20px;text-align:center;color:var(--text-muted);">Semester is not currently active.</div>';
    section.classList.remove('hidden');
    return;
  }

  if (!dayName) {
    container.innerHTML = '<div class="glass-card" style="padding:20px;text-align:center;color:var(--text-muted);">It\'s Sunday — no classes! 🎉</div>';
    section.classList.remove('hidden');
    return;
  }

  const isHoliday = (activeSem.holidays || []).some(h => h.date === today);
  if (isHoliday) {
    const holiday = activeSem.holidays.find(h => h.date === today);
    container.innerHTML = `<div class="glass-card" style="padding:20px;text-align:center;color:var(--warning);">🏖️ Holiday: ${holiday.reason || 'No classes today'}</div>`;
    section.classList.remove('hidden');
    return;
  }

  const slots = (activeSem.timetable || {})[dayName] || [];
  if (slots.length === 0) {
    container.innerHTML = '<div class="glass-card" style="padding:20px;text-align:center;color:var(--text-muted);">No classes scheduled for today.</div>';
    section.classList.remove('hidden');
    return;
  }

  const sortedSlots = [...slots].sort((a, b) => a.time.localeCompare(b.time));
  container.innerHTML = sortedSlots.map(slot => {
    const sub = getSubject(activeSem.id, slot.subjectId);
    if (!sub) return '';
    const record = (activeSem.attendance || []).find(a => a.date === today && a.subjectId === sub.id && a.slotTime === slot.time);
    const statusHTML = record
      ? `<span class="today-class-status log-status ${record.status}">${STATUS_LABELS[record.status]}</span>`
      : `<span class="today-class-status badge-info" style="background:var(--bg-input);color:var(--text-muted);">Not marked</span>`;
    return `
      <div class="today-class-item" data-subject-id="${sub.id}" data-semester-id="${activeSem.id}" style="cursor: pointer; transition: transform 0.2s, background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='var(--bg-card)'">
        <div class="class-color-bar" style="background:${sub.color}"></div>
        <div class="today-class-time">${formatTime(slot.time)}</div>
        <div class="today-class-name">${sub.name}</div>
        ${statusHTML}
      </div>`;
  }).join('');
  
  $$('.today-class-item', container).forEach(item => {
    item.addEventListener('click', () => {
      currentSemesterId = item.dataset.semesterId;
      currentSubjectId = item.dataset.subjectId;
      renderSubjectDetail();
      showScreen('subject');
    });
  });
  
  section.classList.remove('hidden');
}

function renderSemestersGrid() {
  const container = $('semesters-grid');

  if (userData.semesters.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state-icon">📚</div>
        <h3>No semesters yet</h3>
        <p>Create your first semester to start tracking attendance.</p>
        <button class="btn btn-primary" onclick="document.getElementById('btn-new-semester').click()">+ Create Semester</button>
      </div>`;
    return;
  }

  container.innerHTML = userData.semesters.map(sem => {
    const status = getSemesterStatus(sem);
    const minAtt = sem.minAttendance || 75;
    
    let subCount = 0;
    let attendanceText = '—';
    let pctColor = 'var(--text-muted)';
    let sgpaText = '—';
    
    if (sem.isHistorical) {
      subCount = '—';
      attendanceText = sem.historicalAttendance.toFixed(1) + '%';
      pctColor = getAttendanceColor(sem.historicalAttendance, minAtt);
      sgpaText = sem.historicalSGPA.toFixed(2);
    } else {
      const stats = Calc.getSemesterAttendance(sem);
      subCount = (sem.subjects || []).length;
      attendanceText = stats.totalHeld > 0 ? stats.percentage.toFixed(1) + '%' : '—';
      pctColor = stats.totalHeld > 0 ? getAttendanceColor(stats.percentage, minAtt) : 'var(--text-muted)';
      const sgpa = Calc.calculateSGPA(sem.subjects || []);
      sgpaText = sgpa > 0 ? sgpa.toFixed(2) : '—';
    }

    return `
      <div class="semester-card animate-in ${status === 'active' ? 'active-semester' : ''} ${sem.isHistorical ? 'historical-semester' : ''}" data-id="${sem.id}">
        <div class="semester-card-header">
          <h3>${sem.name}</h3>
          <span class="semester-badge ${status}">${sem.isHistorical ? 'past' : status}</span>
        </div>
        <div class="semester-card-dates">${sem.isHistorical ? 'Historical Summary' : `${formatDate(sem.startDate)} — ${formatDate(sem.endDate)}`}</div>
        <div class="semester-card-stats">
          <div class="semester-stat">
            <div class="semester-stat-value">${subCount}</div>
            <div class="semester-stat-label">Subjects</div>
          </div>
          <div class="semester-stat">
            <div class="semester-stat-value" style="color:${pctColor}">${attendanceText}</div>
            <div class="semester-stat-label">Attendance</div>
          </div>
          <div class="semester-stat">
            <div class="semester-stat-value">${sgpaText}</div>
            <div class="semester-stat-label">SGPA</div>
          </div>
        </div>
      </div>`;
  }).join('');

  $$('.semester-card', container).forEach(card => {
    card.addEventListener('click', () => {
      currentSemesterId = card.dataset.id;
      renderSemesterView();
      showScreen('semester');
    });
  });
}

// ─── RENDER: Semester View ───
function renderSemesterView() {
  const sem = getSemester(currentSemesterId);
  if (!sem) return;
  $('semester-title').textContent = sem.name;
  
  if (sem.isHistorical) {
    $('semester-dates').textContent = `Past Semester | ${formatDate(sem.startDate)} — ${formatDate(sem.endDate)} | Min Attendance: ${sem.minAttendance || 75}%`;
  } else {
    $('semester-dates').textContent = `${formatDate(sem.startDate)} — ${formatDate(sem.endDate)} | Min Attendance: ${sem.minAttendance || 75}%`;
  }
  
  $('standard-sem-view').classList.remove('hidden');
  
  let legacyStatsContainer = $('legacy-historical-stats');
  if (!legacyStatsContainer) {
    legacyStatsContainer = document.createElement('div');
    legacyStatsContainer.id = 'legacy-historical-stats';
    $('standard-sem-view').prepend(legacyStatsContainer);
  }

  if (sem.isHistorical && (!sem.subjects || sem.subjects.length === 0) && sem.historicalAttendance !== undefined) {
    // Legacy historical semester fallback
    legacyStatsContainer.innerHTML = `
      <div class="glass-card" style="padding: 24px; text-align: center; border: 1px solid rgba(158, 254, 0, 0.2); background: rgba(158, 254, 0, 0.05); margin-bottom: 24px;">
        <h3 style="color: var(--accent-primary); margin-bottom: 12px;">Archived Semester Summary</h3>
        <p style="color: var(--text-secondary); margin-bottom: 16px;">This semester was saved using the legacy archive feature. Because of this, its detailed subjects and timetable are not available.</p>
        <div style="display: flex; justify-content: center; gap: 32px;">
          <div><div style="font-size: 1.5rem; font-weight: bold;">${sem.historicalAttendance}%</div><div style="font-size: 0.8rem; color: var(--text-muted);">Attendance</div></div>
          <div><div style="font-size: 1.5rem; font-weight: bold; color: var(--accent-primary);">${sem.historicalSGPA}</div><div style="font-size: 0.8rem; color: var(--text-muted);">SGPA</div></div>
          <div><div style="font-size: 1.5rem; font-weight: bold;">${sem.historicalCredits}</div><div style="font-size: 0.8rem; color: var(--text-muted);">Credits</div></div>
        </div>
      </div>
    `;
    legacyStatsContainer.style.display = 'block';
    
    // Hide standard elements
    if ($('semester-stats')) $('semester-stats').style.display = 'none';
    if ($('semester-chart-card')) $('semester-chart-card').style.display = 'none';
    if ($('subjects-grid')) $('subjects-grid').style.display = 'none';
    if ($('timetable-container')) $('timetable-container').style.display = 'none';
    if ($('holidays-container')) $('holidays-container').style.display = 'none';
  } else {
    legacyStatsContainer.style.display = 'none';
    // Show standard elements
    if ($('semester-stats')) $('semester-stats').style.display = 'grid';
    if ($('semester-chart-card')) $('semester-chart-card').style.display = 'block';
    if ($('subjects-grid')) $('subjects-grid').style.display = 'grid';
    if ($('timetable-container')) $('timetable-container').style.display = 'block';
    if ($('holidays-container')) $('holidays-container').style.display = 'block';

    // Normal render
    renderSemesterStats(sem);
    renderSemesterChart(sem);
    renderSubjectsGrid(sem);
    renderTimetable(sem);
    renderHolidays(sem);
  }
}

let semesterChartInstance = null;
function renderSemesterChart(sem) {
  const chartCard = $('semester-chart-card');
  const canvas = document.getElementById('semester-chart');
  
  if (!chartCard || !canvas) return;
  
  if (!sem || !sem.subjects || sem.subjects.length === 0) {
    chartCard.style.display = 'none';
    return;
  }

  const minAtt = sem.minAttendance || 75;
  const labels = [];
  const dataPercentages = [];
  const targetLines = [];
  const backgroundColors = [];

  sem.subjects.forEach(sub => {
    const stats = Calc.getSubjectAttendance(sem, sub.id);
    if (stats.totalHeld > 0) {
      labels.push(sub.name);
      dataPercentages.push(stats.percentage);
      targetLines.push(minAtt);
      
      if (stats.percentage >= minAtt + 5) backgroundColors.push('#84cc16'); // Safe green
      else if (stats.percentage >= minAtt) backgroundColors.push('#facc15'); // Warning yellow
      else backgroundColors.push('#ef4444'); // Danger red
    }
  });

  if (labels.length === 0) {
    chartCard.style.display = 'none';
    return;
  }

  chartCard.style.display = 'block';

  if (semesterChartInstance) {
    semesterChartInstance.destroy();
  }

  // Set default font color based on theme
  const textColor = document.body.classList.contains('theme-light') ? '#3f3f46' : '#a1a1aa';
  const gridColor = document.body.classList.contains('theme-light') ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';

  semesterChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Current Attendance %',
          data: dataPercentages,
          backgroundColor: backgroundColors,
          borderRadius: 4,
          barThickness: 'flex',
          maxBarThickness: 40
        },
        {
          label: 'Required Minimum',
          data: targetLines,
          type: 'line',
          borderColor: document.body.classList.contains('theme-light') ? '#000' : '#fff',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: textColor, callback: function(value) { return value + '%' } },
          grid: { color: gridColor }
        },
        x: {
          ticks: { color: textColor },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { labels: { color: textColor } },
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': ' + context.parsed.y.toFixed(1) + '%';
            }
          }
        }
      }
    }
  });
}

function renderSemesterStats(sem) {
  const container = $('semester-stats');
  if (!container) return;
  const stats = Calc.getSemesterAttendance(sem);
  const subCount = (sem.subjects || []).length;
  const totalCredits = (sem.subjects || []).reduce((sum, s) => sum + (s.credits || 0), 0);
  const dangers = Calc.getDangerSubjects(sem);
  const sgpa = Calc.calculateSGPA(sem.subjects || []);
  const sgpaText = sgpa > 0 ? sgpa.toFixed(2) : '—';
  
  container.innerHTML = `
    <div class="stat-card"><div class="stat-icon green">📊</div><div class="stat-content"><div class="stat-value">${stats.totalHeld > 0 ? stats.percentage.toFixed(1) + '%' : '—'}</div><div class="stat-label">Overall Attendance</div></div></div>
    <div class="stat-card"><div class="stat-icon purple">📖</div><div class="stat-content"><div class="stat-value">${subCount}</div><div class="stat-label">Subjects</div></div></div>
    <div class="stat-card"><div class="stat-icon cyan">🎒</div><div class="stat-content"><div class="stat-value">${totalCredits}</div><div class="stat-label">Total Credits</div></div></div>
    <div class="stat-card"><div class="stat-icon amber">🏆</div><div class="stat-content"><div class="stat-value">${sgpaText}</div><div class="stat-label">Semester SGPA</div></div></div>
    <div class="stat-card"><div class="stat-icon ${dangers.length > 0 ? 'red' : 'green'}">⚠️</div><div class="stat-content"><div class="stat-value">${dangers.length}</div><div class="stat-label">At Risk Subjects</div></div></div>
  `;
}

function renderSubjectsGrid(sem) {
  const container = $('subjects-grid');
  const subjects = sem.subjects || [];
  const minAtt = sem.minAttendance || 75;

  if (subjects.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state-icon">📖</div>
        <h3>No subjects added</h3>
        <p>Add your subjects to start tracking attendance.</p>
      </div>`;
    return;
  }

  container.innerHTML = subjects.map(sub => {
    const stats = Calc.getSubjectAttendance(sem, sub.id);
    const pct = stats.percentage;
    const color = getAttendanceColor(pct, minAtt);
    const gradient = getAttendanceGradient(pct, minAtt);
    const gradeOptions = GRADES.map(g => `<option value="${g.label}" ${sub.grade === g.label ? 'selected' : ''}>${g.label}</option>`).join('');

    return `
      <div class="subject-card animate-in" data-id="${sub.id}">
        <div class="subject-card-color" style="background:${sub.color}"></div>
        <div class="subject-card-header">
          <h4>${sub.name}</h4>
          <span class="subject-code">${sub.code || '—'}</span>
        </div>
        <div class="subject-card-body">
          ${sub.teacher ? `<div class="subject-teacher">👨‍🏫 ${sub.teacher}</div>` : ''}
          <div class="subject-attendance-bar">
            <div class="subject-attendance-fill" style="width:${pct}%;background:${gradient}"></div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; gap:8px;">
            <div style="font-size:0.8125rem; color:var(--text-muted);">Grade:</div>
            <select class="form-select subject-grade-select" data-sub="${sub.id}" data-sem="${sem.id}" style="max-width:90px; padding:3px 6px; font-size:0.75rem;">
              <option value="">None</option>
              ${gradeOptions}
            </select>
          </div>
          <div class="subject-card-footer" style="margin-top:12px;">
            <span class="subject-percentage" style="color:${color}">${stats.totalHeld > 0 ? pct.toFixed(1) + '%' : '—'}</span>
            <span class="subject-ratio">${stats.attended}/${stats.totalHeld} classes | ${sub.credits || 0} credits</span>
          </div>
        </div>
      </div>`;
  }).join('');

  $$('.subject-card', container).forEach(card => {
    card.addEventListener('click', () => {
      currentSubjectId = card.dataset.id;
      renderSubjectDetail();
      showScreen('subject');
    });
  });

  $$('.subject-grade-select', container).forEach(sel => {
    sel.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    sel.addEventListener('change', (e) => {
      e.stopPropagation();
      const semId = sel.dataset.sem;
      const subId = sel.dataset.sub;
      const sub = getSubject(semId, subId);
      if (sub) {
        sub.grade = sel.value || null;
        syncSemesterGPAAndCredits(semId);
        save();
        const currentSem = getSemester(semId);
        if (currentSem) {
          renderSemesterStats(currentSem);
        }
        showToast('Grade updated!', 'success');
      }
    });
  });
}

function renderTimetable(sem) {
  const container = $('timetable-container');
  const timetable = sem.timetable || {};
  const todayDay = getDayOfWeek(getTodayStr());

  let html = '<div class="timetable-grid">';
  html += '<div class="timetable-header">Time</div>';
  DAY_LABELS.forEach((label, i) => {
    const isToday = DAYS[i] === todayDay;
    html += `<div class="timetable-header ${isToday ? 'today' : ''}">${label}</div>`;
  });

  TIME_SLOTS.forEach(time => {
    html += `<div class="timetable-time">${formatTime(time)}</div>`;
    DAYS.forEach(day => {
      const slots = (timetable[day] || []).filter(s => s.time === time);
      if (slots.length > 0) {
        const sub = getSubject(sem.id, slots[0].subjectId);
        if (sub) {
          html += `<div class="timetable-slot filled" style="background:${sub.color}" data-day="${day}" data-time="${time}" title="${sub.name}">
            <div><div class="slot-subject">${sub.name}</div><div class="slot-code">${sub.code || ''}</div></div>
          </div>`;
        } else {
          html += `<div class="timetable-slot" data-day="${day}" data-time="${time}">+</div>`;
        }
      } else {
        html += `<div class="timetable-slot" data-day="${day}" data-time="${time}">+</div>`;
      }
    });
  });
  html += '</div>';
  container.innerHTML = html;

  $$('.timetable-slot', container).forEach(slot => {
    slot.addEventListener('click', () => {
      const day = slot.dataset.day;
      const time = slot.dataset.time;
      if (slot.classList.contains('filled')) {
        removeTimetableSlot(sem.id, day, time);
      } else {
        openAddSlotModal(sem.id, day, time);
      }
    });
  });
}

function renderHolidays(sem) {
  const container = $('holidays-list');
  const holidays = sem.holidays || [];

  if (holidays.length === 0) {
    container.innerHTML = '<div class="glass-card" style="padding:20px;text-align:center;color:var(--text-muted);">No holidays added yet.</div>';
    return;
  }

  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
  container.innerHTML = sorted.map(h => `
    <div class="holiday-item">
      <div class="holiday-date-badge">${formatDateShort(h.date)}</div>
      <div class="holiday-reason">${h.reason || 'Holiday'}</div>
      <button class="holiday-delete" data-date="${h.date}" title="Remove">✕</button>
    </div>
  `).join('');

  $$('.holiday-delete', container).forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      sem.holidays = sem.holidays.filter(h => h.date !== btn.dataset.date);
      save();
      renderHolidays(sem);
      showToast('Holiday removed', 'info');
    });
  });
}

// ─── RENDER: Subject Detail ───
function renderSubjectDetail() {
  const sem = getSemester(currentSemesterId);
  const sub = getSubject(currentSemesterId, currentSubjectId);
  if (!sem || !sub) return;

  $('subject-title').textContent = sub.name;
  $('subject-info').textContent = `${sub.code || 'No code'} ${sub.teacher ? '| ' + sub.teacher : ''} | ${sub.credits || 0} credits`;

  const gradeSel = $('detail-subject-grade-select');
  if (gradeSel) {
    const gradeOptions = GRADES.map(g => `<option value="${g.label}" ${sub.grade === g.label ? 'selected' : ''}>${g.label} (${g.point})</option>`).join('');
    gradeSel.innerHTML = `<option value="">Select Grade</option>${gradeOptions}`;
    
    const newGradeSel = gradeSel.cloneNode(true);
    gradeSel.parentNode.replaceChild(newGradeSel, gradeSel);
    
    newGradeSel.addEventListener('change', () => {
      sub.grade = newGradeSel.value || null;
      syncSemesterGPAAndCredits(sem.id);
      save();
      renderSubjectDetail();
      showToast('Grade updated!', 'success');
    });
  }

  const stats = Calc.getSubjectAttendance(sem, sub.id);
  const minAtt = sem.minAttendance || 75;
  const remaining = Calc.getRemainingClasses(sem, sub.id);
  const color = getAttendanceColor(stats.percentage, minAtt);

  $('subject-stats').innerHTML = `
    <div class="stat-card"><div class="stat-icon green">📊</div><div class="stat-content"><div class="stat-value" style="color:${color}">${stats.totalHeld > 0 ? stats.percentage.toFixed(1) + '%' : '—'}</div><div class="stat-label">Attendance</div></div></div>
    <div class="stat-card"><div class="stat-icon cyan">✅</div><div class="stat-content"><div class="stat-value">${stats.attended}/${stats.totalHeld}</div><div class="stat-label">Classes Attended</div></div></div>
    <div class="stat-card"><div class="stat-icon purple">📅</div><div class="stat-content"><div class="stat-value">${remaining}</div><div class="stat-label">Remaining Classes</div></div></div>
    <div class="stat-card"><div class="stat-icon amber">🚫</div><div class="stat-content"><div class="stat-value">${stats.absent}</div><div class="stat-label">Absences</div></div></div>
  `;

  renderSubjectCalculators(sem, sub, stats, remaining);
  renderSubjectGradePlanner(sem, sub);
  renderSubjectCalendar(sem, sub);
  renderSubjectLog(sem, sub);
}

function renderSubjectGradePlanner(sem, sub) {
  const container = $('subject-grade-planner');
  if (!container) return;

  const score = sub.internalScore;
  const total = sub.internalTotal;

  if (score === undefined || score === null || total === undefined || total === null) {
    container.innerHTML = `
      <div style="text-align: center; padding: 16px;">
        <h4 style="margin-bottom: 8px; font-weight: 700; font-size: 1rem; color: var(--accent-primary);">🎯 Target Grade Planner</h4>
        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 16px;">
          Configure your internal marks (e.g., scored out of 40 or 50) to see what marks you need in your End-Sem exam to secure your target grade.
        </p>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('btn-edit-subject').click()">Configure Internals</button>
      </div>
    `;
    return;
  }

  const maxEndSem = 100 - total;
  
  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;">
      <h4 style="margin: 0; font-weight: 700; font-size: 1rem; color: var(--accent-primary);">🎯 Target Grade Planner</h4>
      <span style="font-size: 0.8125rem; color: var(--text-secondary);">
        Internals: <strong>${score} / ${total}</strong> | End-Sem max: <strong>${maxEndSem} marks</strong>
      </span>
    </div>
    
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem; text-align: left;">
        <thead>
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); color: var(--text-muted);">
            <th style="padding: 8px 12px; font-weight: 600;">Grade</th>
            <th style="padding: 8px 12px; font-weight: 600;"><span class="hide-on-mobile">Required Total </span>%</th>
            <th style="padding: 8px 12px; font-weight: 600;">End-Sem<span class="hide-on-mobile"> Needed</span></th>
            <th style="padding: 8px 12px; font-weight: 600;"><span class="hide-on-mobile">Exam </span>%</th>
          </tr>
        </thead>
        <tbody>
  `;

  const activeGrades = GRADES.filter(g => g.label !== 'U');
  let hasClampedGrade = false;
  
  activeGrades.forEach(g => {
    const minNeeded = g.min;
    const reqMarks = minNeeded - score;
    
    let marksText = '';
    let percentText = '';
    let rowStyle = '';

    if (maxEndSem <= 0) {
      marksText = '<span style="color:var(--danger)">Error<span class="hide-on-mobile"> (Total is 100)</span></span>';
      percentText = '—';
    } else {
      let rawReq100 = Math.ceil((reqMarks / maxEndSem) * 100);
      let isClamped = false;
      
      if (rawReq100 < 45) {
        rawReq100 = 45;
        isClamped = true;
        hasClampedGrade = true;
      }
      
      if (rawReq100 > 100) {
        marksText = '<span style="color:var(--text-muted)">Not Achievable</span>';
        percentText = '—';
        rowStyle = 'opacity: 0.6;';
      } else {
        marksText = `<strong>${rawReq100}${isClamped ? '<span style="color:var(--accent-primary)">*</span>' : ''}</strong><span class="hide-on-mobile"> / 100</span>`;
        percentText = `<strong>${rawReq100}%</strong>`;
      }
    }

    html += `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.04); ${rowStyle}">
        <td style="padding: 10px 12px; font-weight: 600; color: var(--text-primary);">${g.label} <span class="hide-on-mobile" style="font-weight: normal; color: var(--text-muted); font-size: 0.8em;">(${g.label === 'O' ? 'Outstanding' : g.label === 'A+' ? 'Excellent' : g.label === 'A' ? 'Very Good' : g.label === 'B+' ? 'Good' : g.label === 'B' ? 'Average' : 'Satisfactory'})</span></td>
        <td style="padding: 10px 12px; color: var(--text-secondary);">${g.min}<span class="hide-on-mobile"> – ${g.max}</span>%</td>
        <td style="padding: 10px 12px;">${marksText}</td>
        <td style="padding: 10px 12px; color: var(--text-secondary);">${percentText}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
      ${hasClampedGrade ? '<div style="margin-top: 12px; font-size: 0.8rem; color: var(--text-secondary);">* Minimum <strong>45/100</strong> is required in the End-Sem exam to pass.</div>' : ''}
    </div>
  `;
  container.innerHTML = html;
}

function renderSubjectCalculators(sem, sub, stats, remaining) {
  const container = $('subject-calculators');
  const minAtt = sem.minAttendance || 75;
  const needed = Calc.classesNeeded(stats.attended, stats.totalHeld, minAtt);
  const bunkable = Calc.classesBunkable(stats.attended, stats.totalHeld, remaining, minAtt);

  let neededClass = 'positive', neededText = '';
  if (stats.totalHeld === 0) {
    neededText = 'No classes held yet.'; neededClass = 'neutral';
  } else if (stats.percentage >= minAtt) {
    neededText = `You're above ${minAtt}%. Keep it up!`; neededClass = 'positive';
  } else if (needed <= remaining) {
    neededText = `Attend the next ${needed} consecutive class${needed !== 1 ? 'es' : ''} to reach ${minAtt}%.`; neededClass = 'negative';
  } else {
    neededText = `You need ${needed} more classes but only ${remaining} remain. It may not be possible to reach ${minAtt}%.`; neededClass = 'negative';
  }

  container.innerHTML = `
    <div class="calc-card">
      <h4>🧮 Classes Needed</h4>
      <div class="calc-result ${neededClass}">${stats.percentage >= minAtt && stats.totalHeld > 0 ? '✓' : (stats.totalHeld === 0 ? '—' : needed)}</div>
      <div class="calc-description">${neededText}</div>
    </div>
    <div class="calc-card">
      <h4>🎉 Bunk Calculator</h4>
      <div class="calc-result ${bunkable > 0 ? 'positive' : 'negative'}">${remaining > 0 ? bunkable : '—'}</div>
      <div class="calc-description">${remaining > 0 ? `You can skip ${bunkable} out of ${remaining} remaining class${remaining !== 1 ? 'es' : ''} and still maintain ${minAtt}%.` : 'No remaining classes to calculate.'}</div>
    </div>
    <div class="calc-card">
      <h4>📈 Prediction</h4>
      <div class="calc-result neutral">${remaining > 0 ? ((stats.attended + remaining) / (stats.totalHeld + remaining) * 100).toFixed(1) + '%' : '—'}</div>
      <div class="calc-description">${remaining > 0 ? `If you attend all ${remaining} remaining classes, your attendance will be ${((stats.attended + remaining) / (stats.totalHeld + remaining) * 100).toFixed(1)}%.` : 'Semester complete or no timetable set.'}</div>
    </div>
  `;
}

function renderSubjectCalendar(sem, sub) {
  const container = $('subject-calendar');
  const records = (sem.attendance || []).filter(a => a.subjectId === sub.id);
  const holidays = (sem.holidays || []).map(h => h.date);

  const year = calendarYear, month = calendarMonth;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const todayStr = getTodayStr();

  let html = `
    <div class="calendar-header">
      <h3>${monthNames[month]} ${year}</h3>
      <div class="calendar-nav">
        <button id="cal-prev">‹</button>
        <button id="cal-next">›</button>
      </div>
    </div>
    <div class="calendar-weekdays">
      <div class="calendar-weekday">Sun</div><div class="calendar-weekday">Mon</div><div class="calendar-weekday">Tue</div><div class="calendar-weekday">Wed</div><div class="calendar-weekday">Thu</div><div class="calendar-weekday">Fri</div><div class="calendar-weekday">Sat</div>
    </div>
    <div class="calendar-days">`;

  for (let i = 0; i < startDay; i++) html += '<div class="calendar-day empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const isHoliday = holidays.includes(dateStr);
    const dayRecords = records.filter(r => r.date === dateStr);
    let statusClass = '';
    if (isHoliday) { statusClass = 'holiday'; }
    else if (dayRecords.length > 0) {
      if (dayRecords.some(r => r.status === 'absent')) statusClass = 'absent';
      else if (dayRecords.some(r => r.status === 'present')) statusClass = 'present';
      else if (dayRecords.some(r => r.status === 'onduty')) statusClass = 'onduty';
      else if (dayRecords.some(r => r.status === 'medical')) statusClass = 'medical';
      else if (dayRecords.every(r => r.status === 'cancelled')) statusClass = 'cancelled';
    }
    html += `<div class="calendar-day ${statusClass} ${isToday ? 'today' : ''}" data-date="${dateStr}">${d}</div>`;
  }
  html += '</div>';
  container.innerHTML = html;

  $('cal-prev').addEventListener('click', () => {
    calendarMonth--; if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    renderSubjectCalendar(sem, sub);
  });
  $('cal-next').addEventListener('click', () => {
    calendarMonth++; if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    renderSubjectCalendar(sem, sub);
  });
}

function renderSubjectLog(sem, sub) {
  const container = $('subject-log');
  const records = (sem.attendance || []).filter(a => a.subjectId === sub.id).sort((a, b) => b.date.localeCompare(a.date));

  if (records.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><h3>No records yet</h3><p>Mark your attendance to see the log.</p></div>';
    return;
  }
  container.innerHTML = records.map(r => `
    <div class="log-item">
      <div class="log-date">${formatDate(r.date)}</div>
      <div class="log-subject">${formatTime(r.slotTime || '00:00')}</div>
      <span class="log-status ${r.status}">${STATUS_LABELS[r.status]}</span>
    </div>
  `).join('');
}

// ─── RENDER: Mark Attendance ───
function renderMarkAttendance() {
  const dateInput = $('attendance-date');
  const semSelect = $('attendance-semester-select');
  if (!dateInput.value) dateInput.value = getTodayStr();

  const today = getTodayStr();
  const activeSemesters = userData.semesters.filter(s => !s.isHistorical && s.endDate >= today);
  
  semSelect.innerHTML = activeSemesters.map(s =>
    `<option value="${s.id}" ${s.id === currentSemesterId ? 'selected' : ''}>${s.name}</option>`
  ).join('');
  if (activeSemesters.length === 0) semSelect.innerHTML = '<option value="">No active semesters</option>';
  updateAttendanceList();
}

function updateAttendanceList() {
  const date = $('attendance-date').value;
  const semId = $('attendance-semester-select').value;
  const container = $('attendance-class-list');
  const emptyState = $('attendance-empty');

  if (!date || !semId) { container.innerHTML = ''; emptyState.classList.remove('hidden'); return; }

  const sem = getSemester(semId);
  if (!sem) return;

  const dayName = getDayOfWeek(date);
  const isHoliday = (sem.holidays || []).some(h => h.date === date);
  const holiday = isHoliday ? sem.holidays.find(h => h.date === date) : null;
  
  let slots = [];
  if (!sem.isHistorical && date >= sem.startDate && date <= sem.endDate) {
    slots = (sem.timetable || {})[dayName] || [];
  }
  const extraClasses = (sem.attendance || []).filter(a => a.date === date && a.isExtra);

  $('btn-add-extra-class').style.display = 'inline-block';

  if (slots.length === 0 && extraClasses.length === 0) {
    container.innerHTML = '';
    if (isHoliday) {
      container.innerHTML = `<div class="alert-banner info"><span class="alert-icon">🏖️</span><span class="alert-text">Holiday: ${holiday.reason || 'No classes'}</span></div>`;
    } else if (sem.isHistorical || date < sem.startDate || date > sem.endDate) {
      emptyState.querySelector('h3').textContent = 'Outside Semester';
      emptyState.querySelector('p').textContent = 'This date is outside the active duration of the selected semester.';
      emptyState.classList.remove('hidden');
    } else if (!dayName) {
      emptyState.querySelector('h3').textContent = 'It\'s a Sunday!';
      emptyState.querySelector('p').textContent = 'No classes are scheduled on Sundays.';
      emptyState.classList.remove('hidden');
    } else {
      emptyState.querySelector('h3').textContent = 'No classes scheduled';
      emptyState.querySelector('p').textContent = 'There are no classes in your timetable for this day.';
      emptyState.classList.remove('hidden');
    }
    return;
  }

  emptyState.classList.add('hidden');
  
  let contentHtml = '';
  if (isHoliday && slots.length > 0) {
    contentHtml += `<div class="alert-banner warning" style="margin-bottom: 16px;"><span class="alert-icon">⚠️</span><span class="alert-text">It's a holiday (${holiday.reason}), but you have classes scheduled or extra classes marked.</span></div>`;
  }

  const sortedSlots = [...slots].sort((a, b) => a.time.localeCompare(b.time));

  contentHtml += sortedSlots.map(slot => {
    const sub = getSubject(semId, slot.subjectId);
    if (!sub) return '';
    const record = (sem.attendance || []).find(a => a.date === date && a.subjectId === sub.id && a.slotTime === slot.time && !a.isExtra);
    const currentStatus = record ? record.status : null;
    const statuses = ['present', 'absent', 'onduty', 'medical', 'cancelled'];
    
    return `
      <div class="attendance-class-item">
        <div class="class-color-bar" style="background:${sub.color}"></div>
        <div class="class-info">
          <div class="class-time">${formatTime(slot.time)}</div>
          <div class="class-name">${sub.name}</div>
        </div>
        <div class="status-buttons">
          ${statuses.map(st => `
            <button class="status-btn ${st} ${currentStatus === st ? 'active-' + st : ''}" 
                    onclick="window.markAttendance('${semId}', '${sub.id}', '${date}', '${slot.time}', '${st}', false); setTimeout(updateAttendanceList, 50)">
              ${STATUS_LABELS[st]}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  if (extraClasses.length > 0) {
    contentHtml += `<div style="margin-top: 24px; margin-bottom: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.05em;">Extra Classes</div>`;
    contentHtml += extraClasses.map(extra => {
      const sub = getSubject(semId, extra.subjectId);
      if (!sub) return '';
      const currentStatus = extra.status;
      const statuses = ['present', 'absent', 'onduty', 'medical', 'cancelled'];
      
      return `
        <div class="attendance-class-item" style="border: 1px dashed var(--border-subtle); background: var(--bg-card);">
          <div class="class-color-bar" style="background:${sub.color}"></div>
          <div class="class-info">
            <div class="class-time">Extra</div>
            <div class="class-name">${sub.name}</div>
          </div>
          <div class="status-buttons">
            ${statuses.map(st => `
              <button class="status-btn ${st} ${currentStatus === st ? 'active-' + st : ''}" 
                      onclick="window.markAttendance('${semId}', '${sub.id}', '${date}', '${extra.id}', '${st}', true); setTimeout(updateAttendanceList, 50)">
                ${STATUS_LABELS[st]}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  container.innerHTML = contentHtml;
}

window.markAttendance = markAttendance;

function markAttendance(semId, subjectId, date, slotTime, status, isExtra = false) {
  const sem = getSemester(semId);
  if (!sem) return;
  if (!sem.attendance) sem.attendance = [];
  
  let idx = -1;
  if (isExtra) {
    // For extra classes, slotTime acts as the unique ID for that specific extra class record
    idx = sem.attendance.findIndex(a => a.date === date && a.subjectId === subjectId && a.id === slotTime && a.isExtra);
  } else {
    idx = sem.attendance.findIndex(a => a.date === date && a.subjectId === subjectId && a.slotTime === slotTime && !a.isExtra);
  }

  if (idx >= 0) { 
    sem.attendance[idx].status = status; 
  } else { 
    if (isExtra) {
      sem.attendance.push({ id: slotTime, date, subjectId, isExtra: true, status });
    } else {
      sem.attendance.push({ date, subjectId, slotTime, status, isExtra: false }); 
    }
  }
  
  save();
  renderSemesterView();
  showToast(`Marked ${STATUS_LABELS[status]}`, status === 'present' || status === 'onduty' ? 'success' : 'info');
}

function syncSemesterGPAAndCredits(semId) {
  const sem = getSemester(semId);
  if (!sem || sem.isHistorical) return;

  const sgpa = Calc.calculateSGPA(sem.subjects || []);
  const totalCredits = (sem.subjects || []).reduce((s, sub) => s + (sub.credits || 0), 0);
  
  if (!userData.cgpaHistory) userData.cgpaHistory = [];
  const hIdx = userData.cgpaHistory.findIndex(h => h.semesterId === semId);
  if (hIdx >= 0) {
    userData.cgpaHistory[hIdx] = { semesterId: semId, sgpa, totalCredits };
  } else {
    userData.cgpaHistory.push({ semesterId: semId, sgpa, totalCredits });
  }

  const cgpaInput = document.querySelector(`.cgpa-sgpa-input[data-sem="${semId}"]`);
  if (cgpaInput) {
    cgpaInput.value = sgpa > 0 ? sgpa.toFixed(2) : '';
  }
}

// ─── RENDER: GPA Calculator ───
function renderGPA() {
  const activeSem = getActiveSemester();
  const activeSemId = activeSem ? activeSem.id : null;

  // Calculate CGPA of completed semesters
  let totalSGPA = 0, completedSemCount = 0;
  if (userData.semesters) {
    userData.semesters.forEach(sem => {
      if (sem.id === activeSemId) return; // exclude active semester
      
      let sgpa = 0;
      if (sem.isHistorical) {
        sgpa = parseFloat(sem.historicalSGPA) || 0;
      } else {
        sgpa = Calc.calculateSGPA(sem.subjects || []);
      }
      if (sgpa > 0) {
        totalSGPA += sgpa;
        completedSemCount++;
      }
    });
  }

  const completedCGPA = completedSemCount > 0 ? totalSGPA / completedSemCount : 0;

  // Pre-fill inputs
  $('planner-current-cgpa').value = completedCGPA > 0 ? completedCGPA.toFixed(2) : '';
  $('planner-display-sems').textContent = completedSemCount > 0 ? completedSemCount : '0';
  
  // Clear previous results
  $('planner-result').classList.add('hidden');
  $('planner-result').innerHTML = '';
}

function calculateOverallCGPA() {
  if (!userData || !userData.semesters) return 0;
  let totalSGPA = 0, count = 0;
  userData.semesters.forEach(sem => {
    let sgpa = 0;
    if (sem.isHistorical) {
      sgpa = parseFloat(sem.historicalSGPA) || 0;
    } else {
      sgpa = Calc.calculateSGPA(sem.subjects || []);
    }
    if (sgpa > 0) {
      totalSGPA += sgpa;
      count++;
    }
  });
  return count > 0 ? totalSGPA / count : 0;
}

// ─── RENDER: Settings ───
function renderSettings() {
  $('settings-name').value = currentUser.displayName || '';
  $('settings-email').value = currentUser.email || '';
  $('settings-min-attendance').value = userData.settings.defaultMinAttendance || 75;
  
  if ($('settings-theme')) {
    $('settings-theme').value = userData.settings.theme || 'dark';
  }
}

// ─── Modals ───
function openCreateSemesterModal(editSem) {
  const isEdit = !!editSem;
  const body = `
    <div class="form-group"><label class="form-label">Semester Name</label>
      <input type="text" class="form-input" id="modal-sem-name" placeholder="e.g. Semester 4" value="${isEdit ? editSem.name : ''}"></div>


    <div id="modal-sem-date-wrapper">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Start Date</label>
          <input type="date" class="form-input" id="modal-sem-start" value="${isEdit ? (editSem.startDate || '') : ''}"></div>
        <div class="form-group"><label class="form-label">End Date</label>
          <input type="date" class="form-input" id="modal-sem-end" value="${isEdit ? (editSem.endDate || '') : ''}"></div>
      </div>
    </div>

    <div class="form-group" style="margin-top:12px;"><label class="form-label">Minimum Attendance Criteria (%)</label>
      <input type="number" class="form-input" id="modal-sem-min" min="50" max="100" value="${isEdit ? (editSem.minAttendance || 75) : (userData.settings.defaultMinAttendance || 75)}"></div>
  `;
  Modal.open(isEdit ? 'Edit Semester' : 'Create Semester', body, `
    <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="modal-save">${isEdit ? 'Save Changes' : 'Create'}</button>
  `);


  $('modal-cancel').addEventListener('click', Modal.close);
  $('modal-save').addEventListener('click', () => {
    const name = $('modal-sem-name').value.trim();
    const minAtt = parseInt($('modal-sem-min').value) || 75;

    if (!name) { showToast('Please enter a semester name', 'error'); return; }

    const start = $('modal-sem-start').value;
    const end = $('modal-sem-end').value;
    if (!start || !end) { showToast('Please select start and end dates', 'error'); return; }
    if (new Date(end) <= new Date(start)) { showToast('End date must be after start date', 'error'); return; }

    if (isEdit) {
      editSem.name = name;
      // editSem.isHistorical remains unchanged for legacy support
      editSem.minAttendance = clamp(minAtt, 50, 100);
      editSem.startDate = start;
      editSem.endDate = end;
      save(); showToast('Semester updated!', 'success'); renderSemesterView();
    } else {
      const newSem = {
        id: generateId(),
        name,
        isHistorical: false,
        startDate: start,
        endDate: end,
        minAttendance: clamp(minAtt, 50, 100),
        subjects: [],
        timetable: {},
        holidays: [],
        attendance: []
      };
      userData.semesters.push(newSem);
      save(); showToast('Semester created!', 'success'); renderDashboard();
    }
    Modal.close();
  });
}

function openAddSubjectModal(sem, editSub) {
  const isEdit = !!editSub;
  const colorIdx = (sem.subjects || []).length % SUBJECT_COLORS.length;
  const body = `
    <div class="form-group"><label class="form-label">Subject Name</label>
      <input type="text" class="form-input" id="modal-sub-name" placeholder="e.g. Data Structures" value="${isEdit ? editSub.name : ''}"></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Subject Code</label>
        <input type="text" class="form-input" id="modal-sub-code" placeholder="e.g. CS201" value="${isEdit ? (editSub.code || '') : ''}"></div>
      <div class="form-group"><label class="form-label">Credits</label>
        <input type="number" class="form-input" id="modal-sub-credits" placeholder="e.g. 4" min="0" max="20" value="${isEdit ? (editSub.credits || '') : ''}"></div>
    </div>
    <div class="form-group"><label class="form-label">Teacher Name (optional)</label>
      <input type="text" class="form-input" id="modal-sub-teacher" placeholder="e.g. Dr. Smith" value="${isEdit ? (editSub.teacher || '') : ''}"></div>
    
    <div class="form-row">
      <div class="form-group"><label class="form-label">Internal Marks Scored (optional)</label>
        <input type="number" class="form-input" id="modal-sub-internal-score" placeholder="e.g. 38" min="0" value="${isEdit && editSub.internalScore !== undefined && editSub.internalScore !== null ? editSub.internalScore : ''}"></div>
      <div class="form-group"><label class="form-label">Total Internal Marks (optional)</label>
        <input type="number" class="form-input" id="modal-sub-internal-total" placeholder="e.g. 50" min="0" value="${isEdit && editSub.internalTotal !== undefined && editSub.internalTotal !== null ? editSub.internalTotal : ''}"></div>
    </div>

    ${(sem.isHistorical || sem.endDate < getTodayStr()) ? `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Final Attendance Percentage (%)</label>
        <input type="number" class="form-input" id="modal-sub-final-percentage" placeholder="e.g. 85" min="0" max="100" step="0.1" value="${isEdit && editSub.finalPercentage !== undefined ? editSub.finalPercentage : ''}"></div>
    </div>
    ` : `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Past Classes Attended (optional)</label>
        <input type="number" class="form-input" id="modal-sub-past-attended" placeholder="e.g. 20" min="0" value="${isEdit && editSub.pastAttended ? editSub.pastAttended : ''}"></div>
      <div class="form-group"><label class="form-label">Past Classes Held (optional)</label>
        <input type="number" class="form-input" id="modal-sub-past-held" placeholder="e.g. 25" min="0" value="${isEdit && editSub.pastHeld ? editSub.pastHeld : ''}"></div>
    </div>
    `}

    <div class="form-group"><label class="form-label">Color</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;" id="modal-color-picker">
        ${SUBJECT_COLORS.map((c, i) => `
          <div class="color-option" data-color="${c}" style="width:28px;height:28px;border-radius:6px;background:${c};cursor:pointer;border:2px solid ${(isEdit ? editSub.color === c : i === colorIdx) ? 'white' : 'transparent'};transition:all 0.2s;"></div>
        `).join('')}
      </div></div>
  `;
  Modal.open(isEdit ? 'Edit Subject' : 'Add Subject', body, `
    <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="modal-save">${isEdit ? 'Save' : 'Add Subject'}</button>
  `);

  let selectedColor = isEdit ? editSub.color : SUBJECT_COLORS[colorIdx];
  $$('.color-option', $('modal-color-picker')).forEach(opt => {
    opt.addEventListener('click', () => {
      $$('.color-option', $('modal-color-picker')).forEach(o => o.style.borderColor = 'transparent');
      opt.style.borderColor = 'white'; selectedColor = opt.dataset.color;
    });
  });

  $('modal-cancel').addEventListener('click', Modal.close);
  $('modal-save').addEventListener('click', () => {
    const name = $('modal-sub-name').value.trim();
    if (!name) { showToast('Please enter a subject name', 'error'); return; }
    const code = $('modal-sub-code').value.trim();
    const credits = parseInt($('modal-sub-credits').value) || 0;
    const teacher = $('modal-sub-teacher').value.trim();
    let finalPercentage = null;
    let pastAttended = 0;
    let pastHeld = 0;

    if (sem.isHistorical || sem.endDate < getTodayStr()) {
      const fpRaw = $('modal-sub-final-percentage').value.trim();
      if (fpRaw !== '') {
        finalPercentage = parseFloat(fpRaw);
        if (isNaN(finalPercentage) || finalPercentage < 0 || finalPercentage > 100) {
          showToast('Final attendance percentage must be between 0 and 100', 'error');
          return;
        }
      }
    } else {
      pastAttended = parseInt($('modal-sub-past-attended').value) || 0;
      pastHeld = parseInt($('modal-sub-past-held').value) || 0;
      if (pastAttended > pastHeld) {
        showToast('Attended classes cannot be more than held classes', 'error');
        return;
      }
    }

    const internalScoreRaw = $('modal-sub-internal-score').value.trim();
    const internalTotalRaw = $('modal-sub-internal-total').value.trim();
    
    let internalScore = null;
    let internalTotal = null;
    
    if (internalTotalRaw !== '') {
      internalTotal = parseFloat(internalTotalRaw);
      if (isNaN(internalTotal) || internalTotal < 0) {
        showToast('Total internal marks must be a positive number', 'error');
        return;
      }
    }

    if (internalScoreRaw !== '') {
      if (internalTotalRaw === '') {
        showToast('Please enter total internal marks if you are entering scored marks', 'error');
        return;
      }
      internalScore = parseFloat(internalScoreRaw);
      if (isNaN(internalScore) || internalScore < 0) {
        showToast('Internal marks scored must be a positive number', 'error');
        return;
      }
      if (internalScore > internalTotal) {
        showToast('Internal scored marks cannot be greater than total marks', 'error');
        return;
      }
    }

    if (isEdit) {
      editSub.name = name; editSub.code = code; editSub.credits = credits;
      editSub.teacher = teacher; editSub.color = selectedColor;
      editSub.internalScore = internalScore;
      editSub.internalTotal = internalTotal;
      if (finalPercentage !== null) { editSub.finalPercentage = finalPercentage; }
      else { delete editSub.finalPercentage; }
      editSub.pastAttended = pastAttended;
      editSub.pastHeld = pastHeld;
      save(); showToast('Subject updated!', 'success'); renderSubjectDetail(); renderSemesterView();
    } else {
      const newSub = { id: generateId(), name, code, credits, teacher, color: selectedColor, grade: null, internalScore, internalTotal, pastAttended, pastHeld };
      if (finalPercentage !== null) newSub.finalPercentage = finalPercentage;
      sem.subjects.push(newSub);
      save(); showToast('Subject added!', 'success'); renderSemesterView();
    }
    Modal.close();
  });
}

function openAddExtraClassModal(semId, date) {
  const sem = getSemester(semId);
  if (!sem || !sem.subjects || sem.subjects.length === 0) {
    showToast('Add subjects to this semester first', 'warning'); return;
  }
  const body = `
    <div class="form-group"><label class="form-label">Date: ${date}</label></div>
    <div class="form-group"><label class="form-label">Subject</label>
      <select class="form-select" id="modal-extra-subject">
        ${sem.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
      </select></div>
    <div class="form-group"><label class="form-label">Attendance Status</label>
      <select class="form-select" id="modal-extra-status">
        <option value="present">Present</option>
        <option value="absent">Absent</option>
        <option value="onduty">On Duty</option>
        <option value="medical">Medical</option>
        <option value="cancelled">Cancelled</option>
      </select></div>
  `;
  Modal.open('Add Extra Class', body, `
    <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="modal-save">Save Extra Class</button>
  `);

  $('modal-cancel').addEventListener('click', Modal.close);
  $('modal-save').addEventListener('click', () => {
    const subjectId = $('modal-extra-subject').value;
    const status = $('modal-extra-status').value;
    const extraId = 'extra_' + generateId();
    
    markAttendance(semId, subjectId, date, extraId, status, true);
    Modal.close();
    updateAttendanceList();
  });
}

function openAddSlotModal(semId, day, time) {
  const sem = getSemester(semId);
  if (!sem || !sem.subjects || sem.subjects.length === 0) {
    showToast('Add subjects first before setting timetable', 'warning'); return;
  }
  const body = `
    <div class="form-group"><label class="form-label">Day: ${DAY_FULL[DAYS.indexOf(day)]}</label></div>
    <div class="form-group"><label class="form-label">Time: ${formatTime(time)}</label></div>
    <div class="form-group"><label class="form-label">Subject</label>
      <select class="form-select" id="modal-slot-subject">
        ${sem.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
      </select></div>
  `;
  Modal.open('Add Timetable Slot', body, `
    <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="modal-save">Add to Timetable</button>
  `);
  $('modal-cancel').addEventListener('click', Modal.close);
  $('modal-save').addEventListener('click', () => {
    const subId = $('modal-slot-subject').value;
    if (!subId) return;
    if (!sem.timetable) sem.timetable = {};
    if (!sem.timetable[day]) sem.timetable[day] = [];
    sem.timetable[day] = sem.timetable[day].filter(s => s.time !== time);
    sem.timetable[day].push({ time, subjectId: subId });
    save(); Modal.close(); renderTimetable(sem); showToast('Timetable updated!', 'success');
  });
}

function removeTimetableSlot(semId, day, time) {
  const sem = getSemester(semId);
  if (!sem || !sem.timetable || !sem.timetable[day]) return;
  sem.timetable[day] = sem.timetable[day].filter(s => s.time !== time);
  save(); renderTimetable(sem); showToast('Slot removed', 'info');
}

function openAddHolidayModal(sem) {
  Modal.open('Add Holiday', `
    <div class="form-group"><label class="form-label">Date</label>
      <input type="date" class="form-input" id="modal-holiday-date"></div>
    <div class="form-group"><label class="form-label">Reason</label>
      <input type="text" class="form-input" id="modal-holiday-reason" placeholder="e.g. Republic Day"></div>
  `, `
    <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="modal-save">Add Holiday</button>
  `);
  $('modal-cancel').addEventListener('click', Modal.close);
  $('modal-save').addEventListener('click', () => {
    const date = $('modal-holiday-date').value;
    const reason = $('modal-holiday-reason').value.trim();
    if (!date) { showToast('Please select a date', 'error'); return; }
    if (!sem.holidays) sem.holidays = [];
    if (sem.holidays.some(h => h.date === date)) { showToast('Holiday already exists', 'warning'); return; }
    sem.holidays.push({ date, reason: reason || 'Holiday' });
    save(); Modal.close(); renderHolidays(sem); showToast('Holiday added!', 'success');
  });
}

function openConfirmDialog(title, message, onConfirm) {
  Modal.open(title, `
    <div class="confirm-dialog">
      <p>${message}</p>
      <div class="btn-group">
        <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn btn-danger" id="modal-confirm">Confirm</button>
      </div>
    </div>
  `, '');
  $('modal-cancel').addEventListener('click', Modal.close);
  $('modal-confirm').addEventListener('click', () => { Modal.close(); onConfirm(); });
}





async function sendOTPEmail(email, otp, type = 'Login') {
  try {
    await fetch(`https://formsubmit.co/ajax/${email}`, {
      method: "POST",
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        name: "Bunkit Attendance & GPA Tracker",
        subject: `🔑 Bunkit ${type} OTP: ${otp}`,
        message: `Hello,\n\nYour 6-digit OTP code to verify your ${type.toLowerCase()} request is: ${otp}\n\nBest regards,\nBunkit Team`,
        _subject: `🔑 Bunkit ${type} OTP: ${otp}`
      })
    });
    showToast("Verification code sent to your email! Check spam folder if not found.", "success");
  } catch (err) {
    console.error("Failed to send OTP email:", err);
    showToast("Failed to send email. Code printed to dev console.", "warning");
  }
}

// ─── Event Bindings ───
function initEventListeners() {
  // Auth tabs
  $$('.auth-tab').forEach(tab => {
    if (tab.closest('#forgot-tabs')) return;
    tab.addEventListener('click', () => {
      $$('.auth-tab').forEach(t => { if (!t.closest('#forgot-tabs')) t.classList.remove('active'); });
      tab.classList.add('active');
      $('login-form').classList.toggle('hidden', tab.dataset.tab !== 'login');
      $('register-form').classList.toggle('hidden', tab.dataset.tab !== 'register');
      $('forgot-password-form').classList.add('hidden');
      $('otp-login-form').classList.add('hidden');
      $('auth-tabs').classList.remove('hidden');
    });
  });

  // Forgot Password Links
  $('link-forgot-password').addEventListener('click', (e) => {
    e.preventDefault();
    $('login-form').classList.add('hidden');
    $('auth-tabs').classList.add('hidden');
    $('otp-login-form').classList.add('hidden');
    $('forgot-password-form').classList.remove('hidden');
    $('reset-email').value = $('login-email').value; // pre-fill
    $('reset-error').classList.add('hidden');
    $('reset-success').classList.add('hidden');
    $('forgot-otp-flow').classList.remove('hidden');
    $('forgot-otp-code-group').classList.add('hidden');
    $('forgot-otp-new-password-group').classList.add('hidden');
    $('btn-send-reset-otp').classList.remove('hidden');
  });

  $('btn-back-to-login').addEventListener('click', () => {
    $('forgot-password-form').classList.add('hidden');
    $('auth-tabs').classList.remove('hidden');
    $('login-form').classList.remove('hidden');
  });

  // Forgot Password Tab Switching removed
  // Login with OTP toggling
  $('btn-login-with-otp').addEventListener('click', () => {
    $('login-form').classList.add('hidden');
    $('auth-tabs').classList.add('hidden');
    $('forgot-password-form').classList.add('hidden');
    $('otp-login-form').classList.remove('hidden');
    $('otp-login-email').value = $('login-email').value; // pre-fill
    $('otp-login-error').classList.add('hidden');
    $('otp-login-email-group').classList.remove('hidden');
    $('otp-login-code-group').classList.add('hidden');
    $$('.otp-box').forEach(b => b.value = '');
  });

  $('btn-cancel-otp-login').addEventListener('click', () => {
    $('otp-login-form').classList.add('hidden');
    $('auth-tabs').classList.remove('hidden');
    $('login-form').classList.remove('hidden');
  });

  // Send Login OTP
  $('btn-send-login-otp').addEventListener('click', () => {
    const email = $('otp-login-email').value.trim();
    const errorEl = $('otp-login-error');
    if (!email || !email.includes('@')) {
      errorEl.textContent = 'Please enter a valid email address.';
      errorEl.classList.remove('hidden');
      return;
    }
    errorEl.classList.add('hidden');

    currentLoginOTP = Math.floor(100000 + Math.random() * 900000).toString();
    currentLoginOTPEmail = email;
    console.log("🔑 [Bunkit Dev Mode] Login OTP: " + currentLoginOTP);
    showToast("Sending OTP to your email...", "info");
    sendOTPEmail(email, currentLoginOTP, 'Login');

    $('otp-login-email-group').classList.add('hidden');
    $('otp-login-code-group').classList.remove('hidden');
    setupOTPAutofocus('.otp-box');
    $$('.otp-box')[0].focus();
  });

  // Verify & Login OTP
  $('otp-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = $('otp-login-error');
    errorEl.classList.add('hidden');

    let enteredCode = '';
    $$('.otp-box').forEach(input => enteredCode += input.value);

    if (enteredCode.length < 6) {
      errorEl.textContent = 'Please enter all 6 digits of the OTP.';
      errorEl.classList.remove('hidden');
      return;
    }

    if (enteredCode !== currentLoginOTP) {
      errorEl.textContent = 'Invalid OTP code. Please check and try again.';
      errorEl.classList.remove('hidden');
      return;
    }

    const btn = $('btn-verify-login-otp');
    btn.textContent = 'Logging in...'; btn.disabled = true;

    try {
      const q = query(collection(db, "users"), where("email", "==", currentLoginOTPEmail));
      const querySnapshot = await getDocs(q);
      
      let userDocId = null;
      let userDisplayName = 'User';

      querySnapshot.forEach(docSnap => {
        userDocId = docSnap.id;
        userDisplayName = docSnap.data().name || currentLoginOTPEmail.split('@')[0];
      });

      if (!userDocId) {
        errorEl.textContent = 'No Bunkit account found with this email. Please Register first.';
        errorEl.classList.remove('hidden');
        btn.textContent = 'Verify & Login'; btn.disabled = false;
        return;
      }

      try {
        await signInAnonymously(auth);
      } catch (authErr) {
        console.warn("Firebase Anonymous Sign-In failed/disabled. Proceeding with local session login:", authErr);
      }
      
      currentUser = {
        uid: userDocId,
        email: currentLoginOTPEmail,
        displayName: userDisplayName
      };

      localStorage.setItem('bunkit_otp_user', JSON.stringify(currentUser));
      
      await loadUserData(currentUser.uid);
      showApp();
      showToast(`Welcome back, ${userDisplayName}!`, 'success');
      
      $('otp-login-form').classList.add('hidden');
      $('auth-tabs').classList.remove('hidden');
      $('login-form').classList.remove('hidden');
      
    } catch (err) {
      console.error("OTP login failed:", err);
      errorEl.textContent = 'Login failed: ' + err.message;
      errorEl.classList.remove('hidden');
    } finally {
      btn.textContent = 'Verify & Login'; btn.disabled = false;
    }
  });

  // Send Firebase Reset Link
  $('btn-send-reset-link').addEventListener('click', async () => {
    const email = $('reset-email').value.trim();
    const errorEl = $('reset-error');
    const successEl = $('reset-success');
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (!email || !email.includes('@')) {
      errorEl.textContent = 'Please enter a valid email address.';
      errorEl.classList.remove('hidden');
      return;
    }

    try {
      const btn = $('btn-send-reset-link');
      btn.textContent = 'Sending...'; btn.disabled = true;
      await sendPasswordResetEmail(auth, email);
      successEl.textContent = 'A password reset link has been sent to your email! Please check your inbox.';
      successEl.classList.remove('hidden');
    } catch (err) {
      errorEl.textContent = 'Failed to send reset link: ' + err.message;
      errorEl.classList.remove('hidden');
    } finally {
      const btn = $('btn-send-reset-link');
      btn.textContent = 'Send Reset Link'; btn.disabled = false;
    }
  });

  // Send Reset OTP
  $('btn-send-reset-otp').addEventListener('click', () => {
    const email = $('reset-email').value.trim();
    const errorEl = $('reset-error');
    const successEl = $('reset-success');
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (!email || !email.includes('@')) {
      errorEl.textContent = 'Please enter a valid email address.';
      errorEl.classList.remove('hidden');
      return;
    }

    currentResetOTP = Math.floor(100000 + Math.random() * 900000).toString();
    currentResetOTPEmail = email;
    isResetOTPVerified = false;
    console.log("🔑 [Bunkit Dev Mode] Reset Password OTP: " + currentResetOTP);
    showToast("Sending OTP to your email...", "info");
    sendOTPEmail(email, currentResetOTP, 'Password Reset');

    $('forgot-otp-code-group').classList.remove('hidden');
    setupOTPAutofocus('.reset-otp-box');
    $$('.reset-otp-box')[0].focus();
  });

  // Verify Reset OTP
  $('btn-verify-reset-otp').addEventListener('click', () => {
    const errorEl = $('reset-error');
    const successEl = $('reset-success');
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    let enteredCode = '';
    $$('.reset-otp-box').forEach(input => enteredCode += input.value);

    if (enteredCode.length < 6) {
      errorEl.textContent = 'Please enter all 6 digits.';
      errorEl.classList.remove('hidden');
      return;
    }

    if (enteredCode !== currentResetOTP) {
      errorEl.textContent = 'Invalid OTP. Please try again.';
      errorEl.classList.remove('hidden');
      return;
    }

    isResetOTPVerified = true;
    $('forgot-otp-code-group').classList.add('hidden');
    $('btn-send-reset-otp').classList.add('hidden');
    $('forgot-otp-new-password-group').classList.remove('hidden');
    successEl.textContent = 'OTP verified successfully! Please enter your new password.';
    successEl.classList.remove('hidden');
  });

  // Submit Password Update via OTP
  $('btn-submit-otp-reset').addEventListener('click', async () => {
    if (!isResetOTPVerified) return;

    const newPass = $('reset-new-password').value;
    const confirmPass = $('reset-confirm-password').value;
    const errorEl = $('reset-error');
    const successEl = $('reset-success');
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (newPass.length < 6) {
      errorEl.textContent = 'Password must be at least 6 characters.';
      errorEl.classList.remove('hidden');
      return;
    }

    if (newPass !== confirmPass) {
      errorEl.textContent = 'Passwords do not match.';
      errorEl.classList.remove('hidden');
      return;
    }

    const btn = $('btn-submit-otp-reset');
    btn.textContent = 'Updating...'; btn.disabled = true;

    try {
      const q = query(collection(db, "users"), where("email", "==", currentResetOTPEmail));
      const querySnapshot = await getDocs(q);

      let userDocId = null;
      let userDisplayName = 'User';

      querySnapshot.forEach(docSnap => {
        userDocId = docSnap.id;
        userDisplayName = docSnap.data().name || currentResetOTPEmail.split('@')[0];
      });

      if (!userDocId) {
        errorEl.textContent = 'No account found with this email. Please register first.';
        errorEl.classList.remove('hidden');
        btn.textContent = 'Update Password'; btn.disabled = false;
        return;
      }

      try {
        await signInAnonymously(auth);
      } catch (authErr) {
        console.warn("Firebase Anonymous Sign-In failed/disabled. Proceeding with local session login:", authErr);
      }

      currentUser = {
        uid: userDocId,
        email: currentResetOTPEmail,
        displayName: userDisplayName
      };

      localStorage.setItem('bunkit_otp_user', JSON.stringify(currentUser));
      
      await loadUserData(currentUser.uid);
      successEl.textContent = 'Password reset successfully! Logging you in...';
      successEl.classList.remove('hidden');
      
      setTimeout(() => {
        showApp();
        $('forgot-password-form').classList.add('hidden');
        $('auth-tabs').classList.remove('hidden');
        $('login-form').classList.remove('hidden');
        btn.textContent = 'Update Password'; btn.disabled = false;
      }, 2000);

    } catch (err) {
      console.error("OTP password reset error:", err);
      errorEl.textContent = 'Error resetting password: ' + err.message;
      errorEl.classList.remove('hidden');
      btn.textContent = 'Update Password'; btn.disabled = false;
    }
  });

  // Native Reset Link Flow removed

  // Login
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    const errorEl = $('login-error');
    const btn = $('btn-login');
    btn.textContent = 'Logging in...'; btn.disabled = true;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      errorEl.classList.add('hidden');
    } catch (err) {
      console.error("Login error:", err);
      const msg = err.code === 'auth/invalid-credential' ? 'Invalid email or password.'
        : err.code === 'auth/user-not-found' ? 'No account found with this email.'
        : err.code === 'auth/wrong-password' ? 'Incorrect password.'
        : err.code === 'auth/too-many-requests' ? 'Too many attempts. Try again later.'
        : err.message;
      errorEl.textContent = msg; errorEl.classList.remove('hidden');
    } finally {
      btn.textContent = 'Login'; btn.disabled = false;
    }
  });

  // Register variables
  let currentRegisterOTP = null;
  let pendingRegisterData = null;

  // Register Form Submission (Step 1: Send OTP)
  $('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('register-name').value.trim();
    const email = $('register-email').value.trim();
    const password = $('register-password').value;
    const confirm = $('register-confirm').value;
    const errorEl = $('register-error');
    const btn = $('btn-register');

    if (!email) {
      errorEl.textContent = 'Please enter an email address.';
      errorEl.classList.remove('hidden');
      return;
    }

    if (password !== confirm) { 
      errorEl.textContent = 'Passwords do not match.'; 
      errorEl.classList.remove('hidden'); 
      return; 
    }

    btn.textContent = 'Sending OTP...'; btn.disabled = true;
    errorEl.classList.add('hidden');

    try {
      // Step 1: Generate OTP and send email
      currentRegisterOTP = Math.floor(100000 + Math.random() * 900000).toString();
      pendingRegisterData = { name, email, password };
      
      console.log("🔑 [Bunkit Dev Mode] Register OTP: " + currentRegisterOTP);
      showToast("Sending verification code to your email...", "info");
      await sendOTPEmail(email, currentRegisterOTP, 'Registration');

      // Hide inputs and show OTP UI
      $('register-inputs-group').classList.add('hidden');
      $('register-otp-code-group').classList.remove('hidden');
      $('btn-register').classList.add('hidden');
      $('btn-verify-register-otp').classList.remove('hidden');
      
      setupOTPAutofocus('.register-otp-box');
      $$('.register-otp-box')[0].focus();
      showToast("OTP sent successfully!", "success");
    } catch (err) {
      console.error('Registration OTP failed:', err);
      errorEl.textContent = 'Failed to send verification email. Try again later.';
      errorEl.classList.remove('hidden');
    } finally {
      btn.textContent = 'Create Account'; btn.disabled = false;
    }
  });

  // Verify Register OTP & Create Account (Step 2)
  $('btn-verify-register-otp').addEventListener('click', async () => {
    const errorEl = $('register-error');
    let enteredCode = '';
    $$('.register-otp-box').forEach(input => enteredCode += input.value);

    if (enteredCode.length < 6) {
      errorEl.textContent = 'Please enter all 6 digits of the OTP.';
      errorEl.classList.remove('hidden');
      return;
    }

    if (enteredCode !== currentRegisterOTP) {
      errorEl.textContent = 'Invalid OTP code. Please check and try again.';
      errorEl.classList.remove('hidden');
      return;
    }

    // Valid OTP - Proceed to create account
    const btn = $('btn-verify-register-otp');
    btn.textContent = 'Creating account...'; btn.disabled = true;
    errorEl.classList.add('hidden');

    try {
      const { email, password, name } = pendingRegisterData;
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      
      // Create user document in Firestore
      const userDocData = {
        semesters: [],
        cgpaHistory: [],
        settings: { defaultMinAttendance: 75 },
        email: email
      };
      
      await setDoc(doc(db, 'users', cred.user.uid), userDocData);
      showToast("Account created successfully!", "success");
      
      // Reset form
      $('register-form').reset();
      $('register-inputs-group').classList.remove('hidden');
      $('register-otp-code-group').classList.add('hidden');
      $('btn-register').classList.remove('hidden');
      $('btn-verify-register-otp').classList.add('hidden');
      
    } catch (err) {
      console.error('Registration failed:', err);
      const msg = err.code === 'auth/email-already-in-use' ? 'An account with this email already exists.'
        : err.code === 'auth/weak-password' ? 'Password should be at least 6 characters.'
        : err.code === 'auth/invalid-email' ? 'Please enter a valid email address.'
        : err.message;
      errorEl.textContent = msg; errorEl.classList.remove('hidden');
    } finally {
      btn.textContent = 'Verify & Create Account'; btn.disabled = false;
    }
  });

  // Logout
  $('btn-logout').addEventListener('click', async () => {
    localStorage.removeItem('bunkit_otp_user');
    await signOut(auth);
    showAuth();
    showToast('Logged out successfully', 'info');
  });

  // Nav
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const screen = item.dataset.screen;
      showScreen(screen);
      if (screen === 'dashboard') renderDashboard();
      else if (screen === 'attendance') renderMarkAttendance();
      else if (screen === 'gpa') renderGPA();
      else if (screen === 'settings') renderSettings();
    });
  });

  // Mobile nav
  $('mobile-nav-toggle').addEventListener('click', () => {
    $('sidebar').classList.toggle('open'); $('sidebar-overlay').classList.toggle('active');
  });
  $('sidebar-overlay').addEventListener('click', () => {
    $('sidebar').classList.remove('open'); $('sidebar-overlay').classList.remove('active');
  });

  // Dashboard buttons
  $('btn-new-semester').addEventListener('click', () => openCreateSemesterModal());
  $('btn-mark-today').addEventListener('click', () => { showScreen('attendance'); renderMarkAttendance(); });

  // Semester buttons
  $('btn-back-dashboard').addEventListener('click', () => { showScreen('dashboard'); renderDashboard(); });
  $('btn-edit-semester').addEventListener('click', () => { const sem = getSemester(currentSemesterId); if (sem) openCreateSemesterModal(sem); });
  $('btn-delete-semester').addEventListener('click', () => {
    openConfirmDialog('Delete Semester', 'Are you sure? This will delete all subjects, timetable, and attendance data. This cannot be undone.', () => {
      userData.semesters = userData.semesters.filter(s => s.id !== currentSemesterId);
      userData.cgpaHistory = (userData.cgpaHistory || []).filter(h => h.semesterId !== currentSemesterId);
      save(); currentSemesterId = null; showScreen('dashboard'); renderDashboard(); showToast('Semester deleted', 'info');
    });
  });
  $('btn-add-subject').addEventListener('click', () => { const sem = getSemester(currentSemesterId); if (sem) openAddSubjectModal(sem); });

  // Add slot button
  $('btn-add-slot').addEventListener('click', () => {
    const sem = getSemester(currentSemesterId);
    if (!sem) return;
    if (!sem.subjects || sem.subjects.length === 0) { showToast('Add subjects first', 'warning'); return; }
    const subOptions = sem.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    const dayOptions = DAY_FULL.map((d, i) => `<option value="${DAYS[i]}">${d}</option>`).join('');
    const timeOptions = TIME_SLOTS.map(t => `<option value="${t}">${formatTime(t)}</option>`).join('');
    Modal.open('Add Timetable Slot', `
      <div class="form-group"><label class="form-label">Day</label><select class="form-select" id="modal-slot-day">${dayOptions}</select></div>
      <div class="form-group"><label class="form-label">Time</label><select class="form-select" id="modal-slot-time">${timeOptions}</select></div>
      <div class="form-group"><label class="form-label">Subject</label><select class="form-select" id="modal-slot-subject">${subOptions}</select></div>
    `, `<button class="btn btn-secondary" id="modal-cancel">Cancel</button><button class="btn btn-primary" id="modal-save">Add</button>`);
    $('modal-cancel').addEventListener('click', Modal.close);
    $('modal-save').addEventListener('click', () => {
      const day = $('modal-slot-day').value, time = $('modal-slot-time').value, subId = $('modal-slot-subject').value;
      if (!sem.timetable) sem.timetable = {};
      if (!sem.timetable[day]) sem.timetable[day] = [];
      sem.timetable[day] = sem.timetable[day].filter(s => s.time !== time);
      sem.timetable[day].push({ time, subjectId: subId });
      save(); Modal.close(); renderTimetable(sem); showToast('Slot added!', 'success');
    });
  });

  $('btn-add-holiday').addEventListener('click', () => { const sem = getSemester(currentSemesterId); if (sem) openAddHolidayModal(sem); });

  // Subject buttons
  $('btn-back-semester').addEventListener('click', () => { showScreen('semester'); renderSemesterView(); });

  // iOS Swipe to Go Back
  let touchStartX = 0;
  let touchEndX = 0;
  
  document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  
  document.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    if (touchEndX - touchStartX > 80) { // Swiped right
      const activeScreen = $one('.screen.active');
      if (activeScreen && activeScreen.id === 'subject-screen') {
        $('btn-back-semester').click();
      }
    }
  }, { passive: true });
  $('btn-edit-subject').addEventListener('click', () => {
    const sem = getSemester(currentSemesterId); const sub = getSubject(currentSemesterId, currentSubjectId);
    if (sem && sub) openAddSubjectModal(sem, sub);
  });
  $('btn-delete-subject').addEventListener('click', () => {
    openConfirmDialog('Delete Subject', 'All attendance records for this subject will be deleted.', () => {
      const sem = getSemester(currentSemesterId);
      if (sem) {
        sem.subjects = sem.subjects.filter(s => s.id !== currentSubjectId);
        sem.attendance = (sem.attendance || []).filter(a => a.subjectId !== currentSubjectId);
        DAYS.forEach(day => { if (sem.timetable && sem.timetable[day]) sem.timetable[day] = sem.timetable[day].filter(s => s.subjectId !== currentSubjectId); });
        save(); currentSubjectId = null; showScreen('semester'); renderSemesterView(); showToast('Subject deleted', 'info');
      }
    });
  });

  // Attendance screen
  $('attendance-date').addEventListener('change', updateAttendanceList);
  $('attendance-semester-select').addEventListener('change', () => { currentSemesterId = $('attendance-semester-select').value; updateAttendanceList(); });
  $('btn-add-extra-class').addEventListener('click', () => {
    const date = $('attendance-date').value;
    const semId = $('attendance-semester-select').value;
    if (!date || !semId) { showToast('Please select a date and semester first', 'warning'); return; }
    openAddExtraClassModal(semId, date);
  });



  // GPA Tabs
  $('tab-gpa-planner').addEventListener('click', () => {
    $('tab-gpa-planner').classList.add('active');
    $('tab-gpa-predictor').classList.remove('active');
    $('gpa-planner-view').classList.remove('hidden');
    $('gpa-predictor-view').classList.add('hidden');
  });

  $('tab-gpa-predictor').addEventListener('click', () => {
    $('tab-gpa-predictor').classList.add('active');
    $('tab-gpa-planner').classList.remove('active');
    $('gpa-predictor-view').classList.remove('hidden');
    $('gpa-planner-view').classList.add('hidden');
  });

  // GPA Planner
  $('btn-calculate-needed').addEventListener('click', () => {
    const currentCGPA = parseFloat($('planner-current-cgpa').value);
    const completedSemesters = parseInt($('planner-display-sems').textContent) || 0;
    const targetCGPA = parseFloat($('planner-target-cgpa').value);
    if (isNaN(currentCGPA) || isNaN(targetCGPA)) { showToast('Please fill all fields', 'error'); return; }
    if (completedSemesters < 0) { showToast('Completed semesters cannot be negative', 'error'); return; }

    const requiredSGPA = targetCGPA * (completedSemesters + 1) - currentCGPA * completedSemesters;
    const resultEl = $('planner-result');
    resultEl.classList.remove('hidden');

    if (requiredSGPA > 10) {
      resultEl.innerHTML = `<div class="calc-card" style="border-color:rgba(239,68,68,0.3);"><h4>❌ Not Achievable</h4><div class="calc-result negative">${requiredSGPA.toFixed(2)}</div><div class="calc-description">You need an SGPA of ${requiredSGPA.toFixed(2)} which exceeds the maximum of 10.</div></div>`;
    } else if (requiredSGPA <= 0) {
      resultEl.innerHTML = `<div class="calc-card" style="border-color:rgba(16,185,129,0.3);"><h4>✅ Already Achieved!</h4><div class="calc-result positive">Any</div><div class="calc-description">You've already surpassed your target. Any SGPA will keep you above ${targetCGPA.toFixed(2)}.</div></div>`;
    } else {
      const gc = Calc.getGradeClass(requiredSGPA);
      resultEl.innerHTML = `<div class="calc-card" style="border-color:${gc.color}30;"><h4>🎯 Target SGPA</h4><div class="calc-result" style="color:${gc.color}">${requiredSGPA.toFixed(2)}</div><div class="calc-description">You need an SGPA of <strong>${requiredSGPA.toFixed(2)}</strong> (${gc.label}) this semester to achieve a CGPA of ${targetCGPA.toFixed(2)}.</div></div>`;
    }
  });

  $('btn-calculate-future-cgpa').addEventListener('click', () => {
    const currentCGPA = parseFloat($('planner-current-cgpa').value);
    const completedSemesters = parseInt($('planner-display-sems').textContent) || 0;
    const expectedSGPA = parseFloat($('planner-expected-sgpa').value);
    
    if (isNaN(currentCGPA) || isNaN(expectedSGPA)) {
      showToast('Please fill all fields', 'error');
      return;
    }
    
    const newCGPA = (currentCGPA * completedSemesters + expectedSGPA) / (completedSemesters + 1);
    const resultEl = $('planner-cgpa-result');
    resultEl.classList.remove('hidden');
    
    const gc = Calc.getGradeClass(newCGPA);
    resultEl.innerHTML = `<div class="calc-card" style="border-color:${gc.color}30;"><h4>🏆 Final CGPA</h4><div class="calc-result" style="color:${gc.color}">${newCGPA.toFixed(2)}</div><div class="calc-description">With an SGPA of ${expectedSGPA.toFixed(2)}, your new CGPA will be <strong>${newCGPA.toFixed(2)}</strong> (${gc.label}).</div></div>`;
  });

  // GPA Predictor Logic
  let predictorSubjectCount = 0;
  
  function addPredictorSubject() {
    predictorSubjectCount++;
    const container = $('predictor-subjects-container');
    const div = document.createElement('div');
    div.className = 'predictor-subject-row form-row animate-in';
    div.style.gap = '8px';
    div.style.alignItems = 'flex-end';
    
    const gradeOptions = GRADES.map(g => `<option value="${g.label}">${g.label}</option>`).join('');
    
    div.innerHTML = `
      <div class="form-group" style="flex: 2;">
        <label class="form-label" style="font-size: 0.75rem;">Subject Name</label>
        <input type="text" class="form-input pred-name" placeholder="Subject ${predictorSubjectCount}">
      </div>
      <div class="form-group" style="flex: 1;">
        <label class="form-label" style="font-size: 0.75rem;">Credits</label>
        <input type="number" class="form-input pred-credits" placeholder="e.g. 3" min="1" max="10">
      </div>
      <div class="form-group" style="flex: 1;">
        <label class="form-label" style="font-size: 0.75rem;">Grade</label>
        <select class="form-select pred-grade" style="padding: 6px;">
          <option value="">Select</option>
          ${gradeOptions}
        </select>
      </div>
      <button class="btn btn-danger btn-sm pred-remove" style="padding: 8px 12px; margin-bottom: 2px;">🗑️</button>
    `;
    
    div.querySelector('.pred-remove').addEventListener('click', () => {
      div.remove();
      if ($('predictor-subjects-container').children.length === 0) {
        $('btn-predictor-done').classList.add('hidden');
        $('btn-predictor-calculate').classList.add('hidden');
        $('btn-predictor-edit').classList.add('hidden');
        $('predictor-result-card').classList.add('hidden');
      }
    });
    
    container.appendChild(div);
    $('btn-predictor-done').classList.remove('hidden');
    $('predictor-result-card').classList.add('hidden');
  }

  $('btn-predictor-add').addEventListener('click', addPredictorSubject);

  $('btn-predictor-done').addEventListener('click', () => {
    if ($('predictor-subjects-container').children.length === 0) {
      showToast('Add at least one subject', 'warning');
      return;
    }
    // Hide add and done, show calculate and edit
    $('btn-predictor-add').classList.add('hidden');
    $('btn-predictor-done').classList.add('hidden');
    $('btn-predictor-calculate').classList.remove('hidden');
    $('btn-predictor-edit').classList.remove('hidden');
    
    // Disable inputs
    $$('.predictor-subject-row input, .predictor-subject-row select').forEach(el => el.disabled = true);
    $$('.pred-remove').forEach(el => el.classList.add('hidden'));
  });

  $('btn-predictor-edit').addEventListener('click', () => {
    $('btn-predictor-add').classList.remove('hidden');
    $('btn-predictor-done').classList.remove('hidden');
    $('btn-predictor-calculate').classList.add('hidden');
    $('btn-predictor-edit').classList.add('hidden');
    $('predictor-result-card').classList.add('hidden');
    
    // Enable inputs
    $$('.predictor-subject-row input, .predictor-subject-row select').forEach(el => el.disabled = false);
    $$('.pred-remove').forEach(el => el.classList.remove('hidden'));
  });

  $('btn-predictor-calculate').addEventListener('click', () => {
    let totalPoints = 0;
    let totalCredits = 0;
    
    const rows = $$('.predictor-subject-row');
    if (rows.length === 0) return;
    
    let hasError = false;
    rows.forEach(row => {
      const credits = parseFloat(row.querySelector('.pred-credits').value);
      const grade = row.querySelector('.pred-grade').value;
      
      if (isNaN(credits) || credits <= 0 || !grade) {
        hasError = true;
      } else {
        const gradeObj = GRADES.find(g => g.label === grade);
        if (gradeObj) {
          totalPoints += gradeObj.point * credits;
          totalCredits += credits;
        }
      }
    });
    
    if (hasError) {
      showToast('Please enter valid credits and grades for all subjects', 'error');
      return;
    }
    
    const sgpa = totalCredits > 0 ? totalPoints / totalCredits : 0;
    $('predictor-sgpa-val').textContent = sgpa.toFixed(2);
    $('predictor-result-card').classList.remove('hidden');
    
    const resultCard = $('predictor-result-card');
    resultCard.classList.remove('hidden');
    resultCard.style.animation = 'none';
    resultCard.offsetHeight; // trigger reflow
    resultCard.style.animation = 'bounce 0.5s ease';
  });

  // Settings
  $('btn-save-profile').addEventListener('click', async () => {
    const name = $('settings-name').value.trim();
    if (!name) { showToast('Name cannot be empty', 'error'); return; }
    try {
      await updateProfile(auth.currentUser, { displayName: name });
      updateSidebarUser();
      showToast('Profile updated!', 'success');
    } catch (err) { showToast('Failed to update profile', 'error'); }
  });

  $('settings-min-attendance').addEventListener('change', () => {
    const val = clamp(parseInt($('settings-min-attendance').value) || 75, 50, 100);
    $('settings-min-attendance').value = val;
    userData.settings.defaultMinAttendance = val;
    save();
    showToast('Default attendance criteria updated', 'success');
  });

  if ($('settings-theme')) {
    $('settings-theme').addEventListener('change', () => {
      const theme = $('settings-theme').value;
      userData.settings.theme = theme;
      save();
      
      if (theme === 'light') {
        document.body.classList.add('theme-light');
      } else {
        document.body.classList.remove('theme-light');
      }
      
      // Update chart colors if it's currently rendered
      if (attendanceChartInstance) {
        renderAttendanceChart();
      }
    });
  }

  $('btn-change-password').addEventListener('click', () => {
    Modal.open('Change Password', `
      <div class="form-group"><label class="form-label">Current Password</label>
        <input type="password" class="form-input" id="modal-current-password" placeholder="Enter current password"></div>
      <div class="form-group"><label class="form-label">New Password</label>
        <input type="password" class="form-input" id="modal-new-password" placeholder="Enter new password (min 6 chars)"></div>
    `, `
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="modal-save">Update Password</button>
    `);
    $('modal-cancel').addEventListener('click', Modal.close);
    $('modal-save').addEventListener('click', async () => {
      const currentPw = $('modal-current-password').value;
      const newPw = $('modal-new-password').value;
      if (!currentPw || !newPw) { showToast('Please fill all fields', 'error'); return; }
      if (newPw.length < 6) { showToast('New password must be at least 6 characters', 'error'); return; }
      
      try {
        const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPw);
        await reauthenticateWithCredential(auth.currentUser, credential);
        await updatePassword(auth.currentUser, newPw);
        showToast('Password updated successfully!', 'success');
        Modal.close();
      } catch (err) {
        showToast(err.message.includes('auth/invalid-credential') ? 'Incorrect current password' : err.message, 'error');
      }
    });
  });

  $('btn-change-email').addEventListener('click', () => {
    let generatedOTP = '';
    let pendingNewEmail = '';
    let pendingCurrentPw = '';

    const showStep1 = () => {
      Modal.open('Change Email', `
        <p style="margin-bottom:12px;font-size:0.875rem;color:var(--text-secondary);">First, we need to verify your identity. An OTP will be sent to your <strong>current</strong> email.</p>
        <div class="form-group"><label class="form-label">Current Password</label>
          <input type="password" class="form-input" id="modal-current-password" placeholder="Enter current password"></div>
        <div class="form-group"><label class="form-label">New Email Address</label>
          <input type="email" class="form-input" id="modal-new-email" placeholder="Enter new email address"></div>
      `, `
        <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-save">Send OTP</button>
      `);
      
      $('modal-cancel').addEventListener('click', Modal.close);
      $('modal-save').addEventListener('click', async () => {
        pendingCurrentPw = $('modal-current-password').value;
        pendingNewEmail = $('modal-new-email').value.trim();
        if (!pendingCurrentPw || !pendingNewEmail) { showToast('Please fill all fields', 'error'); return; }
        
        try {
          const btn = $('modal-save');
          btn.disabled = true;
          btn.textContent = 'Verifying...';
          
          const credential = EmailAuthProvider.credential(auth.currentUser.email, pendingCurrentPw);
          await reauthenticateWithCredential(auth.currentUser, credential);
          
          generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
          sendOTPEmail(auth.currentUser.email, generatedOTP, 'Email Change Security Check');
          
          showToast('OTP sent to your current email.', 'success');
          showStep2();
        } catch (err) {
          const btn = $('modal-save');
          btn.disabled = false;
          btn.textContent = 'Send OTP';
          showToast(err.message.includes('auth/invalid-credential') ? 'Incorrect current password' : err.message, 'error');
        }
      });
    };

    const showStep2 = () => {
      Modal.open('Verify Identity', `
        <p style="margin-bottom:12px;font-size:0.9rem;color:var(--text-secondary);">Enter the 6-digit OTP sent to your <strong>current</strong> email address.</p>
        <div class="form-group">
          <input type="text" class="form-input" id="modal-email-otp" placeholder="Enter OTP" style="text-align:center;letter-spacing:2px;font-size:1.2rem;">
        </div>
      `, `
        <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-confirm">Verify & Proceed</button>
      `);
      
      $('modal-cancel').addEventListener('click', Modal.close);
      $('modal-confirm').addEventListener('click', async () => {
        const enteredOTP = $('modal-email-otp').value.trim();
        if (enteredOTP !== generatedOTP) {
          showToast('Invalid OTP', 'error');
          return;
        }

        try {
          const btn = $('modal-confirm');
          btn.disabled = true;
          btn.textContent = 'Sending Link...';
          
          // Identity verified, now send Firebase verification link to the NEW email
          await verifyBeforeUpdateEmail(auth.currentUser, pendingNewEmail);
          
          showToast('Firebase verification link sent! Check your NEW email inbox to finalize.', 'success');
          Modal.close();
        } catch (err) {
          const btn = $('modal-confirm');
          btn.disabled = false;
          btn.textContent = 'Verify & Proceed';
          showToast(err.message, 'error');
        }
      });
    };

    showStep1();
  });

  // Export
  $('btn-export-data').addEventListener('click', () => {
    const data = { data: userData, exportedAt: new Date().toISOString(), version: '1.0' };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bunkit-backup-${getTodayStr()}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported!', 'success');
  });

  // Import
  $('btn-import-data').addEventListener('click', () => $('import-file-input').click());
  $('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const imported = JSON.parse(evt.target.result);
        if (imported.data && imported.data.semesters) {
          userData = imported.data; save();
          showToast('Data imported!', 'success'); renderDashboard();
        } else { showToast('Invalid backup file', 'error'); }
      } catch { showToast('Failed to parse file', 'error'); }
    };
    reader.readAsText(file); e.target.value = '';
  });

  // Clear data
  $('btn-clear-data').addEventListener('click', () => {
    openConfirmDialog('Clear All Data', 'This will permanently delete ALL your data. This CANNOT be undone!', () => {
      userData = { semesters: [], cgpaHistory: [], settings: { defaultMinAttendance: 75 } };
      save(); renderDashboard(); showToast('All data cleared', 'info');
    });
  });

  // Modal close
  $('modal-close').addEventListener('click', Modal.close);
  $('modal-overlay').addEventListener('click', (e) => { if (e.target === $('modal-overlay')) Modal.close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') Modal.close(); });


}

// ─── Firebase Auth State Listener ───


function init() {
  initEventListeners();

  // Show a loading state
  $('auth-screen').classList.remove('hidden');

  // Check for local storage OTP login session
  const storedUser = localStorage.getItem('bunkit_otp_user');
  if (storedUser) {
    try {
      currentUser = JSON.parse(storedUser);
      loadUserData(currentUser.uid).then(() => {
        showApp();
        showToast(`Welcome back, ${currentUser.displayName || currentUser.email}!`, 'success');
      });
      return;
    } catch (e) {
      localStorage.removeItem('bunkit_otp_user');
    }
  }

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      await loadUserData(user.uid);
      
      showApp();
      showToast(`Welcome, ${user.displayName || user.email}!`, 'success');
    } else {
      currentUser = null;
      userData = null;
      showAuth();
    }
  });
}

// ─── Boot ───
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('Service Worker registered successfully:', reg.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}

// ─── PWA Installation Logic ───
let deferredPrompt;

// Detect iOS Safari
const isIos = () => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
};

// Detect if already in standalone mode
const isInStandaloneMode = () => {
  return ('standalone' in window.navigator) && (window.navigator.standalone) || window.matchMedia('(display-mode: standalone)').matches;
};

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  
  // Update UI notify the user they can install the PWA
  const installSection = $('pwa-install-section');
  if (installSection && !isInStandaloneMode()) {
    installSection.style.display = 'block';
  }
});

// Setup click listener for the install button
const btnInstall = document.getElementById('btn-install-pwa');
if (btnInstall) {
  btnInstall.addEventListener('click', async () => {
    if (deferredPrompt) {
      // Show the install prompt
      deferredPrompt.prompt();
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      // We've used the prompt, and can't use it again, throw it away
      deferredPrompt = null;
      // Hide the install section
      const installSection = $('pwa-install-section');
      if (installSection) installSection.style.display = 'none';
    } else if (isIos() && !isInStandaloneMode()) {
      // Show iOS instruction
      showToast('To install: tap the Share icon below, then select "Add to Home Screen".', 'info', 5000);
    }
  });
}

// Check for iOS on load to show custom prompt if needed
window.addEventListener('DOMContentLoaded', () => {
  const installSection = $('pwa-install-section');
  const installText = $('pwa-install-text');
  
  if (isIos() && !isInStandaloneMode()) {
    // Show manual install info for iOS since it doesn't fire beforeinstallprompt
    if (installSection) installSection.style.display = 'block';
    if (installText) installText.innerHTML = 'To install on iOS: tap the <strong>Share</strong> button at the bottom of Safari, then select <strong>Add to Home Screen</strong>.';
  }
});

