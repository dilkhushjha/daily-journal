// =========================
// Import Dependencies
// =========================
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const _ = require("lodash");
const db = require("./db");
const session = require("express-session");

// =========================
// Initialize Express App
// =========================
const app = express();
app.set("view engine", "ejs");

// =========================
// Middleware Setup
// =========================
app.use(express.json()); // Enable JSON parsing
app.use(express.urlencoded({ extended: true })); // Enable form data parsing
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// =========================
// Session Configuration
// =========================
app.use(session({
    secret: "secretKey", // Change this to a strong, random secret
    resave: false,
    saveUninitialized: true
}));

// =========================
// Fetch Random Quote for Home Page
// =========================
const apiLink = "https://zenquotes.io/api/random";
let startText = "";

async function fetchQuote() {
    try {
        const response = await fetch(apiLink);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const data = await response.json();
        return data[0]?.q || "Have a nice day.";
    } catch (error) {
        console.error("Error fetching quote:", error);
        return "Have a nice day.";
    }
}

(async () => {
    startText = await fetchQuote();
    console.log("Stored Quote in startText:", startText);
})();



// =========================
// Routes
// =========================

// Home Route
app.get("/", async (req, res) => {
    if (!req.session.username) {
        res.redirect("/login")
        console.log("Please redirect to sign up page.")
    }
    else {

        try {
            res.redirect(`/${req.session.username}/home`);

        } catch (err) {
            console.error("Database Error:", err);
            res.status(500).send("Error fetching posts");
        }
    }
});

// =========================
// Authentication Routes
// =========================

// Login Page
app.get("/login", (req, res) => {
    res.render("login", { loginError: false });
});

// Login Handler
app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        const [userData] = await db.execute("SELECT * FROM users WHERE username=? AND password=?", [username, password]);
        if (userData[0]) {
            req.session.username = userData[0].username;
            return res.redirect(`/${req.session.username}/home`);
        }
        res.render("login", { loginError: true });
    } catch (err) {
        console.error("Error Logging in:", err);
        res.status(500).send("Error logging in");
    }
});

// Logout Handler
app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/login"));
});

// =========================
// User-Specific Routes
// =========================

// User Home
app.get("/:username/home", async (req, res) => {
    if (!req.session.username) return res.redirect("/login");
    try {
        const [rows] = await db.execute("SELECT * FROM posts WHERE user = ? ORDER BY created_at DESC", [req.session.username]);
        res.render("home", { username: req.session.username, startText, posts: rows });
    } catch (err) {
        console.error("Error fetching posts:", err);
        res.status(500).send("Error loading home page");
    }
});

// Compose Page
app.get("/:username/compose", (req, res) => {
    if (!req.session.username) return res.redirect("/login");
    res.render("compose", { username: req.session.username });
});

// Compose Handler
app.post("/:username/compose", async (req, res) => {
    if (!req.session.username) return res.redirect("/login");
    try {
        const { postTitle, postBody } = req.body;
        await db.execute("INSERT INTO posts (title, content, user) VALUES (?, ?, ?)", [postTitle, postBody, req.session.username]);
        res.redirect(`/${req.session.username}/home`);
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).send("Error saving post");
    }
});

// =========================
// CRUD Operations for Posts
// =========================


// View post

app.get("/:username/posts/:postTitle", async (req, res) => {
    try {
        const postTitle = req.params.postTitle;
        const username = req.session.username;

        const [result] = await db.execute("SELECT * FROM posts WHERE title = ? and user = ?;", [postTitle, username]);
        console.log(result[0])

        const postData = {
            username: username,
            postTitle: result[0]["title"],
            postBody: result[0]["content"],
            createdDate: result[0]["created_at"]

        }
        // result.affectedRows > 0 ? res.sendStatus(200) : res.status(404).send("Post not found");
        res.render('posts', postData);
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    }
});

// Delete Post
app.delete("/delete/:postTitle", async (req, res) => {
    try {
        const { postTitle } = req.params;
        const [result] = await db.execute("DELETE FROM posts WHERE title = ?", [postTitle]);
        result.affectedRows > 0 ? res.sendStatus(200) : res.status(404).send("Post not found");
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    }
});

// Edit Post - Fetch Page
app.get("/edit/:postTitle", async (req, res) => {
    try {
        const { postTitle } = req.params;
        const [post] = await db.execute("SELECT * FROM posts WHERE title = ?", [postTitle]);
        post.length > 0 ? res.render("edit", { post: post[0] }) : res.status(404).send("Post not found");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error retrieving post");
    }
});

// Edit Post - Update Content
app.put("/edit/:postTitle", async (req, res) => {
    try {
        const { postTitle } = req.params;
        const { content } = req.body;
        const [result] = await db.execute("UPDATE posts SET content = ? WHERE title = ?", [content, postTitle]);
        result.affectedRows > 0 ? res.sendStatus(200) : res.status(404).send("Post not found");
    } catch (err) {
        console.error("Error updating post:", err);
        res.status(500).send("Error updating post");
    }
});

// =========================
// Start Server
// =========================
app.listen(3000, () => console.log("Server is running at port 3000."));