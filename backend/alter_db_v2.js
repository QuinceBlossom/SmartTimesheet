const mysql = require('mysql2/promise');

async function migrate() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '123456',
        database: process.env.DB_NAME || 'timesheet_db',
    });

    console.log('✅ Đã kết nối Database thành công!');

    const queries = [
        "ALTER TABLE tasks ADD COLUMN priority ENUM('A', 'B', 'C', 'D') DEFAULT 'C';",
        "ALTER TABLE tasks ADD COLUMN expected_grade ENUM('A', 'B', 'C', 'D') DEFAULT 'C';",
        "ALTER TABLE tasks ADD COLUMN assigned_to JSON;",
        
        "ALTER TABLE work_logs ADD COLUMN feedback TEXT;",
        "ALTER TABLE work_logs ADD COLUMN actual_grade ENUM('A', 'B', 'C', 'D');",
        
        "ALTER TABLE users ADD COLUMN accumulated_points INT DEFAULT 0;",
        
        `CREATE TABLE IF NOT EXISTS kpi_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            manager_id INT NOT NULL,
            current_period INT DEFAULT 1,
            req_task_a INT DEFAULT 0,
            req_task_b INT DEFAULT 0,
            FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE
        );`
    ];

    for (const q of queries) {
        try {
            await db.query(q);
            console.log('✅ Thực thi bản vá:', q.substring(0, 50) + '...');
        } catch (error) {
            // Lỗi ER_DUP_FIELDNAME (1060) là lỗi cột đã tồn tại
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('⚠️ Đã tồn tại cột ở querry:', q.substring(0, 50) + '...');
            } else {
                console.error('❌ Lỗi DB ở câu:', q.substring(0, 50) + '...', error.message);
            }
        }
    }

    console.log('🎉 Hoàn tất quá trình Migrate Database!');
    await db.end();
}

migrate();
