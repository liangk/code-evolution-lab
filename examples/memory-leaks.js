// Example 1: Event listener without cleanup
function setupComponent() {
  const button = document.getElementById('myButton');
  button.addEventListener('click', handleClick);
  // Missing: removeEventListener in cleanup
}

// Example 2: Uncleaned setInterval
function startPolling() {
  setInterval(() => {
    fetchData();
  }, 5000);
  // Missing: clearInterval
}

// Example 3: Global variable assignment
function processData(data) {
  window.cachedData = data;
  // Global variable never cleaned up
}

// Example 4: Closure capturing large data
function createProcessor(largeDataArray) {
  return function process(item) {
    return largeDataArray.includes(item);
  };
}

// Example 5: Timer without cleanup
class Component {
  constructor() {
    this.timer = setTimeout(() => {
      this.doSomething();
    }, 1000);
    // Missing: clearTimeout in destructor
  }
}
