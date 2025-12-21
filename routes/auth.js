import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { withCredentialDefaults } from "../utils/credentials.js";

const router = express.Router();

const sanitizeUser = (user) => user.toPublicJSON();
const sanitizeUserWithoutFiles = (user) => user.toPublicJSONWithoutFiles();
const sanitizeUserForLogin = (user) => user.toLoginJSON();

router.post("/register", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      userName,
      email,
      password,
      position,
      status,
      hireDate,
      credentials,
    } = req.body;

    if (!email || !password || !userName) {
      return res
        .status(400)
        .json({ success: false, message: "Email, username, and password required" });
    }

    const existing = await User.findOne({
      $or: [{ email }, { userName }],
    });

    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Email or username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      firstName,
      lastName,
      userName,
      email,
      password: hashedPassword,
      position,
      status,
      hireDate,
      credentials: withCredentialDefaults(credentials),
    });

    res.status(201).json({ success: true, user: sanitizeUser(user) });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password required" });
    }

    const user = await User.findOne({ email });
    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Ultra-lightweight login response - only essential user info, no credentials
    res.json({ success: true, user: sanitizeUserForLogin(user) });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;

