# VIETCHEM EHS CP7.0A — chạy online private bằng Tailscale

## Mục tiêu
App vẫn chạy trên máy cá nhân của bạn, nhưng laptop/điện thoại khác có thể truy cập qua mạng riêng Tailscale. Không mở port router, không public login page và không cần mua domain.

## Thiết lập lần đầu
1. Cài Tailscale trên **máy chạy EHS** và đăng nhập.
2. Cài Tailscale trên **điện thoại/laptop muốn truy cập** và đăng nhập cùng tailnet.
3. Trên máy chạy EHS, double-click `START_PRIVATE_ONLINE.bat`.
4. Cửa sổ sẽ in `Private URL`, dạng `http://100.x.y.z:8787`.
5. Trên thiết bị còn lại (đang Connected Tailscale), mở đúng URL đó bằng trình duyệt.

`START_PRIVATE_ONLINE.bat` chỉ bind Node server vào IPv4 Tailscale đã phát hiện. Nó không bind `0.0.0.0`, vì vậy app không tự mở cho toàn bộ mạng LAN.

## Mobile / QR
Khi chạy Private Online, `EHS_PUBLIC_BASE_URL` được tự đặt theo địa chỉ Tailscale. QR thiết bị được sinh với URL private này, nên điện thoại trong cùng tailnet có thể quét và mở asset.

## Legal Watch
Private Online mặc định bật Legal Watch mỗi 1440 phút (1 ngày). Lần kiểm tra đầu tiên được chạy sau khi server khởi động khoảng 1 phút. Mọi thay đổi chỉ tạo review queue; hệ thống không tự sửa nghĩa vụ pháp lý.

## Backup
Backup Data Safe vẫn nằm ở `%USERPROFILE%\VIETCHEM_EHS\Backups`. CP7.0A kiểm tra backup mỗi 60 phút nhưng chỉ tạo tối đa khoảng 1 auto-backup trong 24 giờ; mặc định giữ 30 ngày. Pre-migration backup vẫn tách riêng.

## Kiểm tra trạng thái
Double-click `PRIVATE_ONLINE_STATUS.bat` để xem:
- Tailscale có Connected không;
- IP private;
- URL truy cập;
- EHS server đang ONLINE hay OFFLINE.

## Khi không muốn online
Dùng `START_LOCAL.bat` (hoặc `start-windows.bat`). App chỉ nghe ở `127.0.0.1:8787` và thiết bị khác không truy cập được.

## Nguyên tắc dữ liệu
CP7.0A tiếp tục dùng cùng persistent data home `%USERPROFILE%\VIETCHEM_EHS`. Không copy `ehs.sqlite` sang thư mục version. Không đồng bộ live SQLite qua OneDrive/Google Drive. Chỉ đồng bộ/copy các file backup hoàn chỉnh sau khi chúng được tạo xong.
