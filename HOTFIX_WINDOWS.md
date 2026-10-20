# Windows notes — CP7.0A

- Online private: chạy `START_PRIVATE_ONLINE.bat` sau khi Tailscale đã Connected.
- Chỉ local: chạy `START_LOCAL.bat` hoặc `start-windows.bat`.
- `START_PRIVATE_ONLINE.bat` không bind `0.0.0.0`; server chỉ nghe trên IPv4 Tailscale được phát hiện.
- Nếu Tailscale chưa cài/kết nối, launcher dừng trước khi mở server thay vì vô tình fallback sang LAN/public.
- OCR có thể ở trạng thái DEGRADED nếu máy chưa cài Poppler/Tesseract/ImageMagick; phần core app vẫn chạy nếu preflight không báo lỗi Data/Node.
