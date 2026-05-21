const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'timesheet_db'
});

db.query(`SELECT id, task_name, status, level, completed_at FROM tasks`, (err, res) => {
    console.log('Tasks:', res);
    
    db.query(`SELECT * FROM work_logs WHERE status = 'Approved'`, (err2, res2) => {
        console.log('Approved logs:', res2);
        process.exit();
    });
});
