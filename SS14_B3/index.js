const EventEmitter = require('events');

class EventBus extends EventEmitter {}
const eventBus = new EventBus();

// --- Các CSDL Giả lập ---
const database = {
    orders: {},
    wallets: {
        'CUST001': { balance: 1000 }
    }
};

// --- ORDER SERVICE ---
class OrderService {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.timeouts = {};
        
        this.eventBus.on('PaymentSuccess', this.handlePaymentSuccess.bind(this));
        this.eventBus.on('ShippingSuccess', this.handleShippingSuccess.bind(this));
        this.eventBus.on('ShippingFailed', this.handleShippingFailed.bind(this));
        this.eventBus.on('RefundSuccess', this.handleRefundSuccess.bind(this));
    }

    createOrder(orderId, customerId, amount) {
        console.log(`[Order Service] Đang tạo đơn hàng ${orderId}...`);
        database.orders[orderId] = {
            orderId,
            customerId,
            amount,
            status: 'PENDING'
        };
        console.log(`[Order Service] Đơn hàng ${orderId} PENDING. Bắn event OrderCreated.`);
        
        // Timeout 30 giây (trong demo để 3 giây cho nhanh)
        this.timeouts[orderId] = setTimeout(() => {
            console.log(`[Order Service] TIMEOUT! Không nhận được phản hồi Shipping cho đơn ${orderId}`);
            if (database.orders[orderId].status === 'PENDING') {
                database.orders[orderId].status = 'TIMEOUT_SHIPPING';
                console.log(`[Order Service] Yêu cầu hoàn tiền cho đơn ${orderId} do timeout`);
                this.eventBus.emit('CompensatePayment', { orderId, amount, customerId });
            }
        }, 3000);

        this.eventBus.emit('OrderCreated', { orderId, customerId, amount });
    }

    handlePaymentSuccess(event) {
        console.log(`[Order Service] Nhận event PaymentSuccess cho đơn ${event.orderId}. Chờ Shipping...`);
    }

    handleShippingSuccess(event) {
        const { orderId } = event;
        if (this.timeouts[orderId]) clearTimeout(this.timeouts[orderId]);
        
        if (database.orders[orderId]) {
            database.orders[orderId].status = 'COMPLETED';
            console.log(`[Order Service] Giao hàng thành công. Đơn hàng ${orderId} đổi sang COMPLETED.`);
        }
    }

    handleShippingFailed(event) {
        const { orderId, reason } = event;
        if (this.timeouts[orderId]) clearTimeout(this.timeouts[orderId]);

        console.log(`[Order Service] Nhận event ShippingFailed: ${reason}. Đổi trạng thái ${orderId} sang CANCELLING.`);
        if (database.orders[orderId]) {
            const order = database.orders[orderId];
            order.status = 'CANCELLING';
            console.log(`[Order Service] Bắn event CompensatePayment để hoàn tiền.`);
            this.eventBus.emit('CompensatePayment', { 
                orderId: order.orderId, 
                amount: order.amount, 
                customerId: order.customerId 
            });
        }
    }

    handleRefundSuccess(event) {
        const { orderId } = event;
        if (database.orders[orderId]) {
            database.orders[orderId].status = 'CANCELLED';
            console.log(`[Order Service] Hoàn tiền thành công. Đơn hàng ${orderId} đổi sang CANCELLED.\n`);
        }
    }
}

// --- PAYMENT SERVICE ---
class PaymentService {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.eventBus.on('OrderCreated', this.handleOrderCreated.bind(this));
        this.eventBus.on('CompensatePayment', this.handleCompensatePayment.bind(this));
    }

    handleOrderCreated(event) {
        const { orderId, customerId, amount } = event;
        const wallet = database.wallets[customerId];
        
        if (wallet && wallet.balance >= amount) {
            wallet.balance -= amount;
            console.log(`[Payment Service] Trừ tiền thành công ${amount}. Số dư còn: ${wallet.balance}. Bắn event PaymentSuccess.`);
            this.eventBus.emit('PaymentSuccess', { orderId, customerId, amount });
        } else {
            console.log(`[Payment Service] Không đủ tiền!`);
            this.eventBus.emit('PaymentFailed', { orderId });
        }
    }

    handleCompensatePayment(event) {
        const { orderId, customerId, amount } = event;
        if (database.wallets[customerId]) {
            database.wallets[customerId].balance += amount;
            console.log(`[Payment Service] Refund hoàn tiền ${amount}. Số dư mới: ${database.wallets[customerId].balance}. Bắn event RefundSuccess.`);
            this.eventBus.emit('RefundSuccess', { orderId });
        }
    }
}

// --- SHIPPING SERVICE ---
class ShippingService {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.eventBus.on('PaymentSuccess', this.handlePaymentSuccess.bind(this));
    }

    handlePaymentSuccess(event) {
        const { orderId } = event;
        console.log(`[Shipping Service] Đang xử lý giao hàng cho đơn ${orderId}...`);
        
        // Mô phỏng logic
        setTimeout(() => {
            if (orderId === 'ORDER_FAIL') {
                console.log(`[Shipping Service] Lỗi: Địa chỉ không hỗ trợ! Bắn event ShippingFailed.`);
                this.eventBus.emit('ShippingFailed', { orderId, reason: 'Invalid Address' });
            } else if (orderId === 'ORDER_TIMEOUT') {
                // Không làm gì để mô phỏng timeout
                console.log(`[Shipping Service] (Gặp sự cố mạng, không phản hồi...)`);
            } else {
                console.log(`[Shipping Service] Tạo vận đơn thành công! Bắn event ShippingSuccess.`);
                this.eventBus.emit('ShippingSuccess', { orderId });
            }
        }, 500);
    }
}

// Khởi tạo các Service
const orderService = new OrderService(eventBus);
const paymentService = new PaymentService(eventBus);
const shippingService = new ShippingService(eventBus);

// --- CHẠY DEMO ---
console.log("=== KỊCH BẢN 1: THÀNH CÔNG ===");
orderService.createOrder('ORDER_SUCCESS', 'CUST001', 100);

setTimeout(() => {
    console.log("=== KỊCH BẢN 2: THẤT BẠI TẠI SHIPPING (BÙ TRỪ) ===");
    orderService.createOrder('ORDER_FAIL', 'CUST001', 200);
}, 2000);

setTimeout(() => {
    console.log("=== KỊCH BẢN 3: TIMEOUT TẠI SHIPPING ===");
    orderService.createOrder('ORDER_TIMEOUT', 'CUST001', 150);
}, 4000);
