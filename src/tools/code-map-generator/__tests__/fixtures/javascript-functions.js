/**
 * Test fixture for JavaScript function detection.
 */

/**
 * A regular function declaration.
 * @param {string} name - The name parameter.
 * @returns {string} A greeting message.
 */
function regularFunction(name) {
  return `Hello, ${name}!`;
}

// An arrow function with a descriptive comment
const arrowFunction = (x) => {
  return x * 2;
};

// A class with methods
class TestClass {
  /**
   * A method in a class.
   * @param {number} a - First parameter.
   * @param {number} b - Second parameter.
   * @returns {number} The sum of a and b.
   */
  methodFunction(a, b) {
    return a + b;
  }
}

// A React component
const ReactComponent = ({ name }) => {
  return <div>Hello, {name}!</div>;
};

// A custom React hook
const useCustomHook = () => {
  const [value, setValue] = React.useState(0);
  
  React.useEffect(() => {
    // Do something
  }, [value]);
  
  return { value, setValue };
};

// Event handler
const handleClick = () => {
  console.log('Button clicked');
};

// Array method callback
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(num => num * 2);

// IIFE
(function() {
  console.log('Immediately invoked');
})();

export { regularFunction, arrowFunction, TestClass, ReactComponent, useCustomHook };
