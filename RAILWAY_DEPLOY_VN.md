# VIETCHEM EHS CP7.2 — Railway Login Recovery

CP7.2 là bản sửa trực tiếp cho lỗi `LOGIN_LOCKED` / sai mật khẩu admin trên CP7.1. Database và Persistent Volume cũ **không cần xóa**.

## Cách update service CP7.1 hiện tại

1. Thay source trong GitHub repo bằng source CP7.2 này và commit/push.
2. Railway → service `ehs-vietchem-private` → **Variables**.
3. Tạo biến:

```text
EHS_ADMIN_PASSWORD=<mật khẩu mới của cậu, tối thiểu 10 ký tự>
```

Không gửi mật khẩu đó cho người khác và không commit vào GitHub.

4. Giữ Persistent Volume mount tại:

```text
/data
```

5. Deploy/Redeploy service.
6. Mở **Deployments → Logs**. Phải thấy:

```text
[AUTH] Admin credential synchronized from EHS_ADMIN_PASSWORD/environment and login lock cleared.
VIETCHEM EHS System CP7.2 Login Recovery ...
```

7. Mở domain Railway và đăng nhập:

```text
Username: admin
Password: đúng giá trị EHS_ADMIN_PASSWORD
```

## CP7.2 sửa gì?

- `EHS_ADMIN_PASSWORD` trở thành mật khẩu admin chuẩn cho Railway.
- Mỗi lần container khởi động, password hash của `admin` được đồng bộ lại từ biến này.
- Tài khoản `admin` được ép về `active=1`, role `admin`.
- `login_guards` của admin bị xóa khi startup.
- Session admin cũ bị vô hiệu hóa khi credential được đồng bộ.
- Nếu đã bị lock vì nhập sai, **nhập đúng password vẫn có thể đăng nhập và tự clear lock**; lock chỉ chặn các lần nhập sai tiếp theo.
- Railway deployment không còn dùng mật khẩu ngẫu nhiên bí ẩn: nếu thiếu `EHS_ADMIN_PASSWORD`, `start-railway.sh` dừng và log hướng dẫn rõ ràng.
- `EHS_RESET_ADMIN_PASSWORD` và `EHS_BOOTSTRAP_PASSWORD` vẫn được server hiểu để tương thích bản cũ, nhưng Railway CP7.2 không cần dùng chúng nữa.

## Persistent data

Giữ nguyên:

```text
EHS_HOME_DIR=/data/VIETCHEM_EHS
DB=/data/VIETCHEM_EHS/Data/ehs.sqlite
Uploads=/data/VIETCHEM_EHS/Data/uploads
Backups=/data/VIETCHEM_EHS/Backups
```

Không xóa Volume chỉ để sửa login. Xóa Volume sẽ làm mất database/uploads nếu chưa có backup.

## Kiểm tra sau update

- `/healthz` trả `status: ok` và version chứa `checkpoint7.2-login-recovery`.
- Đăng nhập `admin` bằng `EHS_ADMIN_PASSWORD` thành công.
- Vào System Health, `data_home` phải bắt đầu bằng `/data/VIETCHEM_EHS`.
- Kiểm tra một record cũ vẫn tồn tại để xác nhận volume cũ được dùng.
- Redeploy thêm một lần và xác nhận vẫn đăng nhập được cùng password.

## Các biến Railway khuyến nghị

```text
EHS_ADMIN_PASSWORD=<secret >=10 ký tự>
HOST=0.0.0.0
NODE_ENV=production
EHS_HOME_DIR=/data/VIETCHEM_EHS
EHS_CLOUD_MODE=1
EHS_SECURE_COOKIE=1
EHS_ENFORCE_ORIGIN=1
EHS_ENABLE_LEGAL_WATCH=1
EHS_AUTO_BACKUP=1
EHS_BACKUP_RETENTION_DAYS=30
```

Không đưa `EHS_ADMIN_PASSWORD` vào source code hay GitHub.
