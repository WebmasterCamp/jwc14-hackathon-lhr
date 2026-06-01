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
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsZHloenN3Z2thaGpuenlzbXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyODM4NjAsImV4cCI6MjA5NTg1OTg2MH0.TdaGwAwnWih_JOuqPpS3_km8Z450idZyaKs-WdRHQRQ'
};
