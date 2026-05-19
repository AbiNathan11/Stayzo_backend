import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create reusable transporter object using SMTP transport
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // Use TLS, often bypasses network blocks on port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendOTPEmail = async (email: string, otp: string) => {
  try {
    const mailOptions = {
      from: `"Stayzo Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your Stayzo Login Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 30px; border: 1px solid #e0e0e0; border-radius: 10px;">
          <h2 style="color: #1A1A1A; margin-bottom: 20px;">Secure Login Request</h2>
          <p style="color: #555; font-size: 16px; line-height: 1.5;">
            You requested to log in to your Stayzo account. Use the following 6-digit code to complete your login securely. This code will expire in 10 minutes.
          </p>
          <div style="background-color: #FDF8F3; border: 2px dashed #F26B27; color: #F26B27; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 8px; margin: 30px 0;">
            ${otp}
          </div>
          <p style="color: #999; font-size: 13px; border-top: 1px solid #eee; padding-top: 20px;">
            If you didn't request this code, you can safely ignore this email. Someone else might have typed your email address by mistake.
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('OTP Email sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending OTP email:', error);
    return false;
  }
};
