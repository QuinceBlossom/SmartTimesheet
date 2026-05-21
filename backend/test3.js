const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'timesheet_db'
});

db.query(`SELECT id, task_name, status, level, completed_at, assigned_to FROM tasks WHERE JSON_CONTAINS(assigned_to, '2')`, (err, res) => {
    console.log('Tasks for user 2:', res);
    
    db.query(`SELECT id, task_name, status, level, completed_at, assigned_to FROM tasks WHERE JSON_CONTAINS(assigned_to, '3')`, (err2, res2) => {
        console.log('Tasks for user 3:', res2);
        process.exit();
    });
});
