/**
 * Database class for storing application data.
 */
export class Database {
  /**
   * Create a new database instance.
   */
  constructor() {
    this.users = [];
    this.products = [];
    this.orders = [];
    this.connected = false;
  }

  /**
   * Connect to the database.
   * @returns {boolean} Connection status.
   */
  connect() {
    this.connected = true;
    console.log('Connected to database');
    return this.connected;
  }

  /**
   * Save a user to the database.
   * @param {User} user - The user to save.
   */
  saveUser(user) {
    if (!this.connected) {
      this.connect();
    }
    this.users.push(user);
    console.log(`User ${user.name} saved to database`);
  }

  /**
   * Save a product to the database.
   * @param {Product} product - The product to save.
   */
  saveProduct(product) {
    if (!this.connected) {
      this.connect();
    }
    this.products.push(product);
    console.log(`Product ${product.name} saved to database`);
  }

  /**
   * Save an order to the database.
   * @param {Order} order - The order to save.
   */
  saveOrder(order) {
    if (!this.connected) {
      this.connect();
    }
    this.orders.push(order);
    console.log(`Order ${order.id} saved to database`);
  }

  /**
   * Get all users from the database.
   * @returns {User[]} The users.
   */
  getUsers() {
    return this.users;
  }

  /**
   * Get all products from the database.
   * @returns {Product[]} The products.
   */
  getProducts() {
    return this.products;
  }

  /**
   * Get all orders from the database.
   * @returns {Order[]} The orders.
   */
  getOrders() {
    return this.orders;
  }
}
