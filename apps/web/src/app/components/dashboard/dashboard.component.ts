import { Component, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalysisService, AnalysisRequest, AnalysisResult } from '../../services/analysis.service';
import { EvolutionProgressComponent } from '../evolution-progress/evolution-progress.component';

interface ExampleFile {
  id: string;
  name: string;
  description: string;
  fileName: string;
  code: string;
  severity: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, EvolutionProgressComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  @ViewChild(EvolutionProgressComponent) evolutionProgress!: EvolutionProgressComponent;
  
  code = signal('');
  filePath = signal('example.js');
  generateSolutions = signal(true);
  analyzing = signal(false);
  result = signal<AnalysisResult | null>(null);
  error = signal<string | null>(null);
  selectedExample = signal<string>('');
  showEvolutionProgress = signal(false);
  
  examples: ExampleFile[] = [
    {
      id: 'n-plus-1',
      name: 'N+1 Query Problem',
      description: 'Classic N+1 query pattern with sequential database queries',
      fileName: 'n-plus-1-query.js',
      severity: 'High',
      code: `// N+1 Query Problem Example
// This code demonstrates a classic N+1 query issue where
// we fetch users and then make separate queries for each user's posts

const prisma = require('@prisma/client').PrismaClient;
const db = new prisma();

async function getUsersWithPosts() {
  // First query: Get all users
  const users = await db.user.findMany();
  
  // N additional queries: Get posts for each user (N+1 problem!)
  for (const user of users) {
    const posts = await db.post.findMany({
      where: { userId: user.id }
    });
    user.posts = posts;
  }
  
  return users;
}

// Expected issues:
// - N+1 query detected
// - Performance degradation with large datasets
// - Database connection overhead

module.exports = { getUsersWithPosts };`
    },
    {
      id: 'inefficient-loop',
      name: 'Inefficient Loop',
      description: 'Multiple loop inefficiencies including array lookups and nested loops',
      fileName: 'inefficient-loop.js',
      severity: 'High',
      code: `// Inefficient Loop Example
// This code demonstrates multiple loop inefficiencies including
// array lookups, nested loops, and repeated operations

async function processUserOrders(users, orders) {
  const results = [];
  
  // Inefficient: Array.includes() in loop - O(n*m)
  for (const user of users) {
    const userOrders = [];
    for (const order of orders) {
      if (order.userId === user.id) {
        userOrders.push(order);
      }
    }
    
    // Inefficient: Repeated database queries in loop
    for (const order of userOrders) {
      const product = await db.product.findUnique({
        where: { id: order.productId }
      });
      order.productDetails = product;
    }
    
    results.push({
      user,
      orders: userOrders
    });
  }
  
  return results;
}

// Expected issues:
// - Nested loops with O(n²) complexity
// - Array lookups in loop
// - Await in loop (sequential database queries)
// - Should use Map/Set for lookups
// - Should batch database queries

module.exports = { processUserOrders };`
    },
    {
      id: 'memory-leak',
      name: 'Memory Leak',
      description: 'Event listeners and timers not being cleaned up',
      fileName: 'memory-leak.js',
      severity: 'Critical',
      code: `// Memory Leak Example
// This code demonstrates common memory leak patterns including
// event listeners not being cleaned up and global references

class DataProcessor {
  constructor() {
    this.cache = [];
    this.listeners = [];
    
    // Memory leak: Event listener never removed
    window.addEventListener('resize', this.handleResize.bind(this));
    
    // Memory leak: setInterval never cleared
    this.intervalId = setInterval(() => {
      this.updateData();
    }, 1000);
  }
  
  handleResize() {
    console.log('Window resized');
  }
  
  updateData() {
    // Memory leak: Unbounded array growth
    this.cache.push({
      timestamp: Date.now(),
      data: new Array(1000).fill('data')
    });
  }
  
  addListener(callback) {
    // Memory leak: Listeners never removed
    this.listeners.push(callback);
  }
}

// Expected issues:
// - Event listener leak
// - Timer leak (setInterval)
// - Unbounded cache growth
// - Missing cleanup/destroy method

module.exports = { DataProcessor };`
    },
    {
      id: 'large-payload',
      name: 'Large Payload',
      description: 'Inefficient data fetching with unnecessarily large payloads',
      fileName: 'large-payload.js',
      severity: 'Medium',
      code: `// Large Payload Example
// This code demonstrates inefficient data fetching patterns
// that return unnecessarily large payloads

const express = require('express');
const router = express.Router();

// Inefficient: Returns all fields for all users
router.get('/api/users', async (req, res) => {
  const users = await db.user.findMany({
    include: {
      posts: {
        include: {
          comments: {
            include: {
              author: true,
              likes: true
            }
          },
          likes: true,
          tags: true
        }
      },
      followers: true,
      following: true,
      profile: true,
      settings: true
    }
  });
  
  return res.json(users);
});

// Expected issues:
// - SELECT * anti-pattern
// - Deep nested includes
// - No pagination
// - No field selection
// - Large response size

module.exports = router;`
    },
    {
      id: 'mixed-issues',
      name: 'Mixed Issues',
      description: 'Combination of multiple performance problems',
      fileName: 'mixed-issues.js',
      severity: 'High',
      code: `// Mixed Performance Issues Example
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
    
    return {
      user,
      posts: enrichedPosts,
      comments,
      likes
    };
  }
}

// Expected issues:
// - N+1 queries
// - Await in loop
// - Array operations in loop
// - Memory leak (setInterval)
// - Large payload

module.exports = { UserDashboard };`
    },
    {
      id: 'react-memory-leak',
      name: 'React Memory Leak',
      description: 'React component with missing useEffect cleanup',
      fileName: 'react-memory-leak.tsx',
      severity: 'High',
      code: `// React Memory Leak Example
// This component demonstrates common React memory leak patterns

import React, { useState, useEffect } from 'react';

export function UserList() {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('');
  
  useEffect(() => {
    // Memory leak: Event listener not cleaned up
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Memory leak: setInterval not cleared
    const intervalId = setInterval(() => {
      fetchUsers();
    }, 5000);
    
    // Memory leak: WebSocket not closed
    const ws = new WebSocket('ws://localhost:3000');
    ws.onmessage = (event) => {
      const user = JSON.parse(event.data);
      setUsers(prev => [...prev, user]);
    };
    
    fetchUsers();
    
    // Missing cleanup!
  }, []);
  
  const handleOnline = () => {
    console.log('Online');
  };
  
  const fetchUsers = async () => {
    const response = await fetch('/api/users');
    const data = await response.json();
    setUsers(data);
  };
  
  // Inefficient: Filter runs on every render
  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(filter.toLowerCase())
  );
  
  return (
    <div>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} />
      <ul>
        {filteredUsers.map(user => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
    </div>
  );
}

// Expected issues:
// - Event listeners not removed
// - setInterval not cleared
// - WebSocket not closed
// - Missing useEffect cleanup

export default UserList;`
    }
  ];
  
  constructor(private analysisService: AnalysisService) {}

  analyzeCode() {
    if (!this.code().trim()) {
      this.error.set('Please enter code to analyze');
      return;
    }

    this.analyzing.set(true);
    this.error.set(null);
    this.result.set(null);
    this.showEvolutionProgress.set(true);
    
    // Reset evolution progress display
    if (this.evolutionProgress) {
      this.evolutionProgress.reset();
    }

    const request: AnalysisRequest = {
      code: this.code(),
      filePath: this.filePath(),
      generateSolutions: this.generateSolutions()
    };

    // Use SSE-enabled analysis with progress tracking
    const { sessionId, result$ } = this.analysisService.analyzeCodeWithProgress(request);
    console.log('Started analysis with session:', sessionId);

    result$.subscribe({
      next: (result) => {
        console.log('Analysis result received:', result);
        this.result.set(result);
        this.analyzing.set(false);
        // Disconnect SSE after analysis complete
        this.analysisService.disconnectFromEvolutionProgress();
      },
      error: (err) => {
        console.error('Analysis error:', err);
        this.error.set(err.error?.message || 'Analysis failed');
        this.analyzing.set(false);
        this.analysisService.disconnectFromEvolutionProgress();
      }
    });
  }

  loadExample(exampleId?: string) {
    const id = exampleId || this.selectedExample() || 'n-plus-1';
    const example = this.examples.find(ex => ex.id === id);
    
    if (example) {
      this.code.set(example.code);
      this.filePath.set(example.fileName);
      this.selectedExample.set(example.id);
    }
  }

  clearResults() {
    this.result.set(null);
    this.error.set(null);
  }
}
