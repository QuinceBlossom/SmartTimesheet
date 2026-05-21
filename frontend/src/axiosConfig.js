import axios from 'axios';

// Tạo một instance axios với cấu hình mặc định
const axiosInstance = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
});

// Thêm một request interceptor
axiosInstance.interceptors.request.use(
    function (config) {
        // Chỉ đính kèm header nếu không phải là API login
        if (!config.url.includes('/login')) {
            const savedUser = localStorage.getItem('timesheet_user');
            if (savedUser) {
                const user = JSON.parse(savedUser);
                config.headers['x-user-id'] = user.id;
            }
        }
        return config;
    },
    function (error) {
        return Promise.reject(error);
    }
);

// Thêm một response interceptor
axiosInstance.interceptors.response.use(
    function (response) {
        // Nếu BE trả về 200 OK nhưng body có status 'fail' và liên quan đến auth (tùy vào cách BE thiết kế trả lỗi)
        // Hiện tại BE đang trả status(401) hoặc 403, nên nó sẽ lọt vào block Error bên dưới.
        return response;
    },
    function (error) {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            // Bắn một custom event để App.jsx xử lý force-logout
            const event = new CustomEvent('forceLogout', {
                detail: { message: error.response.data.message || 'Phiên đăng nhập hết hạn hoặc tài khoản đã bị khóa.' }
            });
            window.dispatchEvent(event);
        }
        return Promise.reject(error);
    }
);

export default axiosInstance;
