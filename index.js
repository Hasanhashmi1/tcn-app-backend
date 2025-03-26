const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const PORT = process.env.PORT || 5000;

// Orders CRUD Endpoints

// Get all orders
app.get('/orders', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM orders ORDER BY created_at DESC'
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

// Create new order - CORRECTED to match your schema
app.post('/orders', async (req, res) => {
    const {
        customer_id,
        product_id,
        paymentmethod_id,
        recharge_by_id,  // This JavaScript comment is fine (outside SQL string)
        order_status_id,
        paid_amount,
        due_amount,
        order_comments,
        portal_recharge_status_id
    } = req.body;

    // Input validation (JavaScript comment - OK)
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
            details: err.message,
            hint: "Check: (1) Foreign keys exist (2) Column names match exactly (3) No syntax errors in query"
        });
    }
});




// Get all customers (without user join)
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

// Get single customer by ID (without user join)
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

// Create new customer (without foreign key validation)
app.post('/customers', async (req, res) => {
    const {
        user_id = null,  // Default to null if not provided
        address,
        vc_number,
        stb_number,
        area_id,
        subscription_status,
        installation_date,
        subscription_expires_on
    } = req.body;

    // Validation (user_id is now optional)
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
            user_id,  // Can be null or any value
            address,
            vc_number,
            stb_number,
            area_id,
            subscription_status || null,
            installation_date || null,
            subscription_expires_on || null
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















process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
  });
  
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
  });

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});