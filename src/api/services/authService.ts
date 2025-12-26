import bcrypt from 'bcrypt';
import prisma from '../prisma';

export async function createUser(
  email: string,
  password: string,
  name: string | undefined,
  role: 'customer' | 'tuner'
) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.authProvider) {
      const err: any = new Error(
        `This email is already registered with ${existing.authProvider}. Please login with ${existing.authProvider} instead.`
      );
      err.status = 409;
      err.code = 'SOCIAL_LOGIN_REQUIRED';
      throw err;
    }
    const err: any = new Error('Email is already registered');
    err.status = 409;
    throw err;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  
  // Create user and related profile in a transaction
  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        password: passwordHash,
        name,
        userType: role === 'tuner' ? 'TUNER' : 'CUSTOMER',
      },
      select: { id: true, email: true, name: true, createdAt: true, userType: true },
    });

    // Create related profile based on user type
    if (role === 'tuner') {
      await tx.tunerProfile.create({
        data: {
          userId: user.id,
          businessName: '',
          businessDescription: '',
          certifications: [],
          specializations: [],
          servicePostcodes: [],
          credentialsDocuments: [],
        },
      });
    } else {
      await tx.customerProfile.create({
        data: {
          userId: user.id,
        },
      });
    }

    return user;
  });
}

export async function validateUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.password || '');
  if (!valid) return null;
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

export async function getUserById(id: string, includePassword = false) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      createdAt: true,
      avatarUrl: true,
      globalRole: {
        select: {
          id: true,
          name: true,
          permissions: true,
        },
      },
      ...(includePassword && { password: true }),
    },
  });
}

export async function isEmailTaken(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return !!user;
}
