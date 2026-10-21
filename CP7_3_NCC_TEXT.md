# CP7.3 - NCC free-text

- Trường NCC trong **Tạo hồ sơ thanh toán** đổi từ dropdown sang ô nhập text.
- Datalist vẫn gợi ý NCC đã có, nhưng người dùng có thể gõ NCC mới trực tiếp.
- Nếu tên gõ trùng (không phân biệt hoa/thường) với NCC đang hoạt động, hệ thống tái sử dụng vendor hiện có.
- Nếu là NCC mới, backend tự tạo vendor trong cùng transaction trước khi tạo payment.
- Hợp đồng chỉ hiện khi tên NCC gõ khớp một NCC đã có; NCC mới mặc định không có hợp đồng.
- Không đổi schema database.
