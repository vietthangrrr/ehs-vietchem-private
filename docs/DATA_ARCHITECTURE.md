# VIETCHEM EHS — Data Architecture (Checkpoint 6)

## Mục tiêu
Tách code ứng dụng khỏi dữ liệu vận hành để update app không tạo database mới và không làm mất hồ sơ đang dùng.

## Persistent data location
Mặc định Windows:

`%USERPROFILE%\VIETCHEM_EHS\`

Cấu trúc:

```text
VIETCHEM_EHS\
├─ Data\
│  ├─ ehs.sqlite
│  └─ uploads\
├─ Backups\
└─ Logs\
```

- `Data\ehs.sqlite`: database nghiệp vụ.
- `Data\uploads\`: file PDF/Excel/ảnh/Word được import.
- `Backups\`: backup tự động, backup trước migration, backup thủ công.
- `Logs\`: dành cho log runtime/deployment sau này.

Code có thể nằm ở bất kỳ thư mục/version nào. `start-windows.bat` luôn trỏ tới cùng persistent home.

## Override path
Có thể dùng biến môi trường:
- `EHS_HOME_DIR`
- `EHS_DATA_DIR`
- `EHS_UPLOAD_DIR`
- `EHS_BACKUP_DIR`
- `EHS_LOG_DIR`

## Schema migration
Bảng `schema_migrations` ghi:
- migration ID
- checksum
- mô tả
- thời điểm áp dụng
- app version

Mỗi migration chỉ chạy một lần. Nếu cùng migration ID nhưng checksum thay đổi, startup dừng để tránh chạy một migration đã bị sửa nội dung.

## Data preservation gate
Trước migration trên database đã tồn tại:
1. Snapshot số dòng các bảng nghiệp vụ lõi.
2. Tạo backup SQLite + uploads.
3. Validate SHA-256 manifest.
4. Chạy migration transactionally.
5. Snapshot số dòng sau migration.
6. Nếu có table core bị giảm số dòng bất thường, update fail.
7. Nếu migration fail, app restore từ pre-migration backup rồi dừng startup.

## Backup policy
- Auto backup tối đa 1 lần/24 giờ khi app khởi động.
- Mặc định giữ 30 ngày (`EHS_BACKUP_RETENTION_DAYS`).
- Backup trước migration không phụ thuộc retention auto-backup.
- Backup tạo từ System UI vừa tải về browser vừa lưu một bản vào persistent `Backups`.

## Không đặt live SQLite trong thư mục sync cloud
Không đặt trực tiếp `ehs.sqlite` trong OneDrive/Google Drive/Dropbox. Chỉ đồng bộ/copy các file backup `.tar.gz` đã hoàn tất.
