const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
const PORT = process.env.PORT || 3000;

// Config Swagger
const swaggerOptions = {
    swaggerDefinition: {
        openapi: '3.0.0',
        info: {
            title: 'Timesheet API System',
            version: '1.0.0',
            description: 'API Documentation for Timesheet Backend System',
        },
        servers: [
            {
                url: 'http://localhost:3000',
            },
        ],
    },
    apis: ['./server.js'],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use((req, res, next) => {
    req.io = io;
    next();
});

app.use(cors());
app.use(bodyParser.json());

// Cấu hình phục vụ file tĩnh cho thư mục uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Cấu hình Multer lưu file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        let decodedName = file.originalname;
        try {
            decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        } catch (e) {}
        // Đặt tên file có timestamp để tránh trùng
        const ext = path.extname(decodedName);
        const name = path.basename(decodedName, ext);
        cb(null, `${name}-${Date.now()}${ext}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Tối đa 10MB
    fileFilter: (req, file, cb) => {
        const allowedExts = ['.ppt', '.pptx', '.xls', '.xlsx', '.csv', '.json', '.doc', '.docx', '.pdf', '.png', '.jpg', '.jpeg', '.txt', '.zip', '.rar'];
        let decodedName = file.originalname;
        try {
            decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        } catch (e) {}
        const ext = path.extname(decodedName).toLowerCase();
        if (allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Định dạng ${ext} không được hỗ trợ!`));
        }
    }
});

// Thêm Endpoint Upload
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ status: 'fail', message: 'Không có file tải lên hoặc định dạng không hỗ trợ!' });
    }
    let decodedName = req.file.originalname;
    try {
        decodedName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    } catch (e) {}

    // Trả về url để frontend truy cập
    res.json({
        status: 'success',
        attachmentUrl: `/uploads/${req.file.filename}`,
        attachmentName: decodedName
    });
});

// Xử lý lỗi từ Multer (ví dụ quá dung lượng)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ status: 'fail', message: 'Dung lượng file vượt quá giới hạn 10MB!' });
        }
    } else if (err) {
        return res.status(400).json({ status: 'fail', message: err.message });
    }
    next();
});

// --- KẾT NỐI DATABASE ---
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'timesheet_db',
    connectionLimit: 10
});

db.getConnection((err, connection) => {
    if (err) {
        console.log('❌ Lỗi DB:', err);
    } else {
        console.log('✅ Đã kết nối MySQL Pool thành công!');
        // Tự động thêm cột is_new nếu chưa có (để đánh dấu task mới giao)
        connection.query("ALTER TABLE tasks ADD COLUMN is_new BOOLEAN DEFAULT TRUE", (alterErr) => {
            if (alterErr && alterErr.code !== 'ER_DUP_FIELDNAME') {
                console.log('⚠️ Không thể thêm cột is_new:', alterErr);
            } else if (!alterErr) {
                console.log('✅ Đã thêm cột is_new vào bảng tasks!');
            }
        });
        
        connection.query("ALTER TABLE tasks ADD COLUMN deadline DATETIME", (err) => {
            if (!err) console.log('✅ Đã thêm cột deadline vào bảng tasks!');
        });
        connection.query("ALTER TABLE tasks ADD COLUMN attachment_url VARCHAR(255)", (err) => {
            if (!err) console.log('✅ Đã thêm cột attachment_url vào bảng tasks!');
        });
        connection.query("ALTER TABLE tasks ADD COLUMN attachment_name VARCHAR(255)", (err) => {
            if (!err) console.log('✅ Đã thêm cột attachment_name vào bảng tasks!');
        });
        connection.query("ALTER TABLE tasks ADD COLUMN status VARCHAR(20) DEFAULT 'pending'", (err) => {
            if (!err) console.log('✅ Đã thêm cột status vào bảng tasks!');
        });
        connection.query("ALTER TABLE tasks ADD COLUMN level VARCHAR(5) DEFAULT 'C'", (err) => {
            if (!err) console.log('✅ Đã thêm cột level vào bảng tasks!');
        });
        connection.query("ALTER TABLE tasks ADD COLUMN completed_at DATETIME DEFAULT NULL", (err) => {
            if (!err) console.log('✅ Đã thêm cột completed_at vào bảng tasks!');
        });
        connection.query(`
            CREATE TABLE IF NOT EXISTS kpi_configs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                manager_id INT NOT NULL,
                eval_month VARCHAR(10) NOT NULL,
                target_points INT NOT NULL DEFAULT 50,
                excellent_points INT NOT NULL DEFAULT 70,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_manager_month (manager_id, eval_month)
            )
        `, (err) => {
            if (!err) console.log('✅ Đã khởi tạo hoặc kiểm tra bảng kpi_configs!');
        });
        
        connection.release(); // Nhớ release lại cho pool
    }
});

// Middleware kiểm tra Session/Auth
app.use((req, res, next) => {
    // Bỏ qua kiểm tra với request login và các API quên mật khẩu
    const publicPaths = ['/login', '/users/check-username', '/users/reset-password'];
    if (publicPaths.includes(req.path)) return next();

    const userId = req.headers['x-user-id'];

    // Nếu không có userId (có thể do frontend chưa tích hợp, tạm thời để lỏng rủi ro nếu cần chặt thì mở code dưới)
    if (!userId) {
        return res.status(401).json({ status: 'fail', message: 'Vui lòng đăng nhập!' });
    }

    // Kiểm tra xem user này có tồn tại và đang bị khóa hay không?
    const sql = "SELECT status FROM users WHERE id = ?";
    db.query(sql, [userId], (err, data) => {
        if (err) return res.status(500).json(err);

        if (data.length === 0) {
            return res.status(401).json({ status: 'fail', message: 'Tài khoản không tồn tại!' });
        }

        if (data[0].status === 'Blocked') {
            return res.status(403).json({ status: 'fail', message: 'Tài khoản của bạn đã bị khóa!' });
        }

        next(); // Nếu qua được hết thì cho đi tiếp
    });
});

// =======================================================
// NHÓM 1.5: QUÊN MẬT KHẨU
// =======================================================
app.post('/users/check-username', (req, res) => {
    const { username } = req.body;
    const sql = "SELECT id FROM users WHERE username = ?";
    db.query(sql, [username], (err, data) => {
        if (err) return res.status(500).json(err);
        if (data.length > 0) {
            return res.json({ status: 'success' });
        }
        return res.json({ status: 'fail', message: 'Không tìm thấy tài khoản này' });
    });
});

app.post('/users/reset-password', (req, res) => {
    const { username, newPassword } = req.body;
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(newPassword, salt);
    const sql = "UPDATE users SET password = ? WHERE username = ?";
    db.query(sql, [hash, username], (err, result) => {
        if (err) return res.status(500).json(err);
        return res.json({ status: 'success', message: 'Đổi mật khẩu thành công!' });
    });
});

// =======================================================
// NHÓM 1: CÁC API CƠ BẢN (Login, Lấy danh mục)
// =======================================================

// 1. Đăng nhập
/**
 * @swagger
 * /login:
 *   post:
 *     summary: Log in to the system
 *     description: Authenticates a user with username and password and returns user details.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success or failure login response
 */
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const sql = "SELECT * FROM users WHERE username = ?";
    db.query(sql, [username], (err, data) => {
        if (err) return res.status(500).json(err);
        if (data.length > 0) {
            const user = data[0];
            const validPassword = (password === user.password) || bcrypt.compareSync(password, user.password || '');

            if (!validPassword) {
                return res.json({ status: 'fail', message: 'Sai tài khoản hoặc mật khẩu!' });
            }

            if (user.status === 'Blocked') {
                return res.json({ status: 'fail', message: 'Tài khoản của bạn đã bị tạm khóa, không thể đăng nhập' });
            }
            return res.json({ status: 'success', user: user });
        }
        return res.json({ status: 'fail', message: 'Sai tài khoản hoặc mật khẩu!' });
    });
});

// 2. Lấy danh sách nhân viên (Dùng cho Admin hiển thị)
app.get('/users', (req, res) => {
    const sql = "SELECT * FROM users";
    db.query(sql, (err, data) => {
        if (err) return res.json(err);
        return res.json(data);
    });
});

// 3. Lấy danh sách công việc (Tasks) kèm thông tin Cảnh báo Quá hạn
app.get('/tasks', (req, res) => {
    // Trả về danh sách Task kèm tính toán IsOverdue và OverdueDuration (Hours)
    // Loại trừ các task đã có work_logs trạng thái 'Approved'
    const sql = `
        SELECT t.*, 
            CASE 
                WHEN t.deadline IS NOT NULL 
                     AND NOW() > t.deadline 
                     AND NOT EXISTS (
                         SELECT 1 FROM work_logs w 
                         WHERE w.task_id = t.id AND w.status = 'Approved'
                     )
                THEN TRUE 
                ELSE FALSE 
            END AS isOverdue,
            CASE 
                WHEN t.deadline IS NOT NULL 
                     AND NOW() > t.deadline
                     AND NOT EXISTS (
                         SELECT 1 FROM work_logs w 
                         WHERE w.task_id = t.id AND w.status = 'Approved'
                     )
                THEN TIMESTAMPDIFF(HOUR, t.deadline, NOW()) 
                ELSE 0 
            END AS overdueHours
        FROM tasks t
        ORDER BY isOverdue DESC, overdueHours DESC, t.id DESC
    `;
    db.query(sql, (err, data) => {
        if (err) return res.json(err);
        return res.json(data);
    });
});

// =======================================================
// NHÓM 2: CÁC API CỦA NHÂN VIÊN (Chấm công, Xem lịch)
// =======================================================

// Hàm hỗ trợ ghi log (Audit Trail)
const logAudit = (db, user_id, action_detail) => {
    if(!user_id) return;
    const sql = "INSERT INTO audit_logs (user_id, action_detail) VALUES (?, ?)";
    db.query(sql, [user_id, action_detail], (err) => {
        if(err) console.error("Lỗi ghi log audit:", err);
    });
};

// 4. Lấy lịch sử làm việc của RIÊNG 1 User (Quan trọng: Để vẽ Lịch & Cảnh báo)
app.get('/work-logs/user/:userId', (req, res) => {
    const userId = req.params.userId;
    // Join bảng để lấy tên công việc hiển thị lên Lịch
    const sql = `
        SELECT w.*, t.task_name, t.priority, t.description as task_desc 
        FROM work_logs w 
        LEFT JOIN tasks t ON w.task_id = t.id 
        WHERE w.user_id = ?
        ORDER BY w.work_date DESC
    `;
    db.query(sql, [userId], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json(data);
    });
});

// 4.5 Thống kê cá nhân (Pie Chart Data)
app.get('/work-logs/grades/:userId', (req, res) => {
    const userId = req.params.userId;
    const sql = `
        SELECT actual_grade, COUNT(*) as count 
        FROM work_logs 
        WHERE user_id = ? AND status = 'Approved' AND actual_grade IS NOT NULL
        GROUP BY actual_grade
    `;
    db.query(sql, [userId], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json(data);
    });
});

// 5. Nộp báo cáo (Nhận FormData)
app.post('/submit-logs', upload.any(), (req, res) => {
    let logs = [];
    try {
        logs = JSON.parse(req.body.logs);
    } catch (e) {
        return res.status(400).json({ status: 'fail', message: 'Dữ liệu JSON không hợp lệ!' });
    }

    if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
            const match = file.fieldname.match(/^file_(.+)$/);
            if (match) {
                const key = match[1];
                const log = logs.find(l => String(l.key) === String(key));
                if (log) {
                    let decodedName = file.originalname;
                    try {
                        decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
                    } catch (e) {}
                    log.attachmentUrl = `/uploads/${file.filename}`;
                    log.attachmentName = decodedName;
                }
            }
        });
    }


    // --- VALIDATION (KIỂM TRA HỢP LỆ) ---
    for (let log of logs) {
        // 1. Lấy ngày hiện tại của Server (theo giờ địa phương)
        const now = new Date();
        const todayStr = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0');

        // 2. Kiểm tra nhập tương lai (So sánh chuỗi YYYY-MM-DD)
        if (log.date > todayStr) {
            return res.json({
                status: 'fail',
                message: `❌ Lỗi: Bạn đang nhập cho ngày tương lai (${log.date}). Vui lòng kiểm tra lại!`
            });
        }

        // 3. Kiểm tra nhập quá giờ (Giới hạn 16 tiếng cho hợp lý)
        if (log.hours > 16) {
            return res.json({
                status: 'fail',
                message: `❌ Lỗi: Bạn nhập quá 16 tiếng ngày ${log.date}. Không hợp lý!`
            });
        }

        // 4. Kiểm tra quá hạn 7 ngày
        // Chỉ check khi tạo mới (không có id) hoặc sửa (có id) đều chặn
        const entryDate = new Date(log.date); // Chuyển chuỗi log.date thành Date
        const currentDate = new Date();       // Lấy ngày hiện tại

        // Reset giờ về 0 để tính khoảng cách ngày cho chuẩn
        entryDate.setHours(0, 0, 0, 0);
        currentDate.setHours(0, 0, 0, 0);

        const diffTime = Math.abs(currentDate - entryDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 7 && log.status !== 'Draft') {
            return res.json({
                status: 'fail',
                message: `❌ Lỗi: Ngày ${log.date} đã quá hạn 7 ngày khóa sổ. Vui lòng liên hệ Manager.`
            });
        }
    }

    const promises = logs.map(log => {
        return new Promise((resolve, reject) => {
            const attUrl = log.attachmentUrl || null;
            const attName = log.attachmentName || null;

            if (log.id) {
                // UPDATE (Sửa công việc cũ) - Reset status về Pending
                const sql = "UPDATE work_logs SET task_id=?, hours=?, description=?, attachment_url=?, attachment_name=?, status='Pending' WHERE id=? AND status IN ('Pending', 'Rejected', 'Draft')";
                db.query(sql, [log.taskId, log.hours, log.desc, attUrl, attName, log.id], (err, result) => {
                    if (err) return reject(err);
                    if (result.affectedRows === 0) return reject({ message: `❌ Bản ghi (Ngày ${log.date}) đang bị khóa hoặc đã Duyệt! Vui lòng làm "Yêu cầu sửa".` });
                    logAudit(db, log.userId, `Đã sửa bản ghi Timesheet ID: ${log.id}, trạng thái về Pending`);
                    resolve(result);
                });
            } else {
                // INSERT (Thêm công việc mới)
                // Mặc định status là 'Pending' (Chờ duyệt)
                const sql = "INSERT INTO work_logs (user_id, task_id, work_date, hours, description, attachment_url, attachment_name, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')";
                db.query(sql, [log.userId, log.taskId, log.date, log.hours, log.desc, attUrl, attName], (err, result) => {
                    if (err) return reject(err);
                    logAudit(db, log.userId, `Đã tạo mới bản ghi Timesheet ngày ${log.date} (${log.hours}h)`);
                    resolve(result);
                });
            }
        });
    });

    Promise.all(promises)
        .then(() => {
            req.io.emit('worklogs_updated'); // Publish realtime
            res.json({ status: 'success', message: 'Đã đồng bộ dữ liệu thành công!' });
        })
        .catch(err => {
            if (err.message) return res.json({ status: 'fail', message: err.message });
            return res.status(500).json(err);
        });
});

// 6. Xóa một dòng chấm công
app.delete('/work-logs/:id', (req, res) => {
    const logId = req.params.id;
    const userId = req.headers['x-user-id']; 
    
    const checkSql = "SELECT work_date, status, user_id FROM work_logs WHERE id = ?";
    db.query(checkSql, [logId], (err, data) => {
        if (err) return res.status(500).json(err);
        if (data.length === 0) return res.json({ status: 'fail', message: 'Không tìm thấy bản ghi!' });

        const log = data[0];
        if (log.status === 'Approved') {
            return res.json({ status: 'fail', message: '❌ Lỗi: Bản ghi đã được duyệt, không thể xóa!' });
        }

        const entryDate = new Date(log.work_date);
        const currentDate = new Date();
        entryDate.setHours(0, 0, 0, 0); currentDate.setHours(0, 0, 0, 0);
        const diffTime = Math.abs(currentDate - entryDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 7) {
            return res.json({ status: 'fail', message: '❌ Lỗi: Đã quá hạn 7 ngày, khóa sổ không thể xóa!' });
        }

        const deleteSql = "DELETE FROM work_logs WHERE id = ?";
        db.query(deleteSql, [logId], (err2, result) => {
            if (err2) return res.status(500).json(err2);
            logAudit(db, userId || log.user_id, `Đã xóa bản ghi Timesheet ID: ${logId}`);
            req.io.emit('worklogs_updated');
            return res.json({ status: 'success' });
        });
    });
});

// 6b. Yêu cầu sửa (Request Edit) bản ghi đã Approved
app.post('/work-logs/request-edit/:id', (req, res) => {
    const logId = req.params.id;
    const userId = req.headers['x-user-id']; 
    const { reason } = req.body;
    
    if (!reason || reason.trim() === '') {
         return res.json({ status: 'fail', message: 'Vui lòng nhập lý do sửa!' });
    }

    const sql = "UPDATE work_logs SET status = 'Edit_Requested', edit_reason = ? WHERE id = ? AND status = 'Approved'";
    db.query(sql, [reason, logId], (err, result) => {
        if (err) return res.status(500).json(err);
        if (result.affectedRows === 0) {
            return res.json({ status: 'fail', message: '❌ Bản ghi chưa được duyệt hoặc không tồn tại, không thể yêu cầu sửa!' });
        }
        logAudit(db, userId, `User yêu cầu sửa bản ghi Timesheet ID: ${logId}. Lý do: ${reason}`);
        req.io.emit('worklogs_updated');
        return res.json({ status: 'success', message: 'Đã gửi yêu cầu sửa, vui lòng chờ Manager duyệt!' });
    });
});

// =======================================================
// NHÓM 3: CÁC API QUẢN TRỊ (Admin & Manager)
// =======================================================

// 7. Thêm nhân viên mới (Admin)
app.post('/users/add', (req, res) => {
    const { username, full_name, department, role, password, manager_id } = req.body;
    if (!username || !full_name) {
        return res.json({ status: 'fail', message: 'Thiếu tên đăng nhập hoặc họ tên!' });
    }
    const sql = "INSERT INTO users (username, full_name, department, role, password, manager_id) VALUES (?, ?, ?, ?, ?, ?)";
    const finalPass = password || '123';
    const salt = bcrypt.genSaltSync(10);
    const hashedPass = bcrypt.hashSync(finalPass, salt);
    const finalManagerId = manager_id || null;

    db.query(sql, [username, full_name, department, role, hashedPass, finalManagerId], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.json({ status: 'fail', message: 'Tên đăng nhập này đã tồn tại!' });
            return res.status(500).json(err);
        }
        return res.json({ status: 'success', message: 'Đã thêm nhân viên thành công!' });
    });
});

// 7b. Cập nhật thông tin nhân viên (Admin)
app.put('/users/update/:id', (req, res) => {
    const userId = req.params.id;
    const { username, full_name, department, role, password, manager_id } = req.body;

    if (!username || !full_name) {
        return res.json({ status: 'fail', message: 'Thiếu tên đăng nhập hoặc họ tên!' });
    }

    let sql = "UPDATE users SET username=?, full_name=?, department=?, role=?, manager_id=? WHERE id=?";
    let params = [username, full_name, department, role, manager_id || null, userId];

    if (password && password.trim() !== '') {
        const salt = bcrypt.genSaltSync(10);
        const hashedPass = bcrypt.hashSync(password, salt);
        sql = "UPDATE users SET username=?, full_name=?, department=?, role=?, manager_id=?, password=? WHERE id=?";
        params = [username, full_name, department, role, manager_id || null, hashedPass, userId];
    }

    db.query(sql, params, (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.json({ status: 'fail', message: 'Tên đăng nhập này đã tồn tại!' });
            return res.status(500).json(err);
        }
        return res.json({ status: 'success', message: 'Đã cập nhật thông tin nhân viên!' });
    });
});

// 8. Xóa nhân viên (Admin)
app.delete('/users/delete/:id', (req, res) => {
    const targetUserId = req.params.id;
    const currentAdminId = req.headers['x-user-id'];

    if (String(targetUserId) === String(currentAdminId)) {
        return res.json({ status: 'fail', message: 'Không thể tự xóa tài khoản của chính mình!' });
    }

    // Kiểm tra thông tin người bị xóa
    const checkSql = "SELECT role, status FROM users WHERE id = ?";
    db.query(checkSql, [targetUserId], (err, data) => {
        if (err) return res.status(500).json(err);
        if (data.length === 0) return res.json({ status: 'fail', message: 'Người dùng không tồn tại!' });

        const targetUserRole = data[0].role;
        const targetUserStatus = data[0].status;

        // Luật mới: Chỉ Admin chính (ID = 1) mới được quyền xóa các Admin phó khác.
        if (targetUserRole === 'admin' && String(currentAdminId) !== '1') {
            return res.json({ status: 'fail', message: 'Chỉ Admin chính mới có quyền xóa Admin phó!' });
        }

        if (targetUserRole === 'admin' && String(targetUserId) === '1') {
            return res.json({ status: 'fail', message: 'Không thể xóa Admin tối cao của hệ thống!' });
        }

        if (targetUserStatus !== 'Blocked') {
            return res.json({ status: 'fail', message: 'Phải Block (Khóa) nhân viên này trước khi xóa!' });
        }

        const sql = "DELETE FROM users WHERE id = ?";
        db.query(sql, [targetUserId], (err, result) => {
            if (err) return res.status(500).json(err);
            return res.json({ status: 'success', message: 'Đã xóa thành công!' });
        });
    });
});

// 8b. Thay đổi trạng thái người dùng (Khóa/Mở Khóa)
app.put('/users/update-status/:id', (req, res) => {
    const targetUserId = req.params.id;
    const currentAdminId = req.headers['x-user-id'];
    const { status } = req.body; // 'Active' hoặc 'Blocked'

    if (String(targetUserId) === String(currentAdminId)) {
        return res.json({ status: 'fail', message: 'Không thể tự khóa tài khoản của chính mình!' });
    }

    // Kiểm tra thông tin người bị khóa
    const checkSql = "SELECT role FROM users WHERE id = ?";
    db.query(checkSql, [targetUserId], (err, data) => {
        if (err) return res.status(500).json(err);
        if (data.length === 0) return res.json({ status: 'fail', message: 'Người dùng không tồn tại!' });

        const targetUserRole = data[0].role;

        // Luật mới tương tự khi Xóa
        if (targetUserRole === 'admin' && String(currentAdminId) !== '1') {
            return res.json({ status: 'fail', message: 'Chỉ Admin chính mới có quyền khóa Admin phó!' });
        }

        if (targetUserRole === 'admin' && String(targetUserId) === '1') {
            return res.json({ status: 'fail', message: 'Không thể khóa Admin tối cao của hệ thống!' });
        }

        const sql = "UPDATE users SET status = ? WHERE id = ?";
        db.query(sql, [status, targetUserId], (err, result) => {
            if (err) return res.status(500).json(err);
            return res.json({ status: 'success', message: `Đã ${status === 'Blocked' ? 'khóa' : 'mở khóa'} tài khoản!` });
        });
    });
});

// 9. Báo cáo thống kê hiệu suất (Manager)
app.get('/manager/stats', (req, res) => {
    const { managerId, startDate, endDate } = req.query;

    // Chỉ tính tổng giờ của những task ĐÃ DUYỆT (Approved) cho chuẩn KPI
    // Lọc theo khoảng thời gian nếu truyền vào
    let sql = `
        SELECT u.id, u.full_name, u.department, 
               COALESCE(SUM(CASE WHEN w.status = 'Approved' THEN w.hours ELSE 0 END), 0) as total_hours
        FROM users u
        LEFT JOIN work_logs w ON u.id = w.user_id
    `;
    const params = [];

    if (startDate && endDate) {
        sql += ` AND w.work_date >= ? AND w.work_date <= ? `;
        params.push(startDate, endDate);
    }

    sql += ` WHERE u.role = 'staff' `;

    if (managerId) {
        sql += ` AND u.manager_id = ? `;
        params.push(managerId);
    }

    sql += `
        GROUP BY u.id, u.full_name, u.department
        ORDER BY total_hours DESC;
    `;

    db.query(sql, params, (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json(data);
    });
});

// 9b. Báo cáo chờ duyệt (Pending Worklogs) cho Manager
app.get('/manager/pending-worklogs', (req, res) => {
    const managerId = req.query.managerId;
    let sql = `
        SELECT w.*, u.full_name, u.department, t.task_name
        FROM work_logs w
        JOIN users u ON w.user_id = u.id
        LEFT JOIN tasks t ON w.task_id = t.id
        WHERE w.status IN ('Pending', 'Edit_Requested')
    `;
    const params = [];
    if (managerId) {
        sql += ` AND u.manager_id = ?`;
        params.push(managerId);
    }
    sql += ` ORDER BY w.work_date ASC`;

    db.query(sql, params, (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json(data);
    });
});

// --- API MỚI: Cập nhật trạng thái (Duyệt / Từ chối / Đồng ý sửa) ---
app.put('/work-logs/update-status', (req, res) => {
    const { id, status, feedback, actual_grade } = req.body; 
    const userId = req.headers['x-user-id'];

    const clearReason = (status === 'Pending' || status === 'Approved') ? ", edit_reason = NULL" : "";
    let sql = `UPDATE work_logs SET status = ? ${clearReason}`;
    const params = [status];

    if (feedback !== undefined) {
        sql += ", feedback = ?";
        params.push(feedback);
    }
    if (actual_grade !== undefined) {
        sql += ", actual_grade = ?";
        params.push(actual_grade);
    }

    sql += " WHERE id = ?";
    params.push(id);

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json(err);

        // Đồng bộ khi cập nhật trạng thái duyệt
        if (status === 'Approved') {
            db.query("SELECT t.priority, w.hours, w.user_id, w.task_id, w.work_date, w.actual_grade FROM work_logs w LEFT JOIN tasks t ON w.task_id = t.id WHERE w.id = ?", [id], (err2, data2) => {
                if (!err2 && data2.length > 0) {
                    const taskData = data2[0];
                    const targetUser = taskData.user_id;
                    const taskId = taskData.task_id;
                    const workDate = taskData.work_date;
                    const priority = taskData.priority || 'C'; // Mặc định C
                    const hours = parseFloat(taskData.hours || 0);

                    // Xác định hạng thực tế (Grade)
                    const finalGrade = actual_grade || taskData.actual_grade || 'C';

                    // Cập nhật actual_grade cho work_logs nếu chưa có hạng
                    if (!taskData.actual_grade) {
                        db.query("UPDATE work_logs SET actual_grade = ? WHERE id = ?", [finalGrade, id]);
                    }

                    // 1. Trọng số Xếp hạng (Grade Weight)
                    let gradeWeight = 1;
                    if (finalGrade === 'A') gradeWeight = 4;
                    else if (finalGrade === 'B') gradeWeight = 3;
                    else if (finalGrade === 'C') gradeWeight = 2;
                    else if (finalGrade === 'D') gradeWeight = 1;

                    // 2. Trọng số Độ ưu tiên (Priority Weight)
                    let priorityWeight = 1;
                    if (priority === 'A') priorityWeight = 4;
                    else if (priority === 'B') priorityWeight = 3;
                    else if (priority === 'C') priorityWeight = 2;
                    else if (priority === 'D') priorityWeight = 1;

                    // 3. Tính KPI Score
                    const kpiScore = parseFloat((priorityWeight * gradeWeight * (hours > 0 ? hours/8 : 1)).toFixed(2));

                    if (kpiScore > 0) {
                        db.query("UPDATE users SET accumulated_points = accumulated_points + ? WHERE id = ?", [kpiScore, targetUser]);
                    }

                    // ĐỒNG BỘ: Cập nhật task thành status='completed', level=finalGrade, completed_at=workDate
                    if (taskId) {
                        db.query("UPDATE tasks SET status = 'completed', level = ?, completed_at = ? WHERE id = ?", [finalGrade, workDate, taskId], (err3) => {
                            if (err3) console.error("Lỗi đồng bộ task:", err3);
                            else req.io.emit('tasks_updated');
                        });
                    }
                }
            });
        } else {
            // Nếu chuyển trạng thái khác Approved (Ví dụ: Draft, Rejected, Pending)
            // Kiểm tra xem task đó còn báo cáo Approved nào khác không. Nếu không còn, reset status về 'pending'
            db.query("SELECT task_id FROM work_logs WHERE id = ?", [id], (err2, data2) => {
                if (!err2 && data2.length > 0 && data2[0].task_id) {
                    const taskId = data2[0].task_id;
                    db.query("SELECT COUNT(*) as count FROM work_logs WHERE task_id = ? AND status = 'Approved' AND id != ?", [taskId, id], (err3, data3) => {
                        if (!err3 && data3.length > 0 && data3[0].count === 0) {
                            db.query("UPDATE tasks SET status = 'pending', level = 'C', completed_at = NULL WHERE id = ?", [taskId], (err4) => {
                                if (!err4) req.io.emit('tasks_updated');
                            });
                        }
                    });
                }
            });
        }

        logAudit(db, userId, `Manager cập nhật trạng thái bản ghi ID ${id} thành ${status}`);
        req.io.emit('worklogs_updated');
        return res.json({ status: 'success', message: 'Đã cập nhật trạng thái!' });
    });
});
// --- API MỚI: Manager nhập hộ công việc (Quyền lực tối thượng - Bỏ qua check ngày) ---
app.post('/manager/create-log', (req, res) => {
    const { userId, taskId, date, hours, description } = req.body;

    // Manager nhập thì auto là 'Approved' (Đã duyệt)
    const sql = "INSERT INTO work_logs (user_id, task_id, work_date, hours, description, status, actual_grade) VALUES (?, ?, ?, ?, ?, 'Approved', 'C')";

    db.query(sql, [userId, taskId, date, hours, description], (err, result) => {
        if (err) return res.status(500).json(err);
        
        // Ensure task is marked completed and assigned_to is updated
        const updateTaskSql = `
            UPDATE tasks 
            SET status = 'completed', 
                level = 'C', 
                completed_at = ?,
                assigned_to = (
                    CASE 
                        WHEN assigned_to IS NULL THEN JSON_ARRAY(?)
                        WHEN JSON_CONTAINS(assigned_to, CAST(? AS JSON)) = 0 THEN JSON_ARRAY_APPEND(assigned_to, '$', ?)
                        ELSE assigned_to
                    END
                )
            WHERE id = ?`;
        
        db.query(updateTaskSql, [date, userId, userId, userId, taskId], (err2) => {
            if (err2) return res.status(500).json(err2);
            req.io.emit('worklogs_updated');
            req.io.emit('tasks_updated');
            return res.json({ status: 'success', message: 'Đã bổ sung công việc thành công!' });
        });
    });
});

// --- API MỚI: Cập nhật trạng thái Task Hoàn thành ---
app.put('/tasks/:id/complete', (req, res) => {
    const taskId = req.params.id;
    // Cập nhật trạng thái sang completed và lưu completed_at (để tính điểm theo tháng)
    const sql = "UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = ?";
    db.query(sql, [taskId], (err, result) => {
        if (err) return res.status(500).json(err);
        req.io.emit('tasks_updated');
        return res.json({ status: 'success', message: 'Đã đánh dấu hoàn thành Task!' });
    });
});

// --- API MỚI: Mark Task as Seen ---
app.post('/tasks/mark-seen/:id', (req, res) => {
    const taskId = req.params.id;
    db.query("UPDATE tasks SET is_new = FALSE WHERE id = ?", [taskId], (err) => {
        if (err) return res.status(500).json(err);
        req.io.emit('tasks_updated');
        return res.json({ status: 'success' });
    });
});

// --- API MỚI: Staff tự tạo Task ---
app.post('/tasks/staff-create', (req, res) => {
    const { task_name, user_id } = req.body;
    if (!task_name || !task_name.trim()) {
        return res.json({ status: 'fail', message: 'Tên công việc không được để trống!' });
    }
    const userId = req.headers['x-user-id'] || user_id;
    if (!userId) {
        return res.status(401).json({ status: 'fail', message: 'Vui lòng đăng nhập để thực hiện thao tác này!' });
    }
    
    const sql = "INSERT INTO tasks (task_group, task_name, priority, expected_grade, assigned_to, is_new, status) VALUES (?, ?, ?, ?, ?, FALSE, 'pending')";
    
    db.query(sql, ['Tự giao việc', task_name.trim(), 'C', 'C', JSON.stringify([parseInt(userId)])], (err, result) => {
        if (err) return res.status(500).json(err);
        
        const newTaskId = result.insertId;
        
        db.query("SELECT * FROM tasks WHERE id = ?", [newTaskId], (err2, data) => {
            if (err2) return res.status(500).json(err2);
            req.io.emit('tasks_updated');
            return res.json({ status: 'success', task: data[0] });
        });
    });
});


// --- API MỚI: Lấy danh sách Task Nháp (Task Bank) ---
app.get('/tasks/drafts', (req, res) => {
    // Task chưa được giao (assigned_to IS NULL)
    const sql = "SELECT * FROM tasks WHERE assigned_to IS NULL ORDER BY id DESC";
    db.query(sql, (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json(data);
    });
});

// --- API MỚI: Lưu Task vào Danh sách chờ (Nháp) ---
app.post('/tasks/draft', (req, res) => {
    const { task_group, task_name, priority, expected_grade, description, deadline, attachment_url, attachment_name } = req.body;
    // Lưu với assigned_to = NULL
    const sql = "INSERT INTO tasks (task_group, task_name, priority, expected_grade, description, deadline, attachment_url, attachment_name, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)";
    db.query(sql, [task_group, task_name, priority || 'C', expected_grade || 'C', description || '', deadline || null, attachment_url || null, attachment_name || null], (err, result) => {
        if (err) return res.status(500).json(err);
        req.io.emit('tasks_draft_updated'); // Sự kiện realtime riêng cho draft (tùy chọn)
        return res.json({ status: 'success', message: 'Đã lưu vào danh sách chờ!' });
    });
});

// --- API MỚI: Tạo Task Hàng Loạt (Bulk Assign) ---
app.post('/tasks/bulk', (req, res) => {
    const { task_group, task_name, priority, expected_grade, description, deadline, attachment_url, attachment_name, assigned_to, draftId } = req.body;
    
    if (!assigned_to || assigned_to.length === 0) {
       return res.json({ status: 'fail', message: 'Vui lòng chọn ít nhất 1 nhân sự!' });
    }

    db.getConnection((err, connection) => {
        if (err) return res.status(500).json(err);

        connection.beginTransaction(err => {
            if (err) {
                connection.release();
                return res.status(500).json(err);
            }

            // Chuẩn bị dữ liệu Bulk Insert
            const values = assigned_to.map(staff_id => [
                task_group, 
                task_name, 
                priority || 'C', 
                expected_grade || 'C', 
                description || '',
                deadline || null,
                attachment_url || null,
                attachment_name || null,
                JSON.stringify([staff_id]) // Lưu mảng chứa 1 ID tương ứng với staff đó
            ]);

            const insertSql = "INSERT INTO tasks (task_group, task_name, priority, expected_grade, description, deadline, attachment_url, attachment_name, assigned_to) VALUES ?";
            
            connection.query(insertSql, [values], (err, insertResult) => {
                if (err) {
                    return connection.rollback(() => {
                        connection.release();
                        res.status(500).json(err);
                    });
                }

                // Nếu task được giao từ Draft Bank -> xóa bản nháp đó đi
                if (draftId) {
                    connection.query("DELETE FROM tasks WHERE id = ?", [draftId], (err, deleteResult) => {
                        if (err) {
                            if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED_') {
                                connection.query("UPDATE tasks SET assigned_to = '[-1]' WHERE id = ?", [draftId], (updateErr) => {
                                    if (updateErr) {
                                        return connection.rollback(() => {
                                            connection.release();
                                            res.status(500).json(updateErr);
                                        });
                                    }
                                    connection.commit(commitErr => {
                                        if (commitErr) {
                                            return connection.rollback(() => {
                                                connection.release();
                                                res.status(500).json(commitErr);
                                            });
                                        }
                                        connection.release();
                                        req.io.emit('tasks_updated');
                                        req.io.emit('tasks_draft_updated');
                                        return res.json({ status: 'success', message: `Đã giao việc thành công cho ${assigned_to.length} người!` });
                                    });
                                });
                                return;
                            }
                            return connection.rollback(() => {
                                connection.release();
                                res.status(500).json(err);
                            });
                        }
                        connection.commit(err => {
                            if (err) {
                                return connection.rollback(() => {
                                    connection.release();
                                    res.status(500).json(err);
                                });
                            }
                            connection.release();
                            req.io.emit('tasks_updated');
                            req.io.emit('tasks_draft_updated'); // Refresh lại list draft
                            return res.json({ status: 'success', message: `Đã giao việc thành công cho ${assigned_to.length} người!` });
                        });
                    });
                } else {
                    // Không có draftId, chỉ commit
                    connection.commit(err => {
                        if (err) {
                            return connection.rollback(() => {
                                connection.release();
                                res.status(500).json(err);
                            });
                        }
                        connection.release();
                        req.io.emit('tasks_updated');
                        return res.json({ status: 'success', message: `Đã giao việc thành công cho ${assigned_to.length} người!` });
                    });
                }
            });
        });
    });
});

// --- API MỚI: KPI Settings ---
app.get('/kpi-settings', (req, res) => {
    const managerId = req.query.managerId;
    const eval_month = req.query.month || new Date().toLocaleDateString('en-GB', {month: '2-digit', year: 'numeric'}); // format MM/YYYY
    db.query("SELECT * FROM kpi_configs WHERE manager_id = ? AND eval_month = ?", [managerId, eval_month], (err, data) => {
        if (data && data.length > 0) return res.json(data[0]);
        return res.json({ eval_month: eval_month, target_points: 50, excellent_points: 70 });
    });
});

app.post('/kpi-settings', (req, res) => {
    const { managerId, eval_month, target_points, excellent_points } = req.body;
    db.query("SELECT id FROM kpi_configs WHERE manager_id = ? AND eval_month = ?", [managerId, eval_month], (err, data) => {
        if (data && data.length > 0) {
            db.query("UPDATE kpi_configs SET target_points=?, excellent_points=? WHERE manager_id=? AND eval_month=?", 
            [target_points, excellent_points, managerId, eval_month], (err2) => {
                if(err2) return res.status(500).json(err2);
                res.json({status: 'success'});
            });
        } else {
            db.query("INSERT INTO kpi_configs (manager_id, eval_month, target_points, excellent_points) VALUES (?, ?, ?, ?)", 
            [managerId, eval_month, target_points, excellent_points], (err2) => {
                if(err2) return res.status(500).json(err2);
                res.json({status: 'success'});
            });
        }
    });
});

// --- API MỚI: Lấy KPI Leaderboard ---
app.get('/manager/kpi-leaderboard', (req, res) => {
    const managerId = req.query.managerId;
    // Mặc định lấy tháng hiện tại nếu không truyền (MM/YYYY)
    const month = req.query.month || new Date().toLocaleDateString('en-GB', {month: '2-digit', year: 'numeric'}); 

    let sql = `
        SELECT u.id, u.username, u.full_name, u.department,
               COUNT(t.id) as total_tasks,
               SUM(CASE 
                   WHEN t.level = 'A' THEN 5 
                   WHEN t.level = 'B' THEN 4
                   WHEN t.level = 'C' THEN 3
                   WHEN t.level = 'D' THEN 2
                   WHEN t.level = 'E' THEN 1
                   ELSE 0 END
               ) as accumulated_points,
               COALESCE(k.target_points, 50) as target_points,
               COALESCE(k.excellent_points, 70) as excellent_points,
               ROUND((SUM(CASE 
                   WHEN t.level = 'A' THEN 5 
                   WHEN t.level = 'B' THEN 4
                   WHEN t.level = 'C' THEN 3
                   WHEN t.level = 'D' THEN 2
                   WHEN t.level = 'E' THEN 1
                   ELSE 0 END
               ) / COALESCE(k.target_points, 50)) * 100, 1) as completion_percent
        FROM users u
        LEFT JOIN tasks t ON JSON_CONTAINS(t.assigned_to, CAST(u.id AS JSON)) 
                          AND t.status = 'completed'
                          AND DATE_FORMAT(t.completed_at, '%m/%Y') = ?
        LEFT JOIN kpi_configs k ON k.manager_id = u.manager_id AND k.eval_month = ?
        WHERE u.role = 'staff'
    `;
    const params = [month, month];
    if (managerId) {
        sql += ` AND u.manager_id = ? `;
        params.push(managerId);
    }
    sql += `
        GROUP BY u.id, u.username, u.full_name, u.department, k.target_points, k.excellent_points
        ORDER BY accumulated_points DESC;
    `;
    db.query(sql, params, (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json(data);
    });
});

// --- API MỚI: Báo cáo hiệu suất cá nhân ---
app.get('/staff/performance', (req, res) => {
    const userId = req.query.userId;
    const month = req.query.month; // MM/YYYY

    if (!userId || !month) {
        return res.status(400).json({ status: 'fail', message: 'Missing userId or month' });
    }

    // 1. Get User info to find manager_id
    db.query("SELECT manager_id FROM users WHERE id = ?", [userId], (err, users) => {
        if (err) return res.status(500).json(err);
        const managerId = users.length > 0 ? users[0].manager_id : null;

        // 2. Get KPI Target Points
        db.query("SELECT target_points FROM kpi_configs WHERE manager_id = ? AND eval_month = ?", [managerId, month], (err, configs) => {
            if (err) return res.status(500).json(err);
            const targetPoints = (configs && configs.length > 0) ? configs[0].target_points : 50;

            // 3. Get Points and Rank Distribution from Tasks (matching Manager Dashboard)
            const tasksSql = `
                SELECT 
                    SUM(CASE 
                        WHEN level = 'A' THEN 5 
                        WHEN level = 'B' THEN 4
                        WHEN level = 'C' THEN 3
                        WHEN level = 'D' THEN 2
                        WHEN level = 'E' THEN 1
                        ELSE 0 END
                    ) as totalPoints,
                    SUM(CASE WHEN level = 'A' THEN 1 ELSE 0 END) as countA,
                    SUM(CASE WHEN level = 'B' THEN 1 ELSE 0 END) as countB,
                    SUM(CASE WHEN level = 'C' THEN 1 ELSE 0 END) as countC,
                    SUM(CASE WHEN level = 'D' THEN 1 ELSE 0 END) as countD
                FROM tasks 
                WHERE JSON_CONTAINS(assigned_to, CAST(? AS JSON)) 
                  AND status = 'completed' 
                  AND DATE_FORMAT(completed_at, '%m/%Y') = ?
            `;
            
            db.query(tasksSql, [userId, month], (err, taskResult) => {
                if (err) return res.status(500).json(err);
                
                const pointsData = taskResult[0];
                const totalPoints = pointsData.totalPoints || 0;
                let completionRate = 0;
                if (targetPoints > 0) {
                    completionRate = Math.round((totalPoints / targetPoints) * 1000) / 10;
                }

                const rankDistribution = {
                    A: pointsData.countA || 0,
                    B: pointsData.countB || 0,
                    C: pointsData.countC || 0,
                    D: pointsData.countD || 0
                };

                // 4. Get Total Hours and Recent Tasks from work_logs
                const logsSql = `
                    SELECT w.*, t.task_name
                    FROM work_logs w
                    LEFT JOIN tasks t ON w.task_id = t.id
                    WHERE w.user_id = ? AND DATE_FORMAT(w.work_date, '%m/%Y') = ? AND w.status = 'Approved'
                    ORDER BY w.work_date DESC
                `;

                db.query(logsSql, [userId, month], (err, logs) => {
                    if (err) return res.status(500).json(err);

                    let totalHours = 0;
                    const recentTasks = [];
                    const weekMap = {};

                    logs.forEach(log => {
                        totalHours += parseFloat(log.hours || 0);

                        recentTasks.push({
                            id: log.id,
                            date: log.work_date,
                            taskName: log.task_name,
                            rank: log.actual_grade || 'C',
                            feedback: log.feedback || ''
                        });

                        // Calculate week of month for weekly trend
                        const date = new Date(log.work_date);
                        const day = date.getDate();
                        const weekNum = Math.ceil(day / 7);
                        const weekName = 'Tuần ' + weekNum;
                        
                        if (!weekMap[weekName]) {
                            weekMap[weekName] = 0;
                        }
                        weekMap[weekName] += parseFloat(log.hours || 0);
                    });

                    // Format weeklyTrend
                    const weeklyTrend = [];
                    for (let i = 1; i <= 5; i++) {
                        const w = 'Tuần ' + i;
                        if (weekMap[w] !== undefined || Object.keys(weekMap).length > 0) {
                            weeklyTrend.push({
                                week: w,
                                hours: weekMap[w] || 0
                            });
                        }
                    }

                    return res.json({
                        totalPoints,
                        totalHours,
                        completionRate,
                        rankDistribution,
                        weeklyTrend,
                        recentTasks: recentTasks.slice(0, 10) // Top 10 recent
                    });
                });
            });
        });
    });
});

// --- KHỞI ĐỘNG SERVER BẰNG HTTP (Socket.io) ---
server.listen(PORT, () => {
    console.log(`Server HTTP & Socket.IO đang chạy tại http://localhost:${PORT}`);
});