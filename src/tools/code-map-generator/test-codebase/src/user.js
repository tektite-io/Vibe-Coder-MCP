/**
 * User class representing a customer.
 */
export class User {
  /**
   * Create a new user.
   * @param {string} name - The user's name.
   * @param {string} email - The user's email.
   */
  constructor(name, email) {
    this.name = name;
    this.email = email;
    this.id = Math.random().toString(36).substring(2, 9);
    this.createdAt = new Date();
  }

  /**
   * Get the user's full information.
   * @returns {string} The user's information.
   */
  getInfo() {
    return `User: ${this.name} (${this.email})`;
  }

  /**
   * Update the user's email.
   * @param {string} email - The new email.
   */
  updateEmail(email) {
    this.email = email;
  }
}
