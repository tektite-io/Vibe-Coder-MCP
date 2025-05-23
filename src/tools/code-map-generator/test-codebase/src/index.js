/**
 * Main entry point for the application.
 */
import { User } from './user.js';
import { Product } from './product.js';
import { Order } from './order.js';
import { Database } from '../lib/database.js';

// Initialize the database
const db = new Database();

// Create some users
const user1 = new User('John Doe', 'john@example.com');
const user2 = new User('Jane Smith', 'jane@example.com');

// Create some products
const product1 = new Product('Laptop', 999.99);
const product2 = new Product('Phone', 499.99);
const product3 = new Product('Tablet', 299.99);

// Create some orders
const order1 = new Order(user1, [product1, product2]);
const order2 = new Order(user2, [product2, product3]);

// Save to database
db.saveUser(user1);
db.saveUser(user2);
db.saveProduct(product1);
db.saveProduct(product2);
db.saveProduct(product3);
db.saveOrder(order1);
db.saveOrder(order2);

console.log('Application initialized successfully!');
