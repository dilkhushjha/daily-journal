const mysql = require("mysql2");

const pool = mysql.createPool({
    host: "dailyjournaldb.c5sikeyyax3o.ap-south-1.rds.amazonaws.com", // Find this in RDS dashboard
    user: "admin",
    password: "dailyjournal",
    database: "dailyjournaldb",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool.promise();
