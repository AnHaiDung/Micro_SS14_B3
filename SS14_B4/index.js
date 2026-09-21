// --- CSDL Giả lập ---
const database = {
    orders: {},
    wallets: {
        'CUST001': { balance: 1000 }
    },
    vouchers: {
        'VOUCHER10': { type: 'PERCENT', value: 10, isValid: true } // Giảm 10%
    }
};

// --- CÁC SERVICE ĐỘC LẬP (Không tự do gọi nhau) ---

class OrderService {
    async createOrder(orderId, customerId, amount) {
        console.log(`[Order Service] Tạo đơn ${orderId} (PENDING) - Tổng: ${amount}`);
        database.orders[orderId] = { orderId, customerId, originalAmount: amount, finalAmount: amount, status: 'PENDING' };
        return { success: true, orderId };
    }
    
    async updateFinalAmount(orderId, finalAmount) {
        database.orders[orderId].finalAmount = finalAmount;
        console.log(`[Order Service] Cập nhật số tiền cần thanh toán cho ${orderId}: ${finalAmount}`);
        return { success: true };
    }

    async updateStatus(orderId, status) {
        database.orders[orderId].status = status;
        console.log(`[Order Service] Cập nhật trạng thái đơn ${orderId} -> ${status}`);
        return { success: true };
    }
}

class VoucherService {
    async applyVoucher(orderId, voucherCode, amount) {
        console.log(`[Voucher Service] Đang kiểm tra mã ${voucherCode}...`);
        const voucher = database.vouchers[voucherCode];
        if (voucher && voucher.isValid) {
            const discount = (amount * voucher.value) / 100;
            const finalAmount = amount - discount;
            console.log(`[Voucher Service] Áp dụng thành công, giảm ${discount}. Còn: ${finalAmount}`);
            return { success: true, finalAmount, discount };
        } else {
            console.log(`[Voucher Service] Mã giảm giá không hợp lệ!`);
            return { success: false, reason: 'Invalid Voucher' };
        }
    }
}

class PaymentService {
    async processPayment(orderId, customerId, amount) {
        console.log(`[Payment Service] Yêu cầu thanh toán ${amount} cho đơn ${orderId}...`);
        const wallet = database.wallets[customerId];
        if (wallet && wallet.balance >= amount) {
            wallet.balance -= amount;
            console.log(`[Payment Service] Thanh toán thành công! Số dư còn lại: ${wallet.balance}`);
            return { success: true };
        } else {
            console.log(`[Payment Service] Thất bại: Không đủ số dư!`);
            return { success: false, reason: 'Insufficient funds' };
        }
    }
}


// --- ORCHESTRATOR (BỘ ĐIỀU PHỐI) ---
class OrderOrchestrator {
    constructor() {
        this.orderService = new OrderService();
        this.voucherService = new VoucherService();
        this.paymentService = new PaymentService();
    }

    async placeOrder(orderId, customerId, amount, voucherCode) {
        console.log(`\n=== BẮT ĐẦU LUỒNG ORCHESTRATOR CHO ĐƠN: ${orderId} ===`);
        
        try {
            // Bước 1: Tạo đơn
            await this.orderService.createOrder(orderId, customerId, amount);

            // Bước 2: Gọi Voucher Service
            let finalAmount = amount;
            if (voucherCode) {
                const voucherResult = await this.voucherService.applyVoucher(orderId, voucherCode, amount);
                if (voucherResult.success) {
                    finalAmount = voucherResult.finalAmount;
                    await this.orderService.updateFinalAmount(orderId, finalAmount);
                } else {
                    throw new Error(`Lỗi Voucher: ${voucherResult.reason}`);
                }
            }

            // Bước 3: Gọi Payment Service
            const paymentResult = await this.paymentService.processPayment(orderId, customerId, finalAmount);
            if (paymentResult.success) {
                await this.orderService.updateStatus(orderId, 'COMPLETED');
                console.log(`>>> Giao dịch hoàn tất thành công!`);
            } else {
                throw new Error(`Lỗi Payment: ${paymentResult.reason}`);
            }

        } catch (error) {
            console.log(`[Orchestrator] Có lỗi xảy ra: ${error.message}. Đang tiến hành Compensate...`);
            await this.compensate(orderId);
        }
    }

    async compensate(orderId) {
        console.log(`[Orchestrator] Compensating... Hủy đơn hàng ${orderId}`);
        await this.orderService.updateStatus(orderId, 'CANCELLED');
        console.log(`>>> Giao dịch đã bị hủy toàn bộ.`);
    }
}

// --- CHẠY DEMO ---
const orchestrator = new OrderOrchestrator();

async function run() {
    // Kịch bản 1: Đặt hàng thành công với Voucher
    await orchestrator.placeOrder('ORD_1', 'CUST001', 500, 'VOUCHER10');

    // Kịch bản 2: Đặt hàng thất bại do không đủ tiền, Orchestrator điều phối rollback
    await orchestrator.placeOrder('ORD_2', 'CUST001', 5000, 'VOUCHER10');
}

run();
