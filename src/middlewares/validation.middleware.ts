import { Request, Response, NextFunction } from 'express';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Utility to sanitize strings by trimming and stripping HTML tags (XSS protection)
export const sanitizeString = (str: any): string => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .trim();
};

export const validateSendOtp = (req: Request, res: Response, next: NextFunction) => {
  const { email, firstName, lastName, mode } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const sanitizedEmail = email.trim().toLowerCase();
  if (!emailRegex.test(sanitizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (!mode || !['login', 'signup'].includes(mode)) {
    return res.status(400).json({ error: 'Mode must be either login or signup' });
  }

  if (mode === 'signup') {
    if (!firstName || typeof firstName !== 'string' || !firstName.trim()) {
      return res.status(400).json({ error: 'First name is required for signup' });
    }
    if (!lastName || typeof lastName !== 'string' || !lastName.trim()) {
      return res.status(400).json({ error: 'Last name is required for signup' });
    }
  }

  // Update request body with sanitized inputs
  req.body.email = sanitizedEmail;
  req.body.firstName = firstName ? sanitizeString(firstName) : undefined;
  req.body.lastName = lastName ? sanitizeString(lastName) : undefined;

  next();
};

export const validateVerifyOtp = (req: Request, res: Response, next: NextFunction) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  const sanitizedEmail = email.trim().toLowerCase();
  if (!emailRegex.test(sanitizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  const sanitizedOtp = otp.toString().trim();
  if (!/^\d{6}$/.test(sanitizedOtp)) {
    return res.status(400).json({ error: 'OTP must be a 6-digit number' });
  }

  req.body.email = sanitizedEmail;
  req.body.otp = sanitizedOtp;

  next();
};

export const validateUpdateProfile = (req: Request, res: Response, next: NextFunction) => {
  const { email, firstName, lastName } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const sanitizedEmail = email.trim().toLowerCase();
  if (!emailRegex.test(sanitizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (firstName !== undefined) {
    req.body.firstName = sanitizeString(firstName);
  }
  if (lastName !== undefined) {
    req.body.lastName = sanitizeString(lastName);
  }
  req.body.email = sanitizedEmail;

  next();
};

export const validateCreateProperty = (req: Request, res: Response, next: NextFunction) => {
  const {
    ownerId,
    title,
    description,
    price,
    address,
    city,
    state,
    zipCode,
    bedrooms,
    bathrooms,
    hall,
    type,
    amenities
  } = req.body;

  if (!ownerId) {
    return res.status(400).json({ error: 'ownerId is required' });
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Property title is required' });
  }
  if (price === undefined || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number' });
  }

  req.body.title = sanitizeString(title);
  req.body.description = description ? sanitizeString(description) : '';
  req.body.price = parseFloat(price);
  req.body.address = address ? sanitizeString(address) : '';
  req.body.city = city ? sanitizeString(city) : '';
  req.body.state = state ? sanitizeString(state) : '';
  req.body.zipCode = zipCode ? sanitizeString(zipCode) : '';
  req.body.bedrooms = bedrooms ? parseInt(bedrooms) : 0;
  req.body.bathrooms = bathrooms ? parseFloat(bathrooms) : 0;
  req.body.hall = hall ? parseInt(hall) : 0;
  req.body.type = type ? sanitizeString(type) : 'Apartment';

  if (amenities && Array.isArray(amenities)) {
    req.body.amenities = amenities.map(a => sanitizeString(a));
  } else {
    req.body.amenities = [];
  }

  next();
};

export const validateCreateBooking = (req: Request, res: Response, next: NextFunction) => {
  const { slotId, note } = req.body;

  if (!slotId) return res.status(400).json({ error: 'slotId is required' });

  req.body.note = note ? sanitizeString(note) : '';

  next();
};
