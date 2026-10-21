VIETCHEM EHS CP7.2 — RAILWAY LOGIN RECOVERY

Mục tiêu: deploy online bằng Railway, không cần Tailscale/PC luôn bật, và loại bỏ lỗi mật khẩu admin/LOGIN_LOCKED của CP7.1.

BẮT BUỘC TRÊN RAILWAY:
1) Gắn Persistent Volume tại /data.
2) Variables -> tạo EHS_ADMIN_PASSWORD với mật khẩu >= 10 ký tự.
3) Deploy/Redeploy.
4) Đăng nhập bằng username: admin và đúng giá trị EHS_ADMIN_PASSWORD.

CP7.2 sẽ mỗi lần service khởi động:
- đồng bộ mật khẩu admin từ EHS_ADMIN_PASSWORD;
- bật lại tài khoản admin;
- xóa login lock của admin;
- xóa session admin cũ.

Đường dẫn dữ liệu:
- DB: /data/VIETCHEM_EHS/Data/ehs.sqlite
- Uploads: /data/VIETCHEM_EHS/Data/uploads
- Backups: /data/VIETCHEM_EHS/Backups

Không cần EHS_RESET_ADMIN_PASSWORD hoặc EHS_BOOTSTRAP_PASSWORD trên Railway nữa.
Xem RAILWAY_DEPLOY_VN.md để triển khai/update từ CP7.1.
