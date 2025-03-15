const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const PORT = process.env.PORT || 5000;

// Signup Route

app.post('/signup', async (req, res) => {
    const { first_name, last_name, email, password, user_type_id, mobile_phone } = req.body;
  
    try {
      // Check if the email already exists
      const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      if (userExists.rows.length > 0) {
        return res.status(400).json({ error: 'Email already exists' });
      }
  
      // Hash the password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
  
      // Insert user into the database
      const result = await pool.query(
        `INSERT INTO users 
        (first_name, last_name, email, password, user_type_id, mobile_phone, created_at, updated_at) 
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) 
        RETURNING id, first_name, last_name, email, user_type_id, mobile_phone`,
        [first_name, last_name, email, passwordHash, user_type_id, mobile_phone]
      );
  
      res.status(201).json({ message: 'User created', user: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'An error occurred during signup' });
    }
  });

// Login Route
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
  
    try {
      // Find the user by email
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = result.rows[0];
  
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      // Compare passwords
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }
  
      // Generate a JWT token
      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  
      res.status(200).json({ message: 'Login successful', token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'An error occurred during login' });
    }
  });

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

