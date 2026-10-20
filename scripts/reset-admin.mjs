import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { runtimePaths, ensureRuntimeDirs } from '../lib/runtime-paths.mjs';
const password=process.argv[2];if(!password||password.length<10){console.error('Usage: node scripts/reset-admin.mjs <new-password-at-least-10-chars>');process.exit(2)}
const root=fileURLToPath(new URL('..', import.meta.url));const p=await ensureRuntimeDirs(runtimePaths(root));if(!existsSync(p.dbPath)){console.error('Database chưa tồn tại:',p.dbPath);process.exit(1)}
const db=new DatabaseSync(p.dbPath);try{const salt=crypto.randomBytes(16).toString('hex'),hash=crypto.scryptSync(String(password),salt,64).toString('hex');const r=db.prepare("UPDATE users SET password_salt=?,password_hash=?,must_change_password=0,active=1,updated_at=? WHERE username='admin'").run(salt,hash,new Date().toISOString());if(!r.changes)throw new Error('Không tìm thấy admin');db.prepare("DELETE FROM login_guards WHERE username='admin'").run();db.prepare("DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE username='admin')").run();console.log('Đã reset mật khẩu admin và xóa login lock/session cũ.')}finally{db.close()}
