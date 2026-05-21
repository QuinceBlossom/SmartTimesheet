const mysql = require('mysql2/promise');

async function migrate() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '123456',
        database: process.env.DB_NAME || 'timesheet_db',
    });

    const queries = [
        "ALTER TABLE tasks ADD COLUMN description TEXT;"
    ];

    for (const q of queries) {
        try {
            await db.query(q);
            console.log('✅ Thực thi bản vá:', q);
        } catch (error) {
            console.error('Lỗi DB:', error.message);
        }
    }
    await db.end();
}

migrate();
