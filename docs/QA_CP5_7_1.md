# QA CP5.7.1

- Root cause: CP5.7 có hai renderer PPE; renderer CP5.6/5.7 đang active đã bind `Xuất PPE` và `Nhập / điều chỉnh` nhưng bỏ sót binding cho `#managePpeTypes`.
- Fix: bind `#managePpeTypes` -> `managePpeTypes()`.
- Added static regression test on active frontend source.
- PPE catalog API add/edit/soft-remove/reactivate tests remain enabled.
