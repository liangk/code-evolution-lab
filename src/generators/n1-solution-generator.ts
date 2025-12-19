import { BaseSolutionGenerator } from './base-generator';
import { Issue, Solution } from '../types';

export class N1SolutionGenerator extends BaseSolutionGenerator {
  name = 'N+1 Query Solution Generator';

  async generateSolutions(issue: Issue): Promise<Solution[]> {
    const solutions: Solution[] = [];

    const orm = this.detectORM(issue.codeBefore);

    if (orm === 'sequelize') {
      solutions.push(this.generateSequelizeEagerLoading(issue));
      solutions.push(this.generateSequelizeBatchQuery(issue));
    } else if (orm === 'prisma') {
      solutions.push(this.generatePrismaInclude(issue));
      solutions.push(this.generatePrismaSelect(issue));
    } else if (orm === 'mongoose') {
      solutions.push(this.generateMongoosePopulate(issue));
    }

    solutions.push(this.generateRawJoinQuery(issue));
    solutions.push(this.generateDataLoaderSolution(issue));

    return solutions.sort((a, b) => b.fitnessScore - a.fitnessScore);
  }

  private detectORM(code: string): string {
    if (code.includes('findAll') || code.includes('findByPk')) return 'sequelize';
    if (code.includes('prisma.')) return 'prisma';
    if (code.includes('.find(') || code.includes('.findOne(')) return 'mongoose';
    return 'unknown';
  }

  private generateSequelizeEagerLoading(issue: Issue): Solution {
    const code = `
// Before: N+1 Query Problem
const users = await User.findAll();
for (const user of users) {
  user.orders = await Order.findAll({ where: { userId: user.id } });
}

// After: Eager Loading with Include
const users = await User.findAll({
  include: [{
    model: Order,
    as: 'orders'
  }]
});

// Orders are now available as user.orders (no loop needed)
    `.trim();

    const fitnessScore = this.calculateFitnessScore(
      95, // High performance gain
      20, // Low complexity
      90, // High maintainability
      100 // Perfect compatibility with Sequelize
    );

    return this.createSolution(
      issue.id,
      1,
      'eager_loading',
      code,
      fitnessScore,
      'Use Sequelize include to load related data in a single query. This is the simplest and most maintainable solution for Sequelize.',
      15,
      'low'
    );
  }

  private generateSequelizeBatchQuery(issue: Issue): Solution {
    const code = `
// Before: N+1 Query Problem
const users = await User.findAll();
for (const user of users) {
  user.orders = await Order.findAll({ where: { userId: user.id } });
}

// After: Batch Query with IN clause
const users = await User.findAll();
const userIds = users.map(u => u.id);

const orders = await Order.findAll({
  where: { userId: userIds }
});

// Group orders by userId
const ordersByUser = orders.reduce((acc, order) => {
  if (!acc[order.userId]) acc[order.userId] = [];
  acc[order.userId].push(order);
  return acc;
}, {});

// Attach orders to users
users.forEach(user => {
  user.orders = ordersByUser[user.id] || [];
});
    `.trim();

    const fitnessScore = this.calculateFitnessScore(
      90, // High performance gain
      40, // Medium complexity
      75, // Good maintainability
      95 // Good compatibility
    );

    return this.createSolution(
      issue.id,
      2,
      'batch_query',
      code,
      fitnessScore,
      'Fetch all related records in a single query using IN clause, then manually group them. More flexible than eager loading.',
      30,
      'low'
    );
  }

  private generatePrismaInclude(issue: Issue): Solution {
    const code = `
// Before: N+1 Query Problem
const users = await prisma.user.findMany();
for (const user of users) {
  user.orders = await prisma.order.findMany({
    where: { userId: user.id }
  });
}

// After: Prisma Include
const users = await prisma.user.findMany({
  include: {
    orders: true
  }
});

// Orders are now available as user.orders
    `.trim();

    const fitnessScore = this.calculateFitnessScore(
      95, // High performance gain
      15, // Very low complexity
      95, // Excellent maintainability
      100 // Perfect compatibility with Prisma
    );

    return this.createSolution(
      issue.id,
      1,
      'prisma_include',
      code,
      fitnessScore,
      'Use Prisma include for type-safe eager loading. This is the recommended approach for Prisma.',
      10,
      'low'
    );
  }

  private generatePrismaSelect(issue: Issue): Solution {
    const code = `
// Before: N+1 Query Problem
const users = await prisma.user.findMany();
for (const user of users) {
  user.orders = await prisma.order.findMany({
    where: { userId: user.id }
  });
}

// After: Prisma Include with Select (optimized)
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    email: true,
    orders: {
      select: {
        id: true,
        total: true,
        createdAt: true
      }
    }
  }
});

// Only selected fields are loaded, reducing payload size
    `.trim();

    const fitnessScore = this.calculateFitnessScore(
      98, // Highest performance gain
      25, // Low-medium complexity
      90, // High maintainability
      100 // Perfect compatibility
    );

    return this.createSolution(
      issue.id,
      2,
      'prisma_select',
      code,
      fitnessScore,
      'Use Prisma include with select to load only required fields. Best performance and type safety.',
      20,
      'low'
    );
  }

  private generateMongoosePopulate(issue: Issue): Solution {
    const code = `
// Before: N+1 Query Problem
const users = await User.find();
for (const user of users) {
  user.orders = await Order.find({ userId: user._id });
}

// After: Mongoose Populate
const users = await User.find().populate('orders');

// Orders are now available as user.orders
    `.trim();

    const fitnessScore = this.calculateFitnessScore(
      90, // High performance gain
      20, // Low complexity
      85, // Good maintainability
      100 // Perfect compatibility with Mongoose
    );

    return this.createSolution(
      issue.id,
      1,
      'mongoose_populate',
      code,
      fitnessScore,
      'Use Mongoose populate to load referenced documents. Requires proper schema references.',
      15,
      'low'
    );
  }

  private generateRawJoinQuery(issue: Issue): Solution {
    const code = `
// Before: N+1 Query Problem
const users = await User.findAll();
for (const user of users) {
  user.orders = await Order.findAll({ where: { userId: user.id } });
}

// After: Raw SQL JOIN Query
const results = await sequelize.query(\`
  SELECT 
    u.id as user_id,
    u.name,
    u.email,
    json_agg(
      json_build_object(
        'id', o.id,
        'total', o.total,
        'createdAt', o.created_at
      )
    ) as orders
  FROM users u
  LEFT JOIN orders o ON o.user_id = u.id
  GROUP BY u.id, u.name, u.email
\`, { type: QueryTypes.SELECT });

// Results contain users with aggregated orders
    `.trim();

    const fitnessScore = this.calculateFitnessScore(
      100, // Maximum performance gain
      60, // High complexity
      60, // Medium maintainability
      95 // Good compatibility
    );

    return this.createSolution(
      issue.id,
      3,
      'raw_join',
      code,
      fitnessScore,
      'Use raw SQL JOIN for maximum performance. Best for complex queries and large datasets.',
      120,
      'medium'
    );
  }

  private generateDataLoaderSolution(issue: Issue): Solution {
    const code = `
// Install: npm install dataloader

// Create DataLoader
import DataLoader from 'dataloader';

const orderLoader = new DataLoader(async (userIds) => {
  const orders = await Order.findAll({
    where: { userId: userIds }
  });
  
  // Group orders by userId
  const ordersByUser = userIds.map(userId =>
    orders.filter(order => order.userId === userId)
  );
  
  return ordersByUser;
});

// Before: N+1 Query Problem
const users = await User.findAll();
for (const user of users) {
  user.orders = await Order.findAll({ where: { userId: user.id } });
}

// After: DataLoader Pattern
const users = await User.findAll();
const usersWithOrders = await Promise.all(
  users.map(async (user) => ({
    ...user.toJSON(),
    orders: await orderLoader.load(user.id)
  }))
);

// DataLoader automatically batches and caches requests
    `.trim();

    const fitnessScore = this.calculateFitnessScore(
      85, // Good performance gain
      80, // High complexity
      70, // Medium maintainability
      70 // Requires new dependency
    );

    return this.createSolution(
      issue.id,
      4,
      'dataloader',
      code,
      fitnessScore,
      'Use DataLoader for automatic batching and caching. Best for GraphQL APIs or complex data loading scenarios.',
      180,
      'high'
    );
  }
}
