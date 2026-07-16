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

export const sendReplyEmail = async (toEmail: string, originalSubject: string, replyMessage: string, originalMessage: string) => {
  try {
    const mailOptions = {
      from: `"Stayzo Admin Support" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `Re: ${originalSubject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #1A1A1A;">
          <h3 style="color: #1A1A1A; margin-bottom: 20px;">Stayzo Admin Support Reply</h3>
          <p style="font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${replyMessage}</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 13px; color: #777;">
            <p><strong>Original Message Inquired:</strong></p>
            <blockquote style="margin: 0 0 0 10px; padding-left: 10px; border-left: 3px solid #ccc; font-style: italic;">
              ${originalMessage}
            </blockquote>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Reply Email sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending reply email:', error);
    return false;
  }
};

export const sendBookingRequestEmail = async (ownerEmail: string, ownerName: string, tenantName: string, propertyTitle: string) => {
  try {
    const mailOptions = {
      from: `"Stayzo Support" <${process.env.EMAIL_USER}>`,
      to: ownerEmail,
      subject: 'New Booking Request - Stayzo',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #1A1A1A;">
          <h3 style="color: #1A1A1A; margin-bottom: 20px;">New Booking Request</h3>
          <p style="font-size: 15px; line-height: 1.6;">Hello ${ownerName},</p>
          <p style="font-size: 15px; line-height: 1.6;">
            The tenant <strong>${tenantName}</strong> has requested to book your property <strong>${propertyTitle}</strong>.
          </p>
          <p style="font-size: 15px; line-height: 1.6;">
            Please log in to your dashboard to view the request details and manage the booking.
          </p>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 13px; color: #777;">
            <p>Thank you,<br/>Stayzo Team</p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Booking Request Email sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending booking request email:', error);
    return false;
  }
};

export const sendBrokerAgreementEmail = async (ownerEmail: string, propertyAddress: string, brokerName: string, brokerAgreementLink: string) => {
  try {
    const mailOptions = {
      from: `"Stayzo Support" <${process.env.EMAIL_USER}>`,
      to: ownerEmail,
      subject: 'Action Required: Property Listing via Broker - Stayzo',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #1A1A1A;">
          <h3 style="color: #1A1A1A; margin-bottom: 20px;">Broker Listing Agreement Required</h3>
          <p style="font-size: 15px; line-height: 1.6;">Hello,</p>
          <p style="font-size: 15px; line-height: 1.6;">
            A broker named <strong>${brokerName}</strong> has listed your property located at <strong>${propertyAddress}</strong>.
          </p>
          <p style="font-size: 15px; line-height: 1.6;">
            To approve this listing and allow it to go live on Stayzo, please click the link below to verify your identity and agree to the listing:
          </p>
          <a href="${brokerAgreementLink}" style="display: inline-block; padding: 10px 20px; background-color: #4F46E5; color: #fff; text-decoration: none; border-radius: 5px; margin-top: 10px; margin-bottom: 20px;">Review and Agree</a>
          <p style="font-size: 15px; line-height: 1.6;">
            If you did not authorize this listing, please ignore this email or contact support.
          </p>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 13px; color: #777;">
            <p>Thank you,<br/>Stayzo Team</p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Broker Agreement Email sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending broker agreement email:', error);
    return false;
  }
};
