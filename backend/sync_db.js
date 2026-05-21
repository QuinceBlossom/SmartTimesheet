const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'timesheet_db',
    multipleStatements: true
});

const sql = `
UPDATE tasks t
JOIN (
    SELECT task_id, MAX(work_date) as completed_date, MAX(actual_grade) as grade 
    FROM work_logs 
    WHERE status = 'Approved' AND task_id IS NOT NULL 
    GROUP BY task_id
) w ON t.id = w.task_id
SET t.status = 'completed', 
    t.completed_at = w.completed_date, 
    t.level = COALESCE(w.grade, 'C');
`;

db.query(sql, (err, res) => {
    if (err) console.log(err);
    else console.log('Data synced successfully:', res.message);
    process.exit();
});
