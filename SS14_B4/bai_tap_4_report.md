# BÀI TẬP 4: SỰ ĐÁNH ĐỔI GIỮA TỰ DO VÀ TẬP TRUNG

## 1. Phân tích yêu cầu tích hợp Voucher

Khi tích hợp dịch vụ Voucher (mã giảm giá) vào luồng đặt hàng, các bước xử lý nghiệp vụ sẽ thay đổi như sau:
1. Nhận thông tin đơn hàng và mã Voucher từ Client.
2. Kiểm tra tính hợp lệ của mã Voucher (còn hạn không, đủ điều kiện không).
3. Tính toán số tiền giảm giá và áp dụng vào tổng tiền của đơn hàng.
4. Cập nhật lại số tiền cần thanh toán thực tế.
5. Tiến hành thanh toán với số tiền đã được giảm.
6. Nếu thanh toán thất bại, cần hoàn lại (release) mã Voucher đã dùng.

## 2. Đề xuất 2 giải pháp

### Giải pháp 1: Choreography (Sự kiện phân tán)
- Order Service tạo đơn (PENDING) -> gửi sự kiện `OrderCreated` kèm theo mã giảm giá.
- Voucher Service lắng nghe `OrderCreated`: 
  - Kiểm tra tính hợp lệ của mã.
  - Tính toán số tiền giảm.
  - Cập nhật trạng thái sử dụng của Voucher.
  - Gửi sự kiện `VoucherApplied` (có chứa số tiền đã giảm và số tiền cần thanh toán).
  - Nếu Voucher không hợp lệ -> Gửi sự kiện `VoucherFailed` -> Order hủy đơn.
- Order Service (hoặc Payment) lắng nghe `VoucherApplied`:
  - Cập nhật tổng tiền đơn hàng.
  - Gửi sự kiện yêu cầu thanh toán (hoặc Payment Service trực tiếp lắng nghe `VoucherApplied` để trừ tiền).
- Payment Service trừ tiền -> gửi `PaymentSuccess`.
- ... Luồng tiếp tục với Shipping.

### Giải pháp 2: Orchestration (Điều phối tập trung)
Sử dụng một thành phần trung tâm gọi là **Order Orchestrator** (có thể nằm trong Order Service hoặc là một service độc lập).
- Orchestrator nhận yêu cầu tạo đơn.
- Gửi lệnh (Command) đến Order Service: Tạo đơn hàng.
- Gửi lệnh đến Voucher Service: Áp dụng Voucher (chờ phản hồi đồng bộ hoặc bất đồng bộ về số tiền giảm).
- Cập nhật số tiền cần thanh toán ở Order Service.
- Gửi lệnh đến Payment Service: Thanh toán số tiền cuối cùng.
- Nếu thanh toán lỗi, Orchestrator điều phối việc gửi lệnh Compensate (Hủy Voucher, Hủy Đơn).

## 3. Bảng so sánh 2 giải pháp

| Tiêu chí | Choreography (Tự do) | Orchestration (Tập trung) |
| :--- | :--- | :--- |
| **Độ phức tạp khi thêm Service mới** | **Thấp**. Các service chỉ cần lắng nghe sự kiện, ít ảnh hưởng code cũ. | **Cao hơn**. Phải sửa logic ở bộ điều phối Orchestrator mỗi khi luồng thay đổi. |
| **Khả năng giám sát (Monitoring)** | **Kém**. Rất khó theo dõi một transaction đang ở trạng thái nào vì phân tán. | **Tốt**. Orchestrator nắm giữ toàn bộ state, dễ dàng biết request đang kẹt ở đâu. |
| **Độ trễ (Latency)** | **Thấp**. Phản hồi nhanh hơn do xử lý song song và bất đồng bộ. | **Cao hơn một chút**. Do có thêm một tầng điều phối trung tâm. |
| **Khả năng mở rộng (Scalability)** | **Rất cao**. Các service tự do mở rộng độc lập, không có điểm nghẽn cổ chai (SPOF). | **Trung bình/Khá**. Dễ sinh ra thắt cổ chai ở Orchestrator nếu request quá lớn. |
| **Dễ bảo trì và Debug** | **Rất khó**. Phải tracking theo trace-id qua nhiều hệ thống. | **Dễ dàng**. Luồng nghiệp vụ tập trung ở một chỗ, dễ đọc hiểu logic. |

## 4. Lựa chọn giải pháp và triển khai

**Lựa chọn:** Do hệ thống có chiều hướng tích hợp thêm rất nhiều dịch vụ phụ (Voucher, Loyalty, Notification...) và luồng sự kiện hiện tại đang "rối rắm, khó debug", giải pháp **Orchestration** là phù hợp nhất. Nó giúp quản lý tập trung và đơn giản hóa việc debug khi luồng giao dịch ngày càng phức tạp.

**Mã nguồn:** Triển khai minh họa bằng Node.js với mô hình Orchestrator được đính kèm trong dự án (thư mục `bai_tap_4`).
