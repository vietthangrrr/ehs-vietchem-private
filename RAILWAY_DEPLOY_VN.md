# VIETCHEM EHS CP7.1 — Railway Web

Bản này chạy VIETCHEM EHS như một web app online trên Railway nhưng vẫn giữ SQLite + uploads theo kiến trúc Data Safe.

## Kiến trúc

- Node.js app chạy liên tục trong Railway service.
- HTTPS do Railway cấp.
- SQLite, uploads và backup phải nằm trên **Railway Volume** gắn tại `/data`.
- OCR chạy trong container bằng Poppler + Tesseract VI/EN + ImageMagick.
- Legal Watch và backup scheduler chạy trong cùng service.

## Bắt buộc trước khi nhập dữ liệu thật

1. Tạo service từ repository/source của package này.
2. Gắn **Persistent Volume** vào service với mount path `/data`.
3. Generate Railway domain.
4. Đặt các biến môi trường:

```text
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

Không đặt `EHS_RESET_ADMIN_PASSWORD` lâu dài. Nếu muốn đặt mật khẩu khởi tạo có kiểm soát, đặt `EHS_BOOTSTRAP_PASSWORD` cho lần đầu rồi xóa biến sau khi đăng nhập/đổi mật khẩu.

## Kiểm tra sau deploy

- `/healthz` phải trả `status: ok`.
- Mở app bằng Railway HTTPS domain.
- Đăng nhập admin và đổi mật khẩu tạm ngay.
- Vào System Health: `data_home` phải bắt đầu bằng `/data/VIETCHEM_EHS`.
- Tạo một record thử, redeploy service, xác nhận record vẫn còn. Đây là bước xác nhận Volume đã gắn đúng.

## Chuyển dữ liệu local lên Railway

Không copy file SQLite khi service đang ghi dữ liệu. Từ CP6.6/CP7 local hãy tạo backup `.tar.gz` bằng chức năng Backup. Sau đó restore vào volume bằng quy trình migration/offline trước khi dùng production. Trong giai đoạn đầu nên giữ local database ở chế độ fallback/read-only để tránh hai nguồn dữ liệu cùng phát sinh.

## Private usage

Railway URL là một endpoint Internet nhưng app vẫn yêu cầu EHS login + role. Với dự án cá nhân, đây là mức đơn giản nhất. Nếu sau này dữ liệu trở thành dữ liệu doanh nghiệp thực, hãy thêm lớp SSO/Zero Trust phía trước hoặc chuyển sang hạ tầng nội bộ trước khi mở rộng người dùng.
