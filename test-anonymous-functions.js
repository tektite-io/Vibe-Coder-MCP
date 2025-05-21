// Test file with various anonymous functions

// Variable assignment with arrow function
const arrowFunc = () => {
  console.log('This is an arrow function');
};

// Variable assignment with function expression
const funcExpr = function() {
  console.log('This is a function expression');
};

// Test framework style function
describe('Test Suite', () => {
  it('should test something', () => {
    console.log('This is a test');
  });
});

// Array method callback
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map((num) => num * 2);

// Promise chain
Promise.resolve()
  .then(() => {
    console.log('Promise resolved');
  })
  .catch((error) => {
    console.error('Promise error', error);
  });

// Event listener
document.addEventListener('click', (event) => {
  console.log('Document clicked', event);
});

// IIFE (Immediately Invoked Function Expression)
(function() {
  console.log('IIFE executed');
})();

// Nested functions
function outerFunction() {
  const innerFunction = () => {
    console.log('Inner function');
  };
  
  innerFunction();
}
