import { Request, Response } from 'express';
import { sendOTPEmail } from '../services/email.service';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { watermarkImage } from '../utils/watermark';
import { uploadToS3 } from '../utils/s3Upload';

// We now use Prisma for OTP storage instead of an in-memory Map

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const sendOtp = async (req: Request, res: Response) => {
  try {
    const { email, firstName, lastName, mode, role, nicFront, nicBack } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Database validation based on mode
    let existingUser = null;
    let isDbOnline = true;
    try {
      existingUser = await prisma.user.findUnique({ where: { email } });
    } catch (err) {
      console.warn("Database connection issue. Bypassing check for seamless testing.", err);
      isDbOnline = false;
    }

    // Always allow adminstayzo@gmail.com and admin@/owner@/landlord@ emails to bypass checks
    const lowerEmail = email.toLowerCase();
    const isSpecialEmail = lowerEmail === 'adminstayzo@gmail.com' || lowerEmail === 'stayzoavp@gmail.com' || lowerEmail.startsWith('admin@') || lowerEmail.includes('owner') || lowerEmail.includes('landlord');

    let isUpgrade = false;
    if (mode === 'signup' && existingUser && isDbOnline) {
      if (role === 'landlord' && !existingUser.isOwner) {
        isUpgrade = true;
      } else if ((role === 'tenant' || !role) && !existingUser.isTenant) {
        isUpgrade = true;
      }
    }

    if (mode === 'signup' && existingUser && isDbOnline && !isUpgrade) {
      return res.status(400).json({ error: 'User already exists with this email. Please log in.' });
    }

    if (mode === 'login' && !existingUser && isDbOnline && !isSpecialEmail) {
      return res.status(400).json({ error: 'No account found with this email. Please sign up first.' });
    }

    // Block login early if role is specified and doesn't match the database role
    if (mode === 'login' && existingUser && isDbOnline) {
      if (role === 'landlord' && !existingUser.isOwner) {
        return res.status(403).json({
          error: 'Access denied. Your account is not registered as a landlord. Please sign up as a landlord first.'
        });
      }
      if ((role === 'tenant' || !role) && !existingUser.isTenant) {
        return res.status(403).json({
          error: 'Access denied. Your account is not registered as a tenant. Please sign up as a tenant first.'
        });
      }
    }

    // Apply diagonal watermark to secure uploaded identity cards, then upload to AWS S3 (with base64 fallback)
    let nicFrontUrl: string | null = null;
    let nicBackUrl: string | null = null;

    if (nicFront) {
      const watermarkedFront = await watermarkImage(nicFront);
      // Upload watermarked NIC front to S3; fall back to base64 if S3 is not configured/fails
      const uploaded = await uploadToS3(watermarkedFront, 'stayzo/nic-documents');
      nicFrontUrl = uploaded;
      if (!uploaded.startsWith('https://')) {
        console.warn('NIC front S3 upload failed for:', email, '- using base64 fallback');
      }
    }
    if (nicBack) {
      const watermarkedBack = await watermarkImage(nicBack);
      // Upload watermarked NIC back to S3; fall back to base64 if S3 is not configured/fails
      const uploaded = await uploadToS3(watermarkedBack, 'stayzo/nic-documents');
      nicBackUrl = uploaded;
      if (!uploaded.startsWith('https://')) {
        console.warn('NIC back S3 upload failed for:', email, '- using base64 fallback');
      }
    }

    const otp = generateOTP();
    
    // Store OTP with 10 mins expiry — NIC fields now hold S3 URLs, not raw base64
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    // Upsert so if they request multiple times, it just updates the existing record
    await prisma.otp.upsert({
      where: { email },
      update: { otp, expiresAt, firstName, lastName, mode, role: role || 'tenant', nicFront: nicFrontUrl, nicBack: nicBackUrl },
      create: { email, otp, expiresAt, firstName: firstName || null, lastName: lastName || null, mode, role: role || 'tenant', nicFront: nicFrontUrl, nicBack: nicBackUrl }
    });

    // Check if EMAIL_USER is configured, otherwise simulate
    if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your-email@gmail.com') {
      console.log(`[SIMULATION] OTP for ${email} is ${otp}`);
      return res.status(200).json({ message: 'OTP simulated successfully (Configure EMAIL_USER in .env to send real emails)' });
    }

    // Log the OTP to the terminal for easy testing and debugging
    console.log(`[DEV LOG] Generated OTP for ${email} is: ${otp}`);

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

    const record = await prisma.otp.findUnique({ where: { email } });

    if (!record) {
      return res.status(400).json({ error: 'No OTP requested for this email' });
    }

    if (new Date() > record.expiresAt) {
      await prisma.otp.delete({ where: { email } });
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    if (record.otp === otp) {
      // Clear OTP after successful verification
      await prisma.otp.delete({ where: { email } });
      
      let user = null;
      let isDbOnline = false;
      try {
        const lowerEmail = email.toLowerCase();
        const isEmailAdmin = lowerEmail === 'adminstayzo@gmail.com' || lowerEmail === 'stayzoavp@gmail.com' || lowerEmail.startsWith('admin@');

        if (record.mode === 'signup') {
           const existing = await prisma.user.findUnique({ where: { email } });
           if (existing) {
             // Upgrade existing user in DB
             user = await prisma.user.update({
               where: { email },
               data: {
                 isAdmin: isEmailAdmin ? true : existing.isAdmin,
                 isOwner: isEmailAdmin ? false : (record.role === 'landlord' ? true : existing.isOwner),
                 isTenant: isEmailAdmin ? false : ((record.role === 'tenant' || !record.role) ? true : existing.isTenant),
                 nicFront: record.nicFront || existing.nicFront,
                 nicBack: record.nicBack || existing.nicBack
               }
             });
           } else {
             // Create the new user in DB
             user = await prisma.user.create({
               data: {
                 email: email,
                 firstName: record.firstName || '',
                 lastName: record.lastName || '',
                 isAdmin: isEmailAdmin,
                 isOwner: isEmailAdmin ? false : record.role === 'landlord',
                 isTenant: isEmailAdmin ? false : (record.role === 'tenant' || !record.role),
                 nicFront: record.nicFront || null,
                 nicBack: record.nicBack || null
               }
             });
           }
        } else {
           // Login mode — fetch user
           user = await prisma.user.findUnique({ where: { email } });

           // If it's a special admin email and doesn't exist yet, create it as admin
           if (!user && isEmailAdmin) {
             user = await prisma.user.create({
               data: {
                 email: email,
                 firstName: record.firstName || 'Admin',
                 lastName: record.lastName || 'Stayzo',
                 isAdmin: true,
                 isOwner: false,
                 isTenant: false
               }
             });
           }

           // Ensure existing admin email in DB has correct flags
           if (user && isEmailAdmin && (!user.isAdmin || user.isTenant || user.isOwner)) {
             user = await prisma.user.update({
               where: { email },
               data: {
                 isAdmin: true,
                 isTenant: false,
                 isOwner: false
               }
             });
           }

           // Block login if the user exists but role flags do not match record.role (except admin bypass)
           if (user && !isEmailAdmin) {
             if (record.role === 'landlord' && !user.isOwner) {
               return res.status(403).json({
                 error: 'Access denied. Your account is not registered as a landlord. Please sign up as a landlord first.'
               });
             }
             if ((record.role === 'tenant' || !record.role) && !user.isTenant) {
               return res.status(403).json({
                 error: 'Access denied. Your account is not registered as a tenant. Please sign up as a tenant first.'
               });
             }
           }
        }
        isDbOnline = true;
      } catch (err) {
        console.warn("Database operation failed. Falling back to mock user session.", err);
      }

      // Fallback user details if database is offline or user not found
      if (!user) {
        if (isDbOnline) {
          return res.status(404).json({ error: 'Account not found. Please register/signup first.' });
        }

        const lowerEmail = email.toLowerCase();
        let first = record.firstName || 'Stayzo';
        let last = record.lastName || 'User';
        let isAdmin = false;
        let isOwner = false;
        if (lowerEmail === 'adminstayzo@gmail.com' || lowerEmail === 'stayzoavp@gmail.com' || lowerEmail.startsWith('admin@')) {
          first = 'Admin';
          last = 'Stayzo';
          isAdmin = true;
        } else if (lowerEmail.includes('owner') || lowerEmail.includes('landlord')) {
          first = 'Owner';
          last = 'Stayzo';
          isOwner = true;
        }
        user = {
          id: 9999,
          email: email,
          firstName: first,
          lastName: last,
          isAdmin,
          isOwner,
          isTenant: false
        };
      }
      
      // Generate JWT Token
      const stayzo_token = jwt.sign(
        { 
          id: user?.id, 
          email: user?.email, 
          firstName: user?.firstName, 
          lastName: user?.lastName,
          isAdmin: user?.isAdmin || email.toLowerCase() === 'adminstayzo@gmail.com' || email.toLowerCase() === 'stayzoavp@gmail.com' || email.toLowerCase().startsWith('admin@'),
          isOwner: user?.isOwner,
          isTenant: user?.isTenant
        }, 
        process.env.JWT_SECRET || 'fallback_secret', 
        { expiresIn: '7d' }
      );
      
      const stayzo_refresh_token = jwt.sign(
        { id: user?.id, email: user?.email },
        process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
        { expiresIn: '7d' }
      );
      
      res.status(200).json({ 
        message: record.mode === 'signup' ? 'Signup successful' : 'Login successful',
        stayzo_token,
        stayzo_refresh_token,
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

// Profile image upload goes to AWS S3
const uploadProfileImageToS3 = (fileString: string) => uploadToS3(fileString, 'stayzo/users');

// Old S3 objects are left in place (no-op) – use S3 lifecycle rules or manual cleanup
const deleteOldProfileImage = async (_url: string) => { /* no-op: managed via S3 lifecycle */ };

export const updateProfile = async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { email, firstName, lastName, profileImage } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (authReq.user?.email?.toLowerCase() !== email?.toLowerCase() && !authReq.user?.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: You cannot modify another user\'s profile' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    let finalProfileImage = existingUser.profileImage;

    // Check if the frontend sent a new base64 image
    if (profileImage && profileImage.startsWith('data:image')) {
      // Remove old profile image from S3 (no-op; managed by S3 lifecycle rules)
      if (existingUser.profileImage) {
        await deleteOldProfileImage(existingUser.profileImage);
      }
      // Upload the new image to AWS S3
      finalProfileImage = await uploadProfileImageToS3(profileImage);
    }

    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        firstName: firstName || existingUser.firstName,
        lastName: lastName || existingUser.lastName,
        profileImage: finalProfileImage
      }
    });

    res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        profileImage: updatedUser.profileImage
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

export const getProfile = async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (authReq.user?.email?.toLowerCase() !== email?.toLowerCase() && !authReq.user?.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: You cannot view another user\'s profile' });
    }

    const userProfile = await prisma.user.findUnique({
      where: { email }
    });

    if (!userProfile) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [
      activeListings,
      ownerPendingVisits,
      ownerUnreadMessages,
      activeBookings,
      tenantPendingVisits,
      tenantUnreadMessages
    ] = await Promise.all([
      // Owner stats
      prisma.property.count({ where: { ownerId: userProfile.id } }),
      prisma.booking.count({ where: { property: { ownerId: userProfile.id }, status: 'PENDING' } }),
      prisma.chatMessage.count({ where: { thread: { ownerId: userProfile.id }, senderId: { not: userProfile.id }, isRead: false } }),
      // Tenant stats
      prisma.booking.count({ where: { tenantId: userProfile.id, status: 'CONFIRMED' } }),
      prisma.booking.count({ where: { tenantId: userProfile.id, status: 'PENDING' } }),
      prisma.chatMessage.count({ where: { thread: { tenantId: userProfile.id }, senderId: { not: userProfile.id }, isRead: false } })
    ]);

    res.status(200).json({
      user: {
        id: userProfile.id,
        email: userProfile.email,
        firstName: userProfile.firstName,
        lastName: userProfile.lastName,
        profileImage: userProfile.profileImage,
        nicFront: userProfile.nicFront,
        nicBack: userProfile.nicBack,
        isOwner: userProfile.isOwner,
        isTenant: userProfile.isTenant
      },
      stats: {
        owner: {
          activeListings,
          pendingVisits: ownerPendingVisits,
          unreadMessages: ownerUnreadMessages
        },
        tenant: {
          activeBookings,
          pendingVisits: tenantPendingVisits,
          unreadMessages: tenantUnreadMessages
        }
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        isAdmin: { not: true },
        email: {
          notIn: ['stayzoavp@gmail.com', 'adminstayzo@gmail.com']
        },
        NOT: {
          email: { startsWith: 'admin@' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(users);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const toggleVerifyUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { verified: !user.verified }
    });
    res.status(200).json(updated);
  } catch (error) {
    console.error('Failed to toggle verification:', error);
    res.status(500).json({ error: 'Failed to toggle verification' });
  }
};

export const toggleSuspendUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { status: user.status === 'Active' ? 'Suspended' : 'Active' }
    });
    res.status(200).json(updated);
  } catch (error) {
    console.error('Failed to toggle suspension:', error);
    res.status(500).json({ error: 'Failed to toggle suspension' });
  }
};

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const totalUsers = await prisma.user.count({
      where: {
        isAdmin: { not: true },
        email: {
          notIn: ['stayzoavp@gmail.com', 'adminstayzo@gmail.com']
        },
        NOT: {
          email: { startsWith: 'admin@' }
        }
      }
    });
    const pendingApprovals = await prisma.user.count({
      where: {
        isOwner: true,
        verified: false,
        isAdmin: { not: true },
        email: {
          notIn: ['stayzoavp@gmail.com', 'adminstayzo@gmail.com']
        },
        NOT: {
          email: { startsWith: 'admin@' }
        }
      }
    });
    const activeListings = await prisma.property.count();
    const pendingMessages = await prisma.contactMessage.count({
      where: { status: 'Unread' }
    });

    // Fetch transactions to compute monthly revenue
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    const transactions = await prisma.transaction.findMany({
      where: {
        status: { in: ['Cleared', 'Completed'] },
        createdAt: {
          gte: startOfYear,
          lte: endOfYear
        }
      },
      select: {
        amount: true,
        createdAt: true
      }
    });

    const monthlyRevenue = Array(12).fill(0);
    transactions.forEach(t => {
      const month = new Date(t.createdAt).getMonth();
      monthlyRevenue[month] += t.amount;
    });

    res.status(200).json({
      totalUsers,
      pendingApprovals,
      activeListings,
      pendingMessages,
      monthlyRevenue
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};
