const mysql = require('mysql2');
// removed dotenv

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'timesheet_db',
});

db.connect((err) => {
    if (err) {
        console.error('Lỗi kết nối DB:', err);
        process.exit(1);
    }
    
    const query = `ALTER TABLE work_logs ADD COLUMN attachment_url TEXT, ADD COLUMN attachment_name VARCHAR(255);`;
    
    db.query(query, (err, result) => {
        if (err) {
            console.error('Lỗi (Có thể cột đã tồn tại):', err.message);
        } else {
            console.log('Đã thêm 2 cột attachment_url và attachment_name thành công!');
        }
        process.exit(0);
    });
});
