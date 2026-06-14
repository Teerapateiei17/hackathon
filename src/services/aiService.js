// ============================================
// 🤖 AI Symptom Analysis Service — SmartHealth AI
// Supports OpenAI & Gemini APIs with fallback
// ============================================

const AI_API_KEY = import.meta.env.VITE_AI_API_KEY || '';
const AI_API_URL = import.meta.env.VITE_AI_API_URL || 'https://api.openai.com/v1/chat/completions';

/**
 * @typedef {Object} Diagnosis
 * @property {string} urgency        – "🚨 วิกฤต" | "⚠️ ปานกลาง" | "✅ ปกติ"
 * @property {string} recommendation – Natural-language Thai recommendation
 * @property {string} specialist     – Recommended specialist department
 * @property {string} summary        – Short AI-generated summary
 * @property {string} disclaimer     – Medical disclaimer
 */

// ────────────────────────────────────────────
//  SYSTEM PROMPT TEMPLATE
// ────────────────────────────────────────────
const SYSTEM_PROMPT = `คุณเป็น AI ผู้ช่วยวินิจฉัยอาการเบื้องต้นสำหรับแอป SmartHealth AI
คุณต้องตอบกลับเป็น JSON object เท่านั้น ไม่มี markdown ไม่มีข้อความอื่น

รูปแบบ JSON ที่ต้องการ:
{
  "urgency": "🚨 วิกฤต" หรือ "⚠️ ปานกลาง" หรือ "✅ ปกติ",
  "recommendation": "คำแนะนำเป็นภาษาไทย 1-2 ประโยค",
  "specialist": "แผนกที่แนะนำ เช่น อายุรกรรมทั่วไป, กุมารเวชกรรม, ทันตกรรม, ศัลยกรรมกระดูก",
  "summary": "สรุปอาการสั้นๆ เป็นภาษาไทย",
  "disclaimer": "⚠️ นี่เป็นผลการวิเคราะห์จาก AI เบื้องต้น ไม่ใช่การวินิจฉัยทางการแพทย์ กรุณาปรึกษาแพทย์เพื่อการวินิจฉัยที่แม่นยำ"
}

เกณฑ์ความเร่งด่วน:
- วิกฤต: อาการอันตรายถึงชีวิต เช่น เจ็บหน้าอก หายใจไม่ออก ชัก เลือดออกมาก อุบัติเหตุร้ายแรง
- ปานกลาง: อาการที่ควรพบแพทย์ภายใน 24 ชม. เช่น ไข้สูง ปวดรุนแรง อาเจียนต่อเนื่อง
- ปกติ: อาการทั่วไปที่สังเกตอาการได้

ผู้ป่วยรายงานอาการ:`;

// ────────────────────────────────────────────
//  MOCK / FALLBACK — when API key is missing
// ────────────────────────────────────────────
function generateMockDiagnosis(symptomText) {
  const text = symptomText.toLowerCase();
  let urgency = '✅ ปกติ';
  let recommendation = '';
  let specialist = 'อายุรกรรมทั่วไป';

  if (text.includes('เจ็บหน้าอก') || text.includes('หายใจไม่ออก') || text.includes('ชัก') || text.includes('เลือดออกมาก') || text.includes('อุบัติเหตุ')) {
    urgency      = '🚨 วิกฤต';
    specialist   = 'เวชศาสตร์ฉุกเฉิน';
    recommendation = 'อาการของท่านมีความรุนแรงสูง กรุณาเข้าห้องฉุกเฉินที่ใกล้ที่สุดทันที หรือโทร 1669 เพื่อขอความช่วยเหลือฉุกเฉิน';
  } else if (text.includes('ไข้') || text.includes('ไอ') || text.includes('เจ็บคอ') || text.includes('ปวดหัว') || text.includes('ท้องเสีย') || text.includes('อาเจียน') || text.includes('ท้องร่วง')) {
    urgency      = '⚠️ ปานกลาง';
    specialist   = 'อายุรกรรมทั่วไป';
    recommendation = 'อาการของท่านควรได้รับการตรวจประเมินจากแพทย์ภายใน 24 ชั่วโมง กรุณานัดหมายแพทย์แผนกอายุรกรรมทั่วไป และพักผ่อนให้เพียงพอ ดื่มน้ำมากๆ';
  } else if (text.includes('ฟัน') || text.includes('เหงือก') || text.includes('ปวดฟัน')) {
    urgency      = '⚠️ ปานกลาง';
    specialist   = 'ทันตกรรม';
    recommendation = 'อาการเกี่ยวกับช่องปาก แนะนำให้เข้ารับการตรวจกับทันตแพทย์โดยเร็ว กรุณานัดหมายแผนกทันตกรรม';
  } else if (text.includes('เด็ก') || text.includes('ทารก')) {
    urgency      = '⚠️ ปานกลาง';
    specialist   = 'กุมารเวชกรรม';
    recommendation = 'สำหรับผู้ป่วยเด็ก แนะนำให้เข้ารับการตรวจกับกุมารแพทย์โดยเร็ว เพื่อป้องกันภาวะขาดน้ำ';
  } else if (text.includes('กระดูก') || text.includes('ข้อ') || text.includes('หกล้ม') || text.includes('ปวดหลัง')) {
    urgency      = '⚠️ ปานกลาง';
    specialist   = 'ศัลยกรรมกระดูก';
    recommendation = 'อาการเกี่ยวกับกระดูกและข้อ แนะนำให้เข้ารับการตรวจกับศัลยแพทย์ orthopedic เพื่อประเมินอาการ';
  }

  return {
    urgency,
    recommendation,
    specialist,
    summary: `การวิเคราะห์จาก AI สำหรับอาการ: "${symptomText.substring(0, 60)}${symptomText.length > 60 ? '...' : ''}"`,
    disclaimer: '⚠️ นี่เป็นผลการวิเคราะห์จาก AI เบื้องต้น ไม่ใช่การวินิจฉัยทางการแพทย์ กรุณาปรึกษาแพทย์เพื่อการวินิจฉัยที่แม่นยำ',
  };
}

// ────────────────────────────────────────────
//  API PROVIDER DETECTION
// ────────────────────────────────────────────
function isGeminiAPI(url) {
  return url.includes('generativelanguage.googleapis.com') || url.includes('gemini');
}

// ────────────────────────────────────────────
//  OPENAI API CALL
// ────────────────────────────────────────────
async function callOpenAI(symptomText) {
  const response = await fetch(AI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model:       'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: symptomText },
      ],
      temperature: 0.3,
      max_tokens:  500,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
  }

  const data     = await response.json();
  const rawReply = data.choices?.[0]?.message?.content || '';
  const jsonStr  = rawReply.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(jsonStr);
}

// ────────────────────────────────────────────
//  GEMINI API CALL
// ────────────────────────────────────────────
async function callGemini(symptomText) {
  // Gemini uses URL-based API key and different body format
  const separator = AI_API_URL.includes('?') ? '&' : '?';
  const urlWithKey = `${AI_API_URL}${separator}key=${AI_API_KEY}`;

  const response = await fetch(urlWithKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${symptomText}` }] }],
      generationConfig: {
        temperature:      0.3,
        maxOutputTokens:  500,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
  }

  const data     = await response.json();
  const rawReply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const jsonStr  = rawReply.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(jsonStr);
}

// ────────────────────────────────────────────
//  UNIVERSAL AI CALL (auto-detects provider)
// ────────────────────────────────────────────
async function callRealAI(symptomText) {
  if (isGeminiAPI(AI_API_URL)) {
    console.log('🤖 Calling Google Gemini API...');
    return callGemini(symptomText);
  }
  console.log('🤖 Calling OpenAI-compatible API...');
  return callOpenAI(symptomText);
}

// ────────────────────────────────────────────
//  PUBLIC API
// ────────────────────────────────────────────

/**
 * Analyze patient symptoms using AI (real API or mock fallback).
 * @param {string} symptomText – Thai description of symptoms
 * @returns {Promise<Diagnosis>}
 */
export async function analyzeSymptomsWithAI(symptomText) {
  if (!symptomText || symptomText.trim().length === 0) {
    return {
      urgency:    '✅ ปกติ',
      recommendation: 'กรุณาระบุอาการของท่านเพื่อให้ AI ช่วยวิเคราะห์',
      specialist: 'อายุรกรรมทั่วไป',
      summary:    'ไม่พบข้อมูลอาการ',
      disclaimer: '',
    };
  }

  // Use real AI if API key is configured and valid
  if (AI_API_KEY && AI_API_KEY !== 'your_ai_api_key_here' && AI_API_KEY.length > 10) {
    try {
      const result = await callRealAI(symptomText);
      // Validate response structure
      if (result.urgency && result.recommendation && result.specialist) {
        console.log('✅ AI response received successfully');
        return result;
      }
      console.warn('⚠️ AI response missing required fields, using mock');
    } catch (err) {
      console.warn('⚠️ AI API call failed, falling back to mock:', err.message);
    }
  } else {
    console.log('ℹ️  No valid AI API key — using smart mock diagnosis');
  }

  // Graceful fallback: simulated delay + keyword-based mock
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return generateMockDiagnosis(symptomText);
}