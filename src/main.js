// ============================================
// 🏥 SmartHealth AI — Main Application
// Doctor Booking & Queue Management
// ============================================

import './style.css';
import { analyzeSymptomsWithAI } from './services/aiService.js';
import { db } from './config/firebase.js';
import { collection, addDoc } from 'firebase/firestore';

// Check if AI API key is configured
const HAS_AI_KEY = import.meta.env.VITE_AI_API_KEY && 
  import.meta.env.VITE_AI_API_KEY !== 'your_ai_api_key_here' &&
  import.meta.env.VITE_AI_API_KEY.length > 10;

// ────────────────────────────────────────────
//  STATE
// ────────────────────────────────────────────
let allDoctors      = [];
let allAppointments = [];
let activeFilter    = 'all';
let searchQuery     = '';
let selectedDoctor  = null;
let selectedTimeSlot = '';

// ────────────────────────────────────────────
//  DOM REFERENCES
// ────────────────────────────────────────────
const $doctorsGrid       = document.getElementById('doctorsGrid');
const $appointmentsList  = document.getElementById('appointmentsList');
const $specialtiesBar    = document.getElementById('specialtiesBar');
const $searchInput       = document.getElementById('searchInput');
const $bottomNav         = document.getElementById('bottomNav');
const $toast             = document.getElementById('toast');
const $btnNotifications  = document.getElementById('btnNotifications');
const $notifPanel        = document.getElementById('notifPanel');
const $notifOverlay      = document.getElementById('notifOverlay');
const $notifClose        = document.getElementById('notifClose');

// Booking modal
const $appointmentModal  = document.getElementById('appointmentModal');
const $modalClose        = document.getElementById('modalClose');
const $modalDoctorAvatar = document.getElementById('modalDoctorAvatar');
const $modalDoctorName   = document.getElementById('modalDoctorName');
const $modalDoctorSpecialty = document.getElementById('modalDoctorSpecialty');
const $bookingForm       = document.getElementById('bookingForm');
const $bookingDate       = document.getElementById('bookingDate');
const $timeSlots         = document.getElementById('timeSlots');
const $selectedTimeInput = document.getElementById('selectedTimeSlot');
const $bookingSymptoms   = document.getElementById('bookingSymptoms');

// Success modal
const $successModal      = document.getElementById('successModal');
const $successDetails    = document.getElementById('successDetails');
const $btnDone           = document.getElementById('btnDone');

// ────────────────────────────────────────────
//  DATA LOADING
// ────────────────────────────────────────────
async function loadDoctors() {
  try {
    const res   = await fetch('/doctors.json');
    allDoctors  = await res.json();
    renderDoctors(allDoctors);
  } catch (err) {
    $doctorsGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-text">ไม่สามารถโหลดข้อมูลแพทย์ได้</div>
      </div>`;
  }
}

async function loadAppointments() {
  try {
    const res         = await fetch('/appointments.json');
    allAppointments   = await res.json();
    renderAppointments(allAppointments);
  } catch (err) {
    $appointmentsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-text">ไม่สามารถโหลดข้อมูลนัดหมายได้</div>
      </div>`;
  }
}

// ────────────────────────────────────────────
//  RENDER: DOCTORS
// ────────────────────────────────────────────
function renderDoctors(doctors) {
  const filtered = doctors.filter((doc) => {
    const matchFilter = activeFilter === 'all' || doc.department === activeFilter;
    const matchSearch = searchQuery === '' ||
      doc.name.includes(searchQuery) ||
      doc.specialty.includes(searchQuery) ||
      doc.department.includes(searchQuery) ||
      doc.bio.includes(searchQuery);
    return matchFilter && matchSearch;
  });

  if (filtered.length === 0) {
    $doctorsGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">🔍</div>
        <div class="empty-text">ไม่พบแพทย์ที่ตรงกับเงื่อนไข</div>
      </div>`;
    return;
  }

  $doctorsGrid.innerHTML = filtered.map((doc) => `
    <div class="doctor-card" data-id="${doc.id}">
      <div class="doctor-card-top">
        <div class="doctor-avatar">${doc.avatar}</div>
        <div class="doctor-info">
          <div class="doctor-name">${doc.name}</div>
          <div class="doctor-specialty">${doc.specialty}</div>
          <div class="doctor-bio">${doc.bio}</div>
        </div>
      </div>
      <div class="doctor-meta">
        <span class="meta-item"><span class="star">⭐</span> ${doc.rating}</span>
        <span class="meta-item">📅 ${doc.experience}</span>
        <span class="meta-item">⏰ ${doc.nextSlot}</span>
      </div>
      <div class="doctor-availability ${doc.available ? 'available' : 'unavailable'}">
        <span class="dot"></span>
        ${doc.available ? 'ว่างตอนนี้' : 'ไม่ว่าง'}
      </div>
      <button class="btn-book" ${!doc.available ? 'disabled' : ''} data-doctor-id="${doc.id}">
        ${doc.available ? '🗓️ นัดหมายแพทย์' : '⏰ นัดหมายครั้งถัดไป'}
      </button>
    </div>
  `).join('');

  // Bind book buttons
  $doctorsGrid.querySelectorAll('.btn-book:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      const doctorId = btn.getAttribute('data-doctor-id');
      const doctor   = allDoctors.find((d) => d.id === doctorId);
      if (doctor) openBookingModal(doctor);
    });
  });
}

// ────────────────────────────────────────────
//  RENDER: APPOINTMENTS (clickable cards)
// ────────────────────────────────────────────
function renderAppointments(appointments) {
  if (appointments.length === 0) {
    $appointmentsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <div class="empty-text">ยังไม่มีนัดหมาย</div>
      </div>`;
    return;
  }

  $appointmentsList.innerHTML = appointments.map((apt) => {
    const statusClass = getStatusClass(apt.status);
    return `
      <div class="appointment-card clickable" data-apt-id="${apt.id}">
        <div class="apt-queue-badge">
          <span class="queue-label">คิว</span>
          ${apt.queueNumber}
        </div>
        <div class="apt-details">
          <div class="apt-doctor">${apt.doctorName}</div>
          <div class="apt-dept">${apt.department}</div>
          <div class="apt-time">📅 ${formatDate(apt.date)} เวลา ${apt.time}</div>
        </div>
        <span class="apt-status ${statusClass}">${apt.status}</span>
        <span class="apt-detail-arrow">›</span>
      </div>`;
  }).join('');

  // Bind click to open detail modal
  $appointmentsList.querySelectorAll('.appointment-card.clickable').forEach((card) => {
    card.addEventListener('click', () => {
      const aptId = card.getAttribute('data-apt-id');
      const apt   = allAppointments.find((a) => a.id === aptId);
      if (apt) openAptDetailModal(apt);
    });
  });
}

function getStatusClass(status) {
  if (status === 'รอเข้าพบ')        return 'pending';
  if (status === 'กำลังดำเนินการ')   return 'in-progress';
  if (status === 'ยืนยันแล้ว')       return 'confirmed';
  if (status === 'เสร็จสิ้น')         return 'completed';
  return 'pending';
}

function formatDate(dateStr) {
  const d     = new Date(dateStr);
  const day   = d.getDate();
  const month = d.toLocaleDateString('th-TH', { month: 'short' });
  const year  = d.getFullYear() + 543;
  return `${day} ${month} ${year}`;
}

function generateQueueNumber() {
  const letters = ['A', 'B', 'C', 'D', 'E'];
  const letter  = letters[Math.floor(Math.random() * letters.length)];
  const num     = String(Math.floor(Math.random() * 900) + 100);
  return `${letter}-${num}`;
}

// ────────────────────────────────────────────
//  SPECIALTIES FILTER
// ────────────────────────────────────────────
$specialtiesBar.addEventListener('click', (e) => {
  const chip = e.target.closest('.specialty-chip');
  if (!chip) return;

  $specialtiesBar.querySelectorAll('.specialty-chip').forEach((c) => {
    c.classList.remove('active');
    c.setAttribute('aria-selected', 'false');
  });
  chip.classList.add('active');
  chip.setAttribute('aria-selected', 'true');
  activeFilter = chip.getAttribute('data-filter');
  renderDoctors(allDoctors);
});

// ────────────────────────────────────────────
//  SEARCH
// ────────────────────────────────────────────
$searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  renderDoctors(allDoctors);
});

// ────────────────────────────────────────────
//  BOTTOM NAVIGATION
// ────────────────────────────────────────────
$bottomNav.addEventListener('click', (e) => {
  const navItem = e.target.closest('.nav-item');
  if (!navItem) return;

  const pageId = navItem.getAttribute('data-page');

  $bottomNav.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  navItem.classList.add('active');

  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById(pageId)?.classList.add('active');
});

// ────────────────────────────────────────────
//  NOTIFICATIONS PANEL
// ────────────────────────────────────────────
function openNotifPanel() {
  $notifPanel.classList.add('active');
  $notifOverlay.classList.add('active');
}

function closeNotifPanel() {
  $notifPanel.classList.remove('active');
  $notifOverlay.classList.remove('active');
}

$btnNotifications.addEventListener('click', openNotifPanel);
$notifClose.addEventListener('click', closeNotifPanel);
$notifOverlay.addEventListener('click', closeNotifPanel);

// ────────────────────────────────────────────
//  BOOKING MODAL
// ────────────────────────────────────────────
function openBookingModal(doctor) {
  selectedDoctor = doctor;

  // Populate doctor info
  $modalDoctorAvatar.textContent   = doctor.avatar;
  $modalDoctorName.textContent     = doctor.name;
  $modalDoctorSpecialty.textContent = doctor.specialty;

  // Set min date to today
  const today = new Date();
  const yyyy  = today.getFullYear();
  const mm    = String(today.getMonth() + 1).padStart(2, '0');
  const dd    = String(today.getDate()).padStart(2, '0');
  $bookingDate.min = `${yyyy}-${mm}-${dd}`;
  $bookingDate.value = `${yyyy}-${mm}-${dd}`;

  // Reset form
  selectedTimeSlot = '';
  $selectedTimeInput.value = '';
  $bookingSymptoms.value   = '';
  $timeSlots.querySelectorAll('.time-slot').forEach((s) => s.classList.remove('selected'));

  $appointmentModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeBookingModal() {
  $appointmentModal.classList.remove('active');
  document.body.style.overflow = '';
  selectedDoctor = null;
}

$modalClose.addEventListener('click', closeBookingModal);
$appointmentModal.addEventListener('click', (e) => {
  if (e.target === $appointmentModal) closeBookingModal();
});

// ────────────────────────────────────────────
//  TIME SLOT SELECTOR
// ────────────────────────────────────────────
$timeSlots.addEventListener('click', (e) => {
  const slot = e.target.closest('.time-slot');
  if (!slot) return;

  $timeSlots.querySelectorAll('.time-slot').forEach((s) => s.classList.remove('selected'));
  slot.classList.add('selected');

  selectedTimeSlot = slot.getAttribute('data-time');
  $selectedTimeInput.value = selectedTimeSlot;
});

// ────────────────────────────────────────────
//  BOOKING FORM SUBMISSION
// ────────────────────────────────────────────
$bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!selectedDoctor) return;

  // Validate time slot
  if (!selectedTimeSlot) {
    showToast('⚠️ กรุณาเลือกช่วงเวลาที่ต้องการนัดหมาย');
    return;
  }

  // Get submit button and show loading state
  const submitBtn = $bookingForm.querySelector('.btn-confirm-booking');
  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ กำลังบันทึกข้อมูล...';

  const date      = $bookingDate.value;
  const symptoms  = $bookingSymptoms.value.trim();
  const queueNum  = generateQueueNumber();

  // Build Firestore document — exact fields matching schema
  const appointmentData = {
    user_id: 'u001',
    doctor_id: selectedDoctor.id,
    doctor_name: selectedDoctor.name,
    department: selectedDoctor.department,
    date: date,
    time_slot: selectedTimeSlot,
    symptom: symptoms || '',
    status: 'CONFIRMED',
    created_at: new Date().toISOString(),
  };

  try {
    // Save to Firestore 'appointments' collection
    const docRef = await addDoc(collection(db, 'appointments'), appointmentData);

    // Build display object for local queue list
    const displayAppointment = {
      id: docRef.id,
      patientName: 'ท่าน (ผู้ใช้แอป)',
      doctorName: selectedDoctor.name,
      department: selectedDoctor.department,
      date: date,
      time: selectedTimeSlot,
      status: 'ยืนยันแล้ว',
      symptoms: symptoms || 'ไม่ได้ระบุ',
      queueNumber: queueNum,
    };

    allAppointments.unshift(displayAppointment);
    renderAppointments(allAppointments);

    // Close modal
    closeBookingModal();

    // Reset button state
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;

    // Clear error messages / static states
    // Navigate to appointments tab so user sees the new ticket
    const aptNavItem = $bottomNav.querySelector('[data-page="pageAppointments"]');
    if (aptNavItem) aptNavItem.click();

    showToast('✅ จองนัดหมายสำเร็จ! ดูตั๋วคิวในแทบนัดหมาย');

  } catch (err) {

    // Restore button fully
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;

    showToast('❌ ไม่สามารถบันทึกนัดหมาย กรุณาลองอีกครั้ง');
  }
});

// ────────────────────────────────────────────
//  SUCCESS MODAL
// ────────────────────────────────────────────
function showSuccessModal(apt) {
  $successDetails.innerHTML = `
    <strong>👨‍⚕️ แพทย์:</strong> ${apt.doctorName}<br />
    <strong>📋 แผนก:</strong> ${apt.department}<br />
    <strong>📅 วันที่:</strong> ${formatDate(apt.date)}<br />
    <strong>🕐 เวลา:</strong> ${apt.time}<br />
    <strong>🎫 หมายเลขคิว:</strong> ${apt.queueNumber}<br />
    <strong>📝 อาการ:</strong> ${apt.symptoms}
  `;

  $successModal.classList.add('active');
}

$btnDone.addEventListener('click', () => {
  $successModal.classList.remove('active');
  showToast('✅ จองนัดหมายสำเร็จ! ตรวจสอบได้ที่แท็บนัดหมาย');
});

$successModal.addEventListener('click', (e) => {
  if (e.target === $successModal) {
    $successModal.classList.remove('active');
  }
});

// ────────────────────────────────────────────
//  APPOINTMENT DETAIL MODAL
// ────────────────────────────────────────────
const $aptDetailModal   = document.getElementById('aptDetailModal');
const $aptDetailClose   = document.getElementById('aptDetailClose');
const $btnDetailClose   = document.getElementById('btnDetailClose');

function openAptDetailModal(apt) {
  // Find matching doctor for avatar
  const doctor = allDoctors.find((d) => d.id === apt.doctor_id || d.name === apt.doctorName);

  document.getElementById('detailQueueCode').textContent  = apt.queueNumber || '—';
  document.getElementById('detailDoctorAvatar').textContent = doctor?.avatar || '👨‍⚕️';
  document.getElementById('detailDoctorName').textContent  = apt.doctorName || '—';
  document.getElementById('detailDoctorDept').textContent  = apt.department || '—';
  document.getElementById('detailDate').textContent        = formatDate(apt.date);
  document.getElementById('detailTime').textContent        = apt.time || apt.time_slot || '—';

  // Status
  const statusEl = document.getElementById('detailStatus');
  statusEl.textContent = apt.status || '—';
  statusEl.className = `apt-status ${getStatusClass(apt.status)}`;

  // Symptoms
  document.getElementById('detailSymptoms').textContent = apt.symptoms || apt.symptom || 'ไม่ได้ระบุ';

  // Generate barcode lines from queue number
  generateBarcode(apt.queueNumber || '000');

  $aptDetailModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeAptDetailModal() {
  $aptDetailModal.classList.remove('active');
  document.body.style.overflow = '';
}

function generateBarcode(code) {
  const container = document.getElementById('barcodeLines');
  const chars = code.replace(/[^A-Za-z0-9]/g, '').padEnd(6, '0').substring(0, 8);
  let html = '';
  for (let i = 0; i < 30; i++) {
    const char = chars[i % chars.length] || '0';
    const width = 2 + (char.charCodeAt(0) % 4);
    const gap = 1 + (char.charCodeAt(0) % 3);
    html += `<span style="display:inline-block;width:${width}px;height:${14 + (i % 3) * 4}px;background:#222;margin-right:${gap}px;border-radius:1px;"></span>`;
  }
  container.innerHTML = html;
}

$aptDetailClose.addEventListener('click', closeAptDetailModal);
$btnDetailClose.addEventListener('click', closeAptDetailModal);
$aptDetailModal.addEventListener('click', (e) => {
  if (e.target === $aptDetailModal) closeAptDetailModal();
});

// ────────────────────────────────────────────
//  AI TAB — DOM REFS
// ────────────────────────────────────────────
const $aiSymptomInput        = document.getElementById('aiSymptomInput');
const $btnAnalyzeAI          = document.getElementById('btnAnalyzeAI');
const $aiLoadingContainer    = document.getElementById('aiLoadingContainer');
const $aiAnalysisResult      = document.getElementById('aiAnalysisResult');
const $aiSymptomSection      = document.getElementById('aiSymptomSection');
const $recommendedDoctorsGrid = document.getElementById('recommendedDoctorsGrid');
const $btnSearchAgain        = document.getElementById('btnSearchAgain');

// Enable button when text is entered
if ($aiSymptomInput) {
  $aiSymptomInput.addEventListener('input', () => {
    $btnAnalyzeAI.disabled = $aiSymptomInput.value.trim().length === 0;
  });
}

// ────────────────────────────────────────────
//  AI TAB — ANALYSIS FLOW
// ────────────────────────────────────────────
$btnAnalyzeAI?.addEventListener('click', async () => {
  const symptoms = $aiSymptomInput.value.trim();
  if (!symptoms) {
    showToast('⚠️ กรุณาระบุอาการของท่านก่อนวิเคราะห์');
    $aiSymptomInput.focus();
    return;
  }

  // Show loading
  $aiSymptomSection.style.display = 'none';
  $aiAnalysisResult.classList.remove('active');
  $aiLoadingContainer.classList.add('active');
  $btnAnalyzeAI.disabled = true;

  try {
    const result = await analyzeSymptomsWithAI(symptoms);
    displayAIAnalysisResult(result);
  } catch (err) {
    showToast('❌ เกิดข้อผิดพลาดในการวิเคราะห์');
    $aiSymptomSection.style.display = 'block';
    $aiLoadingContainer.classList.remove('active');
    $btnAnalyzeAI.disabled = false;
  }
});

function displayAIAnalysisResult(result) {
  $aiLoadingContainer.classList.remove('active');

  // --- Severity Gauge ---
  let gaugeScore = 4; // default moderate
  let gaugeColor = '#f97316'; // orange
  let gaugeLabel = '⚠️ ปานกลาง';

  if (result.urgency?.includes('วิกฤต')) {
    gaugeScore = 8;
    gaugeColor = '#ef4444'; // red
    gaugeLabel = '🚨 วิกฤต';
  } else if (result.urgency?.includes('ปานกลาง')) {
    gaugeScore = 4;
    gaugeColor = '#f97316'; // orange
    gaugeLabel = '⚠️ ปานกลาง';
  } else {
    gaugeScore = 2;
    gaugeColor = '#22c55e'; // green
    gaugeLabel = '✅ ปกติ';
  }

  // Update gauge arc
  const totalDash = 157;
  const offset = totalDash - (gaugeScore / 10) * totalDash;
  const gaugeArc = document.getElementById('gaugeArc');
  if (gaugeArc) {
    gaugeArc.setAttribute('stroke', gaugeColor);
    gaugeArc.setAttribute('stroke-dashoffset', String(Math.max(0, offset)));
  }

  document.getElementById('gaugeScore').textContent = `${gaugeScore}/10`;
  document.getElementById('gaugeLabel').textContent = gaugeLabel;

  // --- Symptom text ---
  document.getElementById('gaugeSymptomText').textContent = result.summary || '—';

  // --- Recommended Department ---
  document.getElementById('reportSpecialist').textContent = result.specialist || '—';

  // --- Detailed Recommendations ---
  const recommendList = document.getElementById('recommendList');
  const recommendation = result.recommendation || '';

  // Build bulleted items from the recommendation text
  const items = [];
  const recLower = recommendation.toLowerCase();

  // Map keywords to icons
  if (recLower.includes('พักผ่อน') || recLower.includes('นอน') || recLower.includes('พัก')) {
    items.push({ icon: '🛌', text: 'พักผ่อนให้เพียงพอ หลีกเลี่ยงการทำงานหนัก' });
  }
  if (recLower.includes('น้ำ') || recLower.includes('ดื่ม')) {
    items.push({ icon: '💧', text: 'ดื่มน้ำสะอาดมากๆ อย่างน้อยวันละ 8-10 แก้ว' });
  }
  if (recLower.includes('ย') || recLower.includes('กินยา') || recLower.includes('ทานยา') || recLower.includes('ปรึกษาแพทย์')) {
    items.push({ icon: '💊', text: 'รับประทานยาตามแพทย์สั่งอย่างเคร่งครัด' });
  }
  if (recLower.includes('พบแพทย์') || recLower.includes('ตรวจ') || recLower.includes('นัดหมาย') || recLower.includes('โรงพยาบาล') || recLower.includes('แผนก')) {
    items.push({ icon: '🏥', text: recommendation.substring(0, 80) });
  }
  if (recLower.includes('ไข้') || recLower.includes('วัดไข้') || recLower.includes('อุณหภูมิ')) {
    items.push({ icon: '🌡️', text: 'วัดอุณหภูมิร่างกายทุก 4-6 ชั่วโมง' });
  }
  if (recLower.includes('ฉุกเฉิน') || recLower.includes('1669') || recLower.includes('ทันที')) {
    items.push({ icon: '🚑', text: 'หากอาการรุนแรงขึ้น ให้รีบไปพบแพทย์หรือโทร 1669 ทันที' });
  }
  if (recLower.includes('สังเกตอาการ')) {
    items.push({ icon: '👁️', text: 'สังเกตอาการอย่างใกล้ชิด หากไม่ดีขึ้นภายใน 3 วัน ควรพบแพทย์' });
  }

  // Fallback: if no items matched, split by sentences
  if (items.length === 0) {
    const sentences = recommendation.split(/[.]\s*/).filter(s => s.trim());
    sentences.forEach((s) => {
      items.push({ icon: '•', text: s.trim() });
    });
  }

  if (items.length === 0) {
    items.push({ icon: '📝', text: 'ไม่พบคำแนะนำเฉพาะสำหรับอาการนี้ กรุณาปรึกษาแพทย์เพื่อข้อมูลเพิ่มเติม' });
  }

  recommendList.innerHTML = items.map((item) => `
    <div class="recommend-item">
      <span class="recommend-item-icon">${item.icon}</span>
      <span>${item.text}</span>
    </div>
  `).join('');

  // --- Disclaimer ---
  document.getElementById('reportDisclaimer').textContent = result.disclaimer || '⚠️ นี่เป็นผลการวิเคราะห์จาก AI เบื้องต้น ไม่ใช่การวินิจฉัยทางการแพทย์ กรุณาปรึกษาแพทย์เพื่อการวินิจฉัยที่แม่นยำ';

  // Filter and render doctors based on AI-recommended specialist
  renderRecommendedDoctors(result.specialist);

  $aiAnalysisResult.classList.add('active');
  $btnAnalyzeAI.disabled = false;
}

function mapSpecialistToDepartment(specialist) {
  if (!specialist) return 'all';
  const text = specialist.toLowerCase();
  if (text.includes('อายุรกรรม') || text.includes('ฉุกเฉิน') || text.includes('ทั่วไป')) return 'อายุรกรรม';
  if (text.includes('เด็ก') || text.includes('กุมาร')) return 'แผนกเด็ก';
  if (text.includes('ทันต')) return 'ทันตกรรม';
  if (text.includes('ศัลย') || text.includes('กระดูก')) return 'ศัลยกรรม';
  // Map English/medical department names from AI
  if (text.includes('psychiatry') || text.includes('จิตเวช')) return 'อายุรกรรม';
  if (text.includes('dermatology') || text.includes('ผิวหนัง')) return 'อายุรกรรม';
  if (text.includes('cardiology') || text.includes('หัวใจ')) return 'อายุรกรรม';
  if (text.includes('pediatrics') || text.includes('เด็ก')) return 'แผนกเด็ก';
  if (text.includes('orthopedics') || text.includes('กระดูก')) return 'ศัลยกรรม';
  return 'all';
}

function renderRecommendedDoctors(specialist) {
  const dept = mapSpecialistToDepartment(specialist);

  let filtered = allDoctors.filter((doc) => {
    if (dept === 'all') return true;
    return doc.department === dept;
  });

  // Sort: available first, then by rating
  filtered.sort((a, b) => (b.available ? 1 : 0) - (a.available ? 1 : 0) || b.rating - a.rating);

  if (filtered.length === 0) {
    filtered = [...allDoctors].sort((a, b) => (b.available ? 1 : 0) - (a.available ? 1 : 0));
  }

  if (filtered.length === 0) {
    $recommendedDoctorsGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">👨‍⚕️</div><div class="empty-text">ไม่พบแพทย์ที่แนะนำในขณะนี้</div></div>';
    return;
  }

  $recommendedDoctorsGrid.innerHTML = filtered.map((doc) => `
    <div class="doctor-card" data-id="${doc.id}">
      <div class="doctor-card-top">
        <div class="doctor-avatar">${doc.avatar}</div>
        <div class="doctor-info">
          <div class="doctor-name">${doc.name}</div>
          <div class="doctor-specialty">${doc.specialty}</div>
          <div class="doctor-bio">${doc.bio}</div>
        </div>
      </div>
      <div class="doctor-meta">
        <span class="meta-item"><span class="star">⭐</span> ${doc.rating}</span>
        <span class="meta-item">📅 ${doc.experience}</span>
        <span class="meta-item">⏰ ${doc.nextSlot}</span>
      </div>
      <div class="doctor-availability ${doc.available ? 'available' : 'unavailable'}">
        <span class="dot"></span>
        ${doc.available ? 'ว่างตอนนี้' : 'ไม่ว่าง'}
      </div>
      <button class="btn-book" ${!doc.available ? 'disabled' : ''} data-doctor-id="${doc.id}">
        ${doc.available ? '🗓️ นัดหมายแพทย์ทันที' : '⏰ นัดหมายครั้งถัดไป'}
      </button>
    </div>
  `).join('');

  // Bind book buttons inside recommended section
  $recommendedDoctorsGrid.querySelectorAll('.btn-book:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      const doctorId = btn.getAttribute('data-doctor-id');
      const doctor   = allDoctors.find((d) => d.id === doctorId);
      if (doctor) openBookingModal(doctor);
    });
  });
}

// Search Again button
$btnSearchAgain?.addEventListener('click', () => {
  $aiAnalysisResult.classList.remove('active');
  $aiSymptomSection.style.display = 'block';
  $aiSymptomInput.value = '';
  $aiSymptomInput.focus();
  $btnAnalyzeAI.disabled = true;
});

// ────────────────────────────────────────────
//  TOAST
// ────────────────────────────────────────────
let toastTimeout;
function showToast(message) {
  clearTimeout(toastTimeout);
  $toast.textContent = message;
  $toast.classList.add('show');
  toastTimeout = setTimeout(() => $toast.classList.remove('show'), 3000);
}

// ────────────────────────────────────────────
//  INIT
// ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadDoctors();
  loadAppointments();
});