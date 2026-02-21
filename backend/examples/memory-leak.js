// Memory Leak Example
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
  
  // Missing cleanup method!
  // destroy() {
  //   window.removeEventListener('resize', this.handleResize);
  //   clearInterval(this.intervalId);
  //   this.cache = [];
  //   this.listeners = [];
  // }
}

// Expected issues:
// - Event listener leak
// - Timer leak (setInterval)
// - Unbounded cache growth
// - Missing cleanup/destroy method

module.exports = { DataProcessor };
