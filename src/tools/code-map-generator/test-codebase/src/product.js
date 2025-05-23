/**
 * Product class representing an item for sale.
 */
export class Product {
  /**
   * Create a new product.
   * @param {string} name - The product name.
   * @param {number} price - The product price.
   */
  constructor(name, price) {
    this.name = name;
    this.price = price;
    this.id = Math.random().toString(36).substring(2, 9);
    this.createdAt = new Date();
  }

  /**
   * Get the product's full information.
   * @returns {string} The product's information.
   */
  getInfo() {
    return `Product: ${this.name} ($${this.price})`;
  }

  /**
   * Apply a discount to the product.
   * @param {number} percentage - The discount percentage.
   * @returns {number} The discounted price.
   */
  applyDiscount(percentage) {
    const discount = this.price * (percentage / 100);
    return this.price - discount;
  }
}
