// Products catalog and helpers

export const PRODUCTS = {
  'manjar': 1.50,
  'manjar con pecana': 2.00,
  'cubo': 3.00,
  'oreo': 2.00,
  'oreo manjar': 2.50
};

// If needed elsewhere (e.g., for parsing product names), export sorted names by length
export const PRODUCT_NAMES = Object.keys(PRODUCTS).sort((a, b) => b.length - a.length);