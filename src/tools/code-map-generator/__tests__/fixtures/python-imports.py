"""
Test fixture for Python import resolution.
This file contains various types of Python imports to test the import resolver.
"""

# Standard library imports
import os
import sys
import json
from datetime import datetime, timedelta
from collections import defaultdict, Counter
import re as regex
from pathlib import Path
from typing import List, Dict, Tuple, Optional, Union, Any

# Third-party package imports
import numpy as np
import pandas as pd
from requests import get, post, Session
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split

# Relative imports
from . import module1
from .subpackage import module2
from ..parentpackage import module3
from .subpackage.nested import module4

# Aliased imports
import tensorflow as tf
import matplotlib.pyplot as plt
from numpy import array as np_array, zeros as np_zeros

# Wildcard imports
from os import *
from numpy import *

# Conditional imports
try:
    import torch
    from torch import nn
except ImportError:
    torch = None
    nn = None

# Dynamic imports
module_name = "math"
math_module = __import__(module_name)

# Multi-line imports
from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    create_engine
)

# Import with specific items
from flask import (
    Flask,
    request,
    jsonify,
    render_template,
    redirect,
    url_for,
    session
)

# Class with imports in methods
class ImportExample:
    """A class that uses imports in its methods."""
    
    def __init__(self):
        # Import inside a method
        import logging
        self.logger = logging.getLogger(__name__)
    
    def method1(self):
        # Another import inside a method
        from time import sleep
        sleep(1)
    
    @staticmethod
    def static_method():
        # Import in a static method
        import random
        return random.randint(1, 100)

# Function with local imports
def function_with_imports():
    """A function that uses imports."""
    # Local import
    import hashlib
    # Use the import
    return hashlib.md5(b"test").hexdigest()

# Main block with imports
if __name__ == "__main__":
    # Import in main block
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", help="Input file")
    args = parser.parse_args()
