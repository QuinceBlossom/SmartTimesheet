const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'timesheet_db',
});

const sql1 = "UPDATE work_logs SET actual_grade = 'C' WHERE id = 11";
const sql2 = "UPDATE tasks SET assigned_to = JSON_ARRAY(4), status = 'completed', level = 'C', completed_at = '2026-05-17 17:00:00' WHERE id = 17";

db.query(sql1, (err) => {
    if (err) console.error(err);
    db.query(sql2, (e) => {
        if (e) console.error(e);
        console.log('Fixed data for user 4');
        db.end();
    });
});
