// Mixed Performance Issues Example
// This code combines multiple performance problems in a realistic scenario

class UserDashboard {
  constructor() {
    this.cache = {};
    this.updateInterval = null;
  }
  
  async loadDashboard(userId) {
    // Issue 1: N+1 Query - Fetching user then related data separately
    const user = await db.user.findUnique({ where: { id: userId } });
    
    const posts = await db.post.findMany({ where: { userId } });
    const comments = await db.comment.findMany({ where: { userId } });
    const likes = await db.like.findMany({ where: { userId } });
    
    // Issue 2: Inefficient loop with await
    const enrichedPosts = [];
    for (const post of posts) {
      const postComments = await db.comment.findMany({
        where: { postId: post.id }
      });
      
      // Issue 3: Array lookup in loop
      const postLikes = likes.filter(like => like.postId === post.id);
      
      enrichedPosts.push({
        ...post,
        comments: postComments,
        likesCount: postLikes.length
      });
    }
    
    // Issue 4: Memory leak - interval never cleared
    this.updateInterval = setInterval(() => {
      this.cache[userId] = { timestamp: Date.now(), data: enrichedPosts };
    }, 5000);
    
    // Issue 5: Large payload - returning everything
    return {
      user,
      posts: enrichedPosts,
      comments,
      likes,
      stats: this.calculateStats(enrichedPosts)
    };
  }
  
  calculateStats(posts) {
    // Issue 6: Inefficient string concatenation in loop
    let summary = '';
    for (const post of posts) {
      summary += post.title + ', ';
    }
    
    return {
      totalPosts: posts.length,
      summary: summary
    };
  }
}

// Expected issues:
// - N+1 queries
// - Await in loop
// - Array operations in loop
// - Memory leak (setInterval)
// - Large payload
// - String concatenation in loop
// - Missing cleanup method

module.exports = { UserDashboard };
