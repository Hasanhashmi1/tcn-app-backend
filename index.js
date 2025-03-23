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

    // Validate request body
    if (!first_name || !last_name || !email || !password || !user_type_id || !mobile_phone) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate mobile number (must be exactly 10 digits)
    if (!/^\d{10}$/.test(mobile_phone)) {
        return res.status(400).json({ error: 'Mobile number must be exactly 10 digits' });
    }

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

// // Add a new customer
// app.post('/customers', async (req, res) => {
//     const { user_id, address, stb_number, subscription_status, area_id, old_vc_number, old_stb_number } = req.body;

//     // Validate required fields
//     if (!user_id || !address || !stb_number || !subscription_status || !area_id) {
//         return res.status(400).json({ error: 'Missing required fields' });
//     }

//     try {
//         // Check if the user exists
//         const userExists = await pool.query('SELECT * FROM users WHERE id = $1', [user_id]);
//         if (userExists.rows.length === 0) {
//             return res.status(404).json({ error: 'User not found' });
//         }

//         // Insert customer into the database
//         const result = await pool.query(
//             `INSERT INTO customers 
//             (user_id, address, stb_number, subscription_status, area_id, old_vc_number, old_stb_number) 
//             VALUES ($1, $2, $3, $4, $5, $6, $7) 
//             RETURNING *`,
//             [user_id, address, stb_number, subscription_status, area_id, old_vc_number || null, old_stb_number || null]
//         );

//         res.status(201).json({ message: 'Customer created', customer: result.rows[0] });
//     } catch (err) {
//         console.error("Error creating customer:", err);
//         res.status(500).json({ error: 'An error occurred while creating the customer' });
//     }
// });

// // Fetch all customers with user details
// app.get('/customers', async (req, res) => {
//     try {
//         const result = await pool.query(
//             `SELECT 
//                 customers.id,
//                 customers.address,
//                 customers.stb_number,
//                 customers.subscription_status,
//                 customers.area_id,
//                 customers.old_vc_number,
//                 customers.old_stb_number,
//                 users.first_name,
//                 users.last_name,
//                 users.email,
//                 users.mobile_phone
//             FROM customers
//             INNER JOIN users ON customers.user_id = users.id`
//         );

//         res.status(200).json({ customers: result.rows });
//     } catch (err) {
//         console.error("Error fetching customers:", err);
//         res.status(500).json({ error: 'An error occurred while fetching customers' });
//     }
// });

// Function to wake up the API
const wakeUpApi = async () => {
    try {
        const response = await fetch(`http://localhost:${PORT}/customers`); // Replace with your API's actual URL
        console.log(`API woke up! Status: ${response.status}`);
    } catch (error) {
        console.error("Failed to wake up API:", error.message);
    }
};

// Send a request every 10 minutes (600,000 milliseconds)
const intervalTime = 10 * 60 * 1000; // 10 minutes
setInterval(wakeUpApi, intervalTime);

// Initial call to wake up the API immediately
wakeUpApi();

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});