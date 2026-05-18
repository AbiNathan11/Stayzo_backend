import { Request, Response } from 'express';
import { sendOTPEmail } from '../services/email.service';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// In-memory store for OTPs (For production, use Redis or PostgreSQL)
const otpStore = new Map<string, { otp: string; expiresAt: number; firstName?: string; lastName?: string; mode: string }>();

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const sendOtp = async (req: Request, res: Response) => {
  try {
    const { email, firstName, lastName, mode } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Database validation based on mode
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (mode === 'signup' && existingUser) {
      return res.status(400).json({ error: 'User already exists with this email. Please log in.' });
    }

    if (mode === 'login' && !existingUser) {
      return res.status(400).json({ error: 'No account found with this email. Please sign up first.' });
    }

    const otp = generateOTP();
    
    // Store OTP with 10 mins expiry
    otpStore.set(email, { 
      otp, 
      expiresAt: Date.now() + 10 * 60 * 1000,
      firstName,
      lastName,
      mode
    });

    // Check if EMAIL_USER is configured, otherwise simulate
    if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your-email@gmail.com') {
      console.log(`[SIMULATION] OTP for ${email} is ${otp}`);
      return res.status(200).json({ message: 'OTP simulated successfully (Configure EMAIL_USER in .env to send real emails)' });
    }

    const emailSent = await sendOTPEmail(email, otp);

    if (emailSent) {
      res.status(200).json({ message: 'OTP sent successfully to your email' });
    } else {
      res.status(500).json({ error: 'Failed to send OTP email. Please check your mailer configuration.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const record = otpStore.get(email);

    if (!record) {
      return res.status(400).json({ error: 'No OTP requested for this email' });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    if (record.otp === otp) {
      // Clear OTP after successful verification
      otpStore.delete(email);
      
      let user;

      if (record.mode === 'signup') {
         // Create the new user in DB
         user = await prisma.user.create({
           data: {
             email: email,
             firstName: record.firstName || '',
             lastName: record.lastName || ''
           }
         });
      } else {
         // Login mode, fetch user
         user = await prisma.user.findUnique({ where: { email } });
      }
      
      // Generate JWT Token
      const token = jwt.sign(
        { id: user?.id, email: user?.email, firstName: user?.firstName, lastName: user?.lastName }, 
        process.env.JWT_SECRET || 'fallback_secret', 
        { expiresIn: '7d' }
      );
      
      res.status(200).json({ 
        message: record.mode === 'signup' ? 'Signup successful' : 'Login successful',
        token,
        user: { email: user?.email, firstName: user?.firstName, lastName: user?.lastName }
      });
    } else {
      res.status(400).json({ error: 'Invalid OTP code' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
