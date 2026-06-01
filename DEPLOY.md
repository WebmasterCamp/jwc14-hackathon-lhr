# การ Deploy Capturow

## ภาพรวม

โปรเจกต์นี้เป็น static web app (HTML + JS ล้วนๆ) ไม่มี build step  
ข้อมูลรูปภาพเก็บใน **Supabase** (cloud) หรือ **localStorage** (fallback)

---

## ไฟล์ที่ต้องรู้จัก

| ไฟล์ | อธิบาย | ติด git? |
|------|--------|----------|
| `index.html` | หน้าหลักของแอป | ✅ |
| `script.js` | logic ทั้งหมด | ✅ |
| `config.js` | เก็บ Supabase keys | ❌ (gitignore) |
| `.gitignore` | ซ่อน config.js และ .env | ✅ |

> ⚠️ **`config.js` ห้าม commit ขึ้น git เด็ดขาด** เพราะมี secret key อยู่

---

## ขั้นตอนที่ 1 — ตั้งค่า Supabase

### 1.1 สร้าง Project

1. ไปที่ [https://supabase.com](https://supabase.com) → **Start your project**
2. สร้าง project ใหม่ ตั้งชื่อและ password
3. รอ project พร้อม (~2 นาที)

### 1.2 สร้าง Table

ไปที่ **Table Editor** → **New Table** ตั้งค่าดังนี้:

```
Table name: memories
Columns:
  - id          : int8, primary key, auto-increment
  - image_url   : text, not null
  - file_name   : text
  - created_at  : timestamptz, default: now()
```

### 1.3 สร้าง Storage Bucket

ไปที่ **Storage** → **New Bucket**:

```
Bucket name : memory-files
Public      : ✅ (เปิด Public)
```

### 1.4 ตั้ง Storage Policy

ใน bucket `memory-files` → **Policies** → **New Policy** → เลือก "For full customization":

```
Policy name : allow all
Allowed operation : SELECT, INSERT
Target roles : anon
```

### 1.5 เอา Keys มา

ไปที่ **Settings → API**:

- **Project URL** → copy
- **anon public** key → copy

---

## ขั้นตอนที่ 2 — ใส่ค่าใน config.js

เปิดไฟล์ `config.js` แล้วแทนค่า:

```js
const ENV = {
  SUPABASE_URL:      'https://xxxxxxxxxxxx.supabase.co',  // ← ใส่ Project URL
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...',  // ← ใส่ anon key
};
```

---

## ขั้นตอนที่ 3 — Deploy ขึ้น Server

### ตัวเลือก A: GitHub Pages (ฟรี)

1. Push โค้ดขึ้น GitHub (**โดยไม่มี config.js**)
2. ไปที่ repo → **Settings → Pages**
3. Source: `Deploy from a branch` → branch `main` → folder `/root`
4. กด Save → รอ 1-2 นาที
5. **อัป `config.js` แยกต่างหาก** ผ่าน SSH หรือ FTP ไปวางที่ root ของ server

> GitHub Pages ไม่รองรับการอัปไฟล์ที่ถูก gitignore โดยตรง  
> ต้องใช้วิธีด้านล่าง

### ตัวเลือก B: Netlify (แนะนำ)

1. ไปที่ [https://netlify.com](https://netlify.com) → **Add new site → Deploy manually**
2. ลาก folder โปรเจกต์ทั้งหมด (รวม `config.js`) ไปวาง
3. Netlify จะ deploy ให้อัตโนมัติ

> วิธีนี้ง่ายที่สุด เพราะอัปไฟล์ทั้งหมดรวมถึง `config.js` ได้เลย

### ตัวเลือก C: Web Hosting ทั่วไป (FTP)

1. อัปไฟล์ทั้งหมดผ่าน FTP client (เช่น FileZilla):
   ```
   index.html
   script.js
   config.js   ← ต้องอัปด้วยทุกครั้ง
   ```
2. วางไว้ใน `public_html/` หรือ root ของ domain

---

## ขั้นตอนที่ 4 — ตรวจสอบ

เปิดแอปในเบราว์เซอร์ → เปิด DevTools (F12) → Console  
ถ้าเชื่อม Supabase สำเร็จจะไม่มี warning  
ถ้ายังใช้ localStorage จะเห็น:
```
Supabase init failed, using localStorage
```

---

## สรุป checklist ก่อน deploy

- [ ] ใส่ค่าจริงใน `config.js` แล้ว
- [ ] สร้าง table `memories` ใน Supabase แล้ว
- [ ] สร้าง bucket `memory-files` (public) แล้ว
- [ ] ตั้ง Storage Policy แล้ว
- [ ] อัป `config.js` ขึ้น server แล้ว (ไม่ผ่าน git)
- [ ] ทดสอบถ่ายรูปและดูใน Supabase Dashboard แล้ว
