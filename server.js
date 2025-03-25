// Load environment variables
require("dotenv").config();
console.log("MongoDB URI from .env:", process.env.MONGODB_URI);

const express = require("express");
const session = require("express-session");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { MongoClient, ObjectId } = require("mongodb");
const MongoStore = require("connect-mongo");

const app = express();

// 🔹 Load Configurations
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/styleAI";
const SECRET_KEY = process.env.SECRET_KEY || "d84cbd90116cb82a29b073aa403bd0d61a24524612054e645c3a42aaae3fe5e913520c8ce3eadce34769e065dddce78e8d3e44bee427450e5342f6b5b9549d7b0";
const SESSION_SECRET = process.env.SESSION_SECRET || "cBp6aC52DWa3Qsra0vAXxa2VgN5qJTKfbN6DjSP3/LcnLyNF/nDSXSkJo7yM4KCoc9S1Aei1JTch0JG4tzkPew==";
const PORT = process.env.PORT || 3000;

// 🔹 Initialize MongoDB client
const client = new MongoClient(MONGODB_URI);

async function connectToMongo() {
    try {
        await client.connect();
        console.log("✅ Connected to MongoDB");
    } catch (error) {
        console.error("❌ MongoDB connection error:", error);
        process.exit(1);
    }
}
connectToMongo();

// 🔹 Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(helmet());

// 🔹 Session Middleware
app.use(
    session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({ client, dbName: "styleAI", collectionName: "sessions" }),
        cookie: { secure: process.env.NODE_ENV === "production", httpOnly: true, sameSite: "lax", maxAge: 86400000 },
    })
);

// 🔹 Rate Limiting (Only for Login Route)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: "Too many login attempts, please try again later.",
});
app.use("/api/login", loginLimiter);

// 🔹 MongoDB Collections
const database = client.db("styleAI");
const users = database.collection("users");

// 🟢 **User Authentication Routes**

// 🔹 Login
app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await users.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ success: false, message: "Invalid username or password" });
        }

        req.session.userId = user._id.toString();
        req.session.username = user.username;
        res.json({ success: true, username: user.username });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// 🔹 Create Account
app.post(
    "/api/create-account",
    [
        body("email").isEmail().withMessage("Invalid email format"),
        body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const { firstName, lastName, username, email, password } = req.body;

        try {
            if (await users.findOne({ $or: [{ username }, { email }] })) {
                return res.status(409).json({ success: false, message: "Username or email already exists" });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            await users.insertOne({ firstName, lastName, username, email, password: hashedPassword });

            res.json({ success: true, message: "Account created successfully" });
        } catch (error) {
            console.error("Account creation error:", error);
            res.status(500).json({ success: false, message: "Error creating account" });
        }
    }
);

// 🔹 Logout
app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ success: false, message: "Could not log out" });
        res.json({ success: true });
    });
});

// 🔹 Check Login Status
app.get("/api/check-login", (req, res) => {
    res.json({ isLoggedIn: !!req.session.userId, username: req.session?.username || null });
});

// 🟢 **User Data Routes**

// 🔹 Fetch User Profile
app.get("/api/user-profile", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "User not logged in" });

    try {
        const user = await users.findOne({ _id: new ObjectId(req.session.userId) });
        if (!user) return res.status(404).json({ message: "User not found" });

        res.status(200).json({
            username: user.username,
            measurements: user.measurements || null,
            bodyType: user.bodyType || null,
            outfit: user.outfit || null,
        });
    } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).json({ message: "Error fetching user profile" });
    }
});

// 🔹 Save User Measurements
app.post("/api/save-measurements", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false, message: "User not logged in" });

    try {
        const { height, bust, waist, hips, hipDips, bodyType, outfit } = req.body;
        const userId = new ObjectId(req.session.userId);

        const result = await users.updateOne(
            { _id: userId },
            { $set: { measurements: { height, bust, waist, hips, hipDips }, bodyType, outfit } }
        );

        if (result.matchedCount === 1) {
            res.status(200).json({ success: true, message: "Measurements saved successfully" });
        } else {
            res.status(400).json({ success: false, message: "Failed to save measurements: User not found" });
        }
    } catch (error) {
        console.error("Error saving measurements:", error);
        res.status(500).json({ success: false, message: "Error saving measurements" });
    }
});

// 🔹 Check if User Exists
app.get("/api/check-user/:username", async (req, res) => {
    const { username } = req.params;
    const user = await users.findOne({ username });
    res.json({ exists: !!user, user: user ? { username: user.username, _id: user._id } : null });
});

// 🟢 **Global Error Handling**
app.use((err, req, res, next) => {
    console.error("Error:", err);
    res.status(err.status || 500).json({ success: false, message: err.message || "Internal Server Error" });
});

// 🟢 **Start Server**
app.listen(PORT, () => {
    console.log(`🚀 Server started on port ${PORT}`);
});
