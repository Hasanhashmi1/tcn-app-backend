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


// Field user wise dues (we have to check field user id then print only due_amount where order_status is partial and pending payment respective to that field user)
app.get('/field-users/:id/dues', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `SELECT 
                order_created_by_id as field_user_id,
                due_amount,
                order_status_id,
                created_at
             FROM orders 
             WHERE order_created_by_id = $1 
             AND order_status_id IN (1, 4)
             ORDER BY created_at DESC`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                message: 'No pending dues found for this field user',
                field_user_id: id
            });
        }

        res.status(200).json({ 
            field_user_id: id,
            dues: result.rows,
            count: result.rows.length
        });
    } catch (err) {
        console.error("Database Error:", {
            error: err.message,
            stack: err.stack,
            query: 'SELECT dues for field user',
            parameters: [id]
        });
        res.status(500).json({
            error: 'Failed to fetch field user dues',
            details: err.message
        });
    }
});


// Customer wise dues(similar to field user wise dues but we have to only print current due_amount of that particular customer)
app.get('/customers/:id/dues', async (req, res) => {
    const { id } = req.params;

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid customer ID' });
    }

    try {
        const customerQuery = await pool.query(
            `SELECT 
                id, 
                vc_number, 
                stb_number, 
                address 
             FROM customers 
             WHERE id = $1`,
            [id]
        );

        if (customerQuery.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Customer not found',
                customer_id: id
            });
        }

        const customer = customerQuery.rows[0];

        const duesQuery = await pool.query(
            `SELECT 
                id as order_id,
                due_amount,
                order_status_id,
                created_at
             FROM orders 
             WHERE customer_id = $1 
             AND order_status_id IN (1, 4)  -- 1=Pending, 4=Partial
             AND due_amount > 0  -- Only orders with actual dues
             ORDER BY created_at DESC`,
            [id]
        );

        const response = {
            customer_id: customer.id,
            customer_details: {
                vc_number: customer.vc_number,
                stb_number: customer.stb_number,
                address: customer.address
            },
            dues: duesQuery.rows.map(order => ({
                order_id: order.order_id,
                due_amount: order.due_amount,
                status: order.order_status_id === 1 ? 'Pending Payment' : 'Partial Payment',
                created_at: order.created_at
            })),
            total_due: duesQuery.rows.reduce((sum, order) => sum + parseFloat(order.due_amount || 0), 0),
            due_count: duesQuery.rows.length
        };

        res.status(200).json(response);

    } catch (err) {
        console.error('Database Error:', {
            message: err.message,
            stack: err.stack,
            query: 'Customer dues lookup',
            timestamp: new Date().toISOString()
        });
        res.status(500).json({ 
            error: 'Failed to fetch customer dues',
            details: process.env.NODE_ENV === 'development' ? err.message : null
        });
    }
});


app.get('/pending-orders', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id AS order_id,
                customer_id,
                due_amount,
                order_status_id AS status,
                created_at
            FROM orders
            WHERE order_status_id IN (1, 4)  -- 1=Pending, 4=Partial
            ORDER BY created_at DESC
        `);

        res.status(200).json({
            message: 'Successfully fetched pending/partial orders',
            orders: result.rows,
            count: result.rows.length
        });

    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ 
            error: 'Failed to fetch orders',
            message: err.message 
        });
    }
});


app.put('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { order_status_id, paid_amount, due_amount, portal_recharge_status_id } = req.body;

        const result = await pool.query(
            `UPDATE orders 
             SET 
                order_status_id = $1,
                paid_amount = $2,
                due_amount = $3,
                portal_recharge_status_id = $4,
                updated_at = NOW()
             WHERE id = $5
             RETURNING *`,
            [order_status_id, paid_amount, due_amount, portal_recharge_status_id, id]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// Add this endpoint to your existing backend
app.get('/api/user/me', async (req, res) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await pool.query(
        'SELECT first_name, last_name FROM users WHERE id = $1', 
        [decoded.userId]
      );
  
      if (user.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      res.json({
        firstName: user.rows[0].first_name,
        lastName: user.rows[0].last_name
      });
    } catch (err) {
      console.error("User data error:", err);
      res.status(500).json({ error: 'Failed to fetch user data' });
    }
  });











// app.put('/customers/:id/subscription', async (req, res) => {
    
//     const { id } = req.params;
//     const { subscription_status } = req.body;

//     // Validate status
//     if (![1, 2, 3].includes(subscription_status)) {
//         return res.status(400).send('Status must be 1 (active), 2 (deactive), or 3 (hold)');
//     }

//     try {
//         const result = await pool.query(
//             `UPDATE customers 
//              SET subscription_status = $1, updated_at = NOW()
//              WHERE id = $2
//              RETURNING id, subscription_status`,
//             [subscription_status, id]
//         );

//         if (!(result.rows.length > 0)) return res.status(404).send('Customer not found');
        
//         res.json({
//             id: result.rows[0].id,
//             status: result.rows[0].subscription_status
//         });
//     } catch (err) {
//         console.error(err);
//         res.status(500).send('Update failed');
//     }
// });




























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