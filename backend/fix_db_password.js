const mysql = require('mysql2');

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'timesheet_db'
});

db.connect((err) => {
    if (err) {
        console.error('❌ Lỗi kết nối:', err);
        return;
    }

    // Tăng độ dài cột password lên 255 ký tự để đủ chỗ chứa chuỗi bcrypt (thường ~60 ký tự)
    const sql = "ALTER TABLE users MODIFY COLUMN password VARCHAR(255);";

    db.query(sql, (err, result) => {
        if (err) {
            console.error('❌ Lỗi thao tác DB:', err);
        } else {
            console.log('✅ Đã cập nhật độ dài cột password trong CSDL TIMESHEET thành công!');
        }
        db.end();
        process.exit();
    });
});
