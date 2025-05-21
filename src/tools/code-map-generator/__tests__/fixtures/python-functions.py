"""
Test fixture for Python function detection.
"""

def regular_function(name):
    """
    A regular function.
    
    Args:
        name (str): The name parameter.
        
    Returns:
        str: A greeting message.
    """
    return f"Hello, {name}!"

# A class with methods
class TestClass:
    """A test class for function detection."""
    
    def __init__(self, value):
        """
        Initialize the TestClass.
        
        Args:
            value (int): The initial value.
        """
        self.value = value
    
    def method_function(self, a, b):
        """
        A method in a class.
        
        Args:
            a (int): First parameter.
            b (int): Second parameter.
            
        Returns:
            int: The sum of a and b.
        """
        return a + b
    
    @classmethod
    def class_method(cls, x):
        """A class method."""
        return x * 2
    
    @staticmethod
    def static_method(y):
        """A static method."""
        return y * 3

# A lambda function
lambda_func = lambda x: x * 2

# A decorator function
def decorator(func):
    """A decorator function."""
    def wrapper(*args, **kwargs):
        print("Before function call")
        result = func(*args, **kwargs)
        print("After function call")
        return result
    return wrapper

@decorator
def decorated_function():
    """A decorated function."""
    print("Inside decorated function")

# A generator function
def generator_function():
    """A generator function."""
    for i in range(5):
        yield i

# Async function
async def async_function():
    """An async function."""
    await asyncio.sleep(1)
    return "Done"
