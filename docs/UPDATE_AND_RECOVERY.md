# Update & Recovery Guide

## Update từ Checkpoint 6 trở đi
1. Đóng app version cũ.
2. Giải nén version mới vào thư mục mới.
3. Chạy `start-windows.bat` của version mới.
4. App dùng lại `%USERPROFILE%\VIETCHEM_EHS\Data\ehs.sqlite` và `uploads` cũ.
5. Nếu schema mới cần migration, hệ thống tự tạo pre-migration backup, validate, migrate và kiểm số dòng.

Không copy database qua lại giữa các version.

## Chuyển dữ liệu từ CP5.x sang CP6 lần đầu
1. Đóng CP5.x.
2. Chạy `MIGRATE_OLD_DATA.bat` trong CP6.
3. Dán đường dẫn thư mục app CP5.x cũ — nơi có `data\ehs.sqlite`.
4. Tool tạo backup nguồn, validate và restore sang persistent store.
5. Chạy `start-windows.bat` CP6.

## Kiểm tra dữ liệu
Chạy `DATA_STATUS.bat` để xem:
- đường dẫn DB/uploads/backups
- số dòng các bảng lõi
- migration history

## Reset admin
Không còn reset admin mỗi lần khởi động.
Nếu quên mật khẩu, đóng app rồi chạy `RESET_ADMIN_PASSWORD.bat`.

## Restore backup
Đóng app trước khi restore.

```bash
node scripts/validate-backup.mjs <backup.tar.gz>
node scripts/restore-backup.mjs <backup.tar.gz>
```

Nếu không truyền target data directory, restore vào persistent store hiện tại.
