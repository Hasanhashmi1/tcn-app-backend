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
// Update order
app.put('/orders/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    // Remove fields that shouldn't be updated
    delete updates.id;
    delete updates.created_at;

    // Add updated_at timestamp
    updates.updated_at = 'NOW()';

    try {
        // Generate dynamic update query
        const setClause = Object.keys(updates)
            .map((key, i) => `${key} = $${i + 1}`)
            .join(', ');

        const values = Object.values(updates);
        
        const result = await pool.query(
            `UPDATE orders SET ${setClause}
            WHERE id = $${values.length + 1}
            RETURNING *`,
            [...values, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.status(200).json({ order: result.rows[0] });
    } catch (err) {
        console.error("Error updating order:", err);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// Delete order
app.delete('/orders/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            'DELETE FROM orders WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        res.status(200).json({ message: 'Order deleted successfully' });
    } catch (err) {
        console.error("Error deleting order:", err);
        res.status(500).json({ error: 'Failed to delete order' });
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