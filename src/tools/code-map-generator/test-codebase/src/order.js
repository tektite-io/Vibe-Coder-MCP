/**
 * Order class representing a purchase.
 */
import { User } from './user.js';
import { Product } from './product.js';

export class Order {
  /**
   * Create a new order.
   * @param {User} user - The user making the order.
   * @param {Product[]} products - The products in the order.
   */
  constructor(user, products) {
    this.user = user;
    this.products = products;
    this.id = Math.random().toString(36).substring(2, 9);
    this.createdAt = new Date();
    this.status = 'pending';
  }

  /**
   * Calculate the total price of the order.
   * @returns {number} The total price.
   */
  calculateTotal() {
    return this.products.reduce((total, product) => total + product.price, 0);
  }

  /**
   * Apply a discount to the entire order.
   * @param {number} percentage - The discount percentage.
   * @returns {number} The discounted total.
   */
  applyDiscount(percentage) {
    const total = this.calculateTotal();
    const discount = total * (percentage / 100);
    return total - discount;
  }

  /**
   * Update the order status.
   * @param {string} status - The new status.
   */
  updateStatus(status) {
    this.status = status;
  }
}
