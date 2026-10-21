# VIETCHEM EHS SYSTEM — CP7.3 LOGIN RECOVERY

> Railway hotfix: dùng `EHS_ADMIN_PASSWORD` làm admin secret ổn định; tự clear LOGIN_LOCKED mỗi lần khởi động. Xem `RAILWAY_DEPLOY_VN.md`.

# VIETCHEM EHS System — CP7.0A Personal Private Online

CP7.0A là nhánh online/private dành cho **dự án cá nhân**. App vẫn dùng SQLite + Data Safe hiện tại, nhưng có thể mở từ laptop/điện thoại thông qua **Tailscale private network** mà không cần VPS, domain hoặc mở port router.

## Cách chạy khuyến nghị trên Windows
1. Cài và đăng nhập Tailscale trên máy chạy EHS.
2. Cài Tailscale trên điện thoại/laptop muốn truy cập và đưa các thiết bị vào cùng tailnet.
3. Chạy `START_PRIVATE_ONLINE.bat`.
4. Mở `Private URL` được in ra, dạng `http://100.x.x.x:8787`.
5. Dùng `PRIVATE_ONLINE_STATUS.bat` bất cứ lúc nào để kiểm tra server.

Chi tiết: `TAILSCALE_SETUP_VN.md` và `QUICK_START_PERSONAL_PRIVATE_VN.txt`.

## Những thay đổi chính
- **Tailscale-only listener:** launcher tự tìm IPv4 Tailscale và bind Node trực tiếp vào interface đó; không dùng `0.0.0.0`.
- **Mobile/QR ready:** `EHS_PUBLIC_BASE_URL` tự trỏ về URL Tailscale, nên QR thiết bị mở đúng private URL trên điện thoại trong tailnet.
- **Legal Watch background:** mặc định bật và chạy theo chu kỳ 1440 phút; thay đổi pháp luật vẫn chỉ tạo `Needs Review`, không tự sửa obligation.
- **Backup background:** ngoài backup lúc startup, server kiểm tra mỗi 60 phút trong suốt thời gian chạy và tạo tối đa khoảng một auto-backup mỗi 24 giờ; retention mặc định 30 ngày.
- **System Health:** trang System hiển thị Private Online mode, listener/IP, private URL, Legal Watch, auto backup và lần backup gần nhất.
- **Local fallback:** `START_LOCAL.bat` / `start-windows.bat` vẫn chỉ bind `127.0.0.1`.
- **Data Safe giữ nguyên:** `%USERPROFILE%\VIETCHEM_EHS\Data\ehs.sqlite`, uploads và backups nằm ngoài thư mục version.

## Security model
CP7.0A không public app lên Internet. Transport giữa các thiết bị đi qua mạng mã hóa của Tailscale; ứng dụng vẫn có login/RBAC riêng. Các request ghi dữ liệu trong Private Online mode bật same-origin enforcement. Không bật Secure cookie vì URL tailnet ở bản này dùng HTTP ở lớp ứng dụng; dữ liệu truyền giữa thiết bị vẫn đi qua tunnel Tailscale.

Không sync live `ehs.sqlite` qua OneDrive/Google Drive. Nếu muốn lưu off-device, chỉ copy/sync **backup archive đã hoàn tất**.

## Fresh install / update
- Nếu đã dùng CP6.x/CP7 trên cùng máy: chỉ giải nén version mới và chạy; persistent data được dùng lại.
- Nếu chuyển từ một thư mục legacy trước Data Safe: dùng `MIGRATE_OLD_DATA.bat` một lần.
- Cài mới: mật khẩu admin tạm được sinh ngẫu nhiên và chỉ in trong terminal lần đầu; đăng nhập rồi đổi mật khẩu ngay.

## Report templates
Báo cáo tuần, báo cáo tháng và KPI tiếp tục dùng **exact Excel templates** đã cung cấp; app chỉ điền dữ liệu vào template, không dựng lại layout.

## QA
Chạy:

`npm test`

và:

`npm run private:preflight`

CP7.0A bổ sung test cho Tailscale address detection, private runtime health, background backup scheduling wiring và giữ toàn bộ regression suite trước đó.
