// =========================
// Import Dependencies
// =========================
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const _ = require("lodash");
const db = require("./db");
const session = require("express-session");
const bcrypt = require("bcrypt");

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
        // Fetch the user from the database
        const [rows] = await db.execute("SELECT password FROM users WHERE username = ?;", [username]);

        if (rows.length === 0) {
            return res.render("login", { loginError: true }); // User not found
        }

        const storedHashedPassword = rows[0].password;

        // Compare entered password with stored hashed password
        const match = await bcrypt.compare(password, storedHashedPassword);

        if (match) {
            req.session.username = username;
            return res.redirect(`/${req.session.username}/home`);
        } else {
            return res.render("login", { loginError: true }); // Incorrect password
        }
    } catch (err) {
        console.error("Error Logging in:", err);
        res.status(500).send("Error logging in");
    }
});


app.post("/signup", async (req, res) => {
    const { username, password, email } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const rows = await db.execute("INSERT INTO users VALUES (?,?,?);", [username, email, hashedPassword]);
        console.log(rows);
        if (rows) {
            req.session.username = username;
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
        // Decode content using Base64
        const decodedPosts = rows.map(post => ({
            title: post.title,
            content: Buffer.from(post.content, "base64").toString("utf-8")
        }));
        res.render("home", { username: req.session.username, startText, posts: decodedPosts });
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

        // Encode content using Base64
        const encodedContent = Buffer.from(postBody, "utf-8").toString("base64");

        await db.execute("INSERT INTO posts (title, content, user) VALUES (?, ?, ?)", [postTitle, encodedContent, req.session.username]);
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
            postBody: Buffer.from(result[0]["content"], "base64").toString("utf-8"),
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

        const decodedContent = {
            title: post[0].title,
            content: Buffer.from(post[0].content, "base64").toString("utf-8")

        }


        post.length > 0 ? res.render("edit", { post: decodedContent, username: req.session.username }) : res.status(404).send("Post not found");
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
        const encodedContent = Buffer.from(content, "utf-8").toString("base64");
        const [result] = await db.execute(
            "UPDATE posts SET content = ? WHERE title = ?",
            [encodedContent, postTitle]
        );

        if (result.affectedRows > 0) {
            // Send both status and username
            res.json({
                success: true,
                username: req.session.username
            });
        } else {
            res.status(404).json({ error: "Post not found" });
        }
    } catch (err) {
        console.error("Error updating post:", err);
        res.status(500).json({ error: "Error updating post" });
    }
});


app.get('/:username/profile', async (req, res) => {
    try {
        const username = req.params.username;
        console.log(username);
        const [result] = await db.execute("SELECT * from users WHERE username = ?", [username]);
        console.log(result[0])
        res.render('profile', { username: username })
    } catch (err) {
        console.error("Error fetching profile:", err);
        res.status(500).send("Error fetching profile");
    }
})

// =========================
// Start Server
// =========================
app.listen(3000, () => console.log("Server is running at port 3000."));