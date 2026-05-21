const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'timesheet_db',
    multipleStatements: true
});

const sql = `
ALTER TABLE tasks ADD COLUMN status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE tasks ADD COLUMN level VARCHAR(5) DEFAULT 'C';
ALTER TABLE tasks ADD COLUMN completed_at DATETIME DEFAULT NULL;

CREATE TABLE IF NOT EXISTS kpi_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    manager_id INT NOT NULL,
    eval_month VARCHAR(10) NOT NULL,
    target_points INT NOT NULL DEFAULT 50,
    excellent_points INT NOT NULL DEFAULT 70,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_manager_month (manager_id, eval_month)
);
`;

db.query(sql, (err, res) => {
    if (err) console.log(err);
    else console.log('DB updated successfully');
    process.exit();
});
