const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const PORT = process.env.PORT || 5000;

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Orders CRUD Endpoints

// Get all orders
app.get('/orders', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM orders WHERE order_status_id = 4 ORDER BY created_at DESC'
        );
        res.status(200).json({ orders: result.rows });
    } catch (err) {
        console.error("Error fetching orders:", err);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Get single order by ID
app.get('/orders/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const result = await pool.query(
            'SELECT * FROM orders WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        res.status(200).json({ order: result.rows[0] });
    } catch (err) {
        console.error("Error fetching order:", err);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

// Create new order
app.post('/orders', async (req, res) => {
    const {
        customer_id,
        product_id,
        paymentmethod_id,
        recharge_by_id,
        order_status_id,
        paid_amount,
        due_amount,
        order_comments,
        portal_recharge_status_id
    } = req.body;

    if (!customer_id || !product_id || !paymentmethod_id || 
        !order_status_id || paid_amount === undefined || 
        due_amount === undefined || !portal_recharge_status_id) {
        return res.status(400).json({ 
            error: 'Missing required fields',
            required_fields: [
                'customer_id',
                'product_id',
                'paymentmethod_id',
                'order_status_id',
                'paid_amount',
                'due_amount',
                'portal_recharge_status_id'
            ]
        });
    }

    try {
        const result = await pool.query(
            `INSERT INTO orders (
                customer_id, product_id, paymentmethod_id, "recharge_by_id", 
                order_status_id, paid_amount, due_amount, order_comments,
                portal_recharge_status_id, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            RETURNING *`,
            [
                customer_id, 
                product_id, 
                paymentmethod_id, 
                recharge_by_id || null,
                order_status_id, 
                paid_amount, 
                due_amount, 
                order_comments || null,
                portal_recharge_status_id
            ]
        );

        res.status(201).json({ order: result.rows[0] });
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ 
            error: 'Failed to create order',
            details: err.message
        });
    }
});

// Get all customers
app.get('/customers', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM customers
            ORDER BY id DESC
        `);
        res.status(200).json({ customers: result.rows });
    } catch (err) {
        console.error("Error fetching customers:", err);
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

// Get single customer by ID
app.get('/customers/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const result = await pool.query(`
            SELECT * FROM customers
            WHERE id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        
        res.status(200).json({ customer: result.rows[0] });
    } catch (err) {
        console.error("Error fetching customer:", err);
        res.status(500).json({ error: 'Failed to fetch customer' });
    }
});

// Create new customer
app.post('/customers', async (req, res) => {
    const {
        user_id = null,
        address,
        vc_number,
        stb_number,
        area_id,
        subscription_status,
        installation_date,
        subscription_expires_on
    } = req.body;

    if (!address || !vc_number || !stb_number || !area_id) {
        return res.status(400).json({ 
            error: 'Missing required fields',
            required_fields: [
                'address',
                'vc_number',
                'stb_number',
                'area_id'
            ]
        });
    }

    try {
        const result = await pool.query(`
            INSERT INTO customers (
                user_id, address, vc_number, stb_number, area_id,
                subscription_status,
                installation_date, subscription_expires_on
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            user_id,
            address,
            vc_number,
            stb_number,
            area_id,
            subscription_status || null,
            installation_date || null,
            subscription_expires_on || null,
        ]);

        res.status(201).json({ customer: result.rows[0] });
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ 
            error: 'Failed to create customer',
            details: err.message
        });
    }
});

// Signup Route
app.post('/signup', async (req, res) => {
    try {
        const { first_name, last_name, email, password, user_type_id, mobile_phone } = req.body;
        
        // Add validation logging
        console.log("Received signup data:", req.body);

        if (!first_name || !last_name || !email || !password || !user_type_id || !mobile_phone) {
            console.log("Missing fields detected");
            return res.status(400).json({ 
                error: 'All fields are required',
                received: req.body 
            });
        }

        // Check email exists
        const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        // Hash password with error handling
        let hashedPassword;
        try {
            hashedPassword = await bcrypt.hash(password, 10);
        } catch (hashError) {
            console.error("Password hashing failed:", hashError);
            return res.status(500).json({ error: 'Password processing failed' });
        }

        // Create user
        const result = await pool.query(
            `INSERT INTO users (first_name, last_name, email, password, user_type_id, mobile_phone, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) 
             RETURNING id, first_name, last_name, email, user_type_id, mobile_phone`,
            [first_name, last_name, email, hashedPassword, user_type_id, mobile_phone]
        );
        

        return res.status(201).json({ 
            message: 'User created successfully', 
            user: result.rows[0] 
        });

    } catch (err) {
        console.error("FULL SIGNUP ERROR:", {
            message: err.message,
            stack: err.stack,
            raw: err
        });
        return res.status(500).json({ 
            error: 'Signup failed',
            details: err.message  // Send actual error to frontend
        });
    }
});

// Login Route
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        // Find user by email
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Compare the password with the hashed password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate JWT Token
        const token = jwt.sign(
            { userId: user.id, email: user.email, userType: user.user_type_id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                user_type_id: user.user_type_id,
                mobile_phone: user.mobile_phone
            }
        });
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: 'Login failed', details: err.message });
    }
});


// Error handling
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});