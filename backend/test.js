const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'timesheet_db'
});

const kpiSql = `
        SELECT u.id,
               SUM(CASE 
                   WHEN t.level = 'A' THEN 5 
                   WHEN t.level = 'B' THEN 4
                   WHEN t.level = 'C' THEN 3
                   WHEN t.level = 'D' THEN 2
                   WHEN t.level = 'E' THEN 1
                   ELSE 0 END
               ) as accumulated_points,
               COALESCE(k.target_points, 50) as target_points,
               ROUND((SUM(CASE 
                   WHEN t.level = 'A' THEN 5 
                   WHEN t.level = 'B' THEN 4
                   WHEN t.level = 'C' THEN 3
                   WHEN t.level = 'D' THEN 2
                   WHEN t.level = 'E' THEN 1
                   ELSE 0 END
               ) / COALESCE(k.target_points, 50)) * 100, 1) as completion_percent,
               SUM(CASE WHEN t.level = 'A' THEN 1 ELSE 0 END) as count_A,
               SUM(CASE WHEN t.level = 'B' THEN 1 ELSE 0 END) as count_B,
               SUM(CASE WHEN t.level = 'C' THEN 1 ELSE 0 END) as count_C,
               SUM(CASE WHEN t.level = 'D' THEN 1 ELSE 0 END) as count_D
        FROM users u
        LEFT JOIN tasks t ON JSON_CONTAINS(t.assigned_to, CAST(u.id AS JSON)) 
                          AND t.status = 'completed'
                          AND DATE_FORMAT(t.completed_at, '%m/%Y') = '05/2026'
        LEFT JOIN kpi_configs k ON k.manager_id = u.manager_id AND k.eval_month = '05/2026'
        WHERE u.id = 2
        GROUP BY u.id, k.target_points
`;

db.query(kpiSql, (err, res) => {
    console.log('KPI:', res);
    process.exit();
});
