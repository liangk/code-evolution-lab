// React Memory Leak Example
// This component demonstrates common React memory leak patterns

import React, { useState, useEffect } from 'react';

interface User {
  id: string;
  name: string;
  status: string;
}

export function UserList() {
  const [users, setUsers] = useState<User[]>([]);
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
    // return () => {
    //   window.removeEventListener('online', handleOnline);
    //   window.removeEventListener('offline', handleOffline);
    //   clearInterval(intervalId);
    //   ws.close();
    // };
  }, []); // Empty dependency array - runs once
  
  const handleOnline = () => {
    console.log('Online');
  };
  
  const handleOffline = () => {
    console.log('Offline');
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
      <input 
        value={filter} 
        onChange={(e) => setFilter(e.target.value)} 
        placeholder="Filter users..."
      />
      <ul>
        {filteredUsers.map(user => (
          <li key={user.id}>{user.name} - {user.status}</li>
        ))}
      </ul>
    </div>
  );
}

// Expected issues:
// - Event listeners not removed in cleanup
// - setInterval not cleared
// - WebSocket not closed
// - Missing useEffect cleanup function
// - Inefficient filtering (should use useMemo)

export default UserList;
