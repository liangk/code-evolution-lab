export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/verify-email?token=${token}`;
  
  console.log(`[Mail Service] Verification email for ${email}`);
  console.log(`Verification URL: ${verificationUrl}`);
  
  // TODO: Implement actual email sending using your preferred service (e.g., SendGrid, Mailgun, etc.)
  // For now, just log the URL
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/reset-password?token=${token}`;
  
  console.log(`[Mail Service] Password reset email for ${email}`);
  console.log(`Reset URL: ${resetUrl}`);
  
  // TODO: Implement actual email sending using your preferred service
}
