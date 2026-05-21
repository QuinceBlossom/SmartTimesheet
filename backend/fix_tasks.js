const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'timesheet_db',
});

const sql = `
    UPDATE tasks t
    JOIN work_logs w ON t.id = w.task_id
    SET t.status = 'completed',
        t.level = w.actual_grade,
        t.completed_at = w.work_date
    WHERE w.status = 'Approved';
`;

db.query(sql, (err, res) => {
    if (err) console.error(err);
    else console.log('Tasks updated successfully', res);
    db.end();
});
