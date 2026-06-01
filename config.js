// ============================================================
//  config.js — Capturow
//  ⚠️  ห้าม commit ไฟล์นี้ขึ้น git (ถูก .gitignore ไว้แล้ว)
//  ต้องอัปขึ้น server แยกต่างหากทุกครั้ง
// ============================================================

// วิธีดึง key จาก Supabase:
//
//  1. เข้า https://supabase.com → เลือก project ของคุณ
//  2. เมนูซ้าย → คลิก "Project Settings" (ไอคอนรูปเฟือง)
//  3. เลือกหัวข้อ "API" ในเมนูย่อย
//  4. หัวข้อ "Project URL"  → copy ค่ามาใส่ SUPABASE_URL
//  5. หัวข้อ "Project API keys" → แถว "anon public" → copy มาใส่ SUPABASE_ANON_KEY
//
//  ⚠️  ใช้ "anon public" เท่านั้น ห้ามใช้ "service_role" เด็ดขาด

const ENV = {
  SUPABASE_URL:      'https://rldyhzswgkahjnzysmsk.supabase.co',
  SUPABASE_ANON_KEY: 'sb_secret_V5FZfAqCUGeNIChkhbkW5A_55oav4vd'
};
