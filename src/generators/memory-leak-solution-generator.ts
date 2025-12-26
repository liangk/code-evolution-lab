import { BaseSolutionGenerator } from './base-generator';
import { Issue, Solution, AnalysisContext } from '../types';

export class MemoryLeakSolutionGenerator extends BaseSolutionGenerator {
  name = 'Memory Leak Solution Generator';

  async generateSolutions(issue: Issue, _context?: AnalysisContext): Promise<Solution[]> {
    const solutions: Solution[] = [];
    const issueType = issue.type;

    // Route to specific solution generators based on issue type
    switch (issueType) {
      case 'event_listener_leak':
        solutions.push(...this.generateEventListenerSolutions(issue));
        break;
      case 'timer_leak':
        solutions.push(...this.generateTimerLeakSolutions(issue));
        break;
      case 'global_variable_leak':
        solutions.push(...this.generateGlobalVariableSolutions(issue));
        break;
      case 'closure_memory_leak':
        solutions.push(...this.generateClosureLeakSolutions(issue));
        break;
      default:
        solutions.push(...this.generateGenericMemoryLeakSolutions(issue));
    }

    // TODO: PLACEHOLDER FOR EVOLUTIONARY ALGORITHM
    // Future enhancement: Apply evolutionary algorithm to generate and evolve solutions
    // - Generate initial population from templates above
    // - Apply mutation operators (cleanup patterns, framework-specific variations)
    // - Apply crossover operators to combine cleanup strategies
    // - Evolve over multiple generations
    // - Return top N solutions based on fitness
    // See: src/generators/evolutionary-engine.ts (to be implemented)

    return solutions.sort((a, b) => b.fitnessScore - a.fitnessScore);
  }

  private generateEventListenerSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];
    const framework = (issue.estimatedImpact?.metrics?.framework as string) || 'none';

    // Solution 1: React useEffect cleanup
    if (framework === 'react' || framework === 'none') {
      solutions.push(this.createSolution(
        issue.id,
        1,
        'react_useeffect_cleanup',
        `// Before: Event listener without cleanup
useEffect(() => {
  window.addEventListener('resize', handleResize);
}, []);

// After: useEffect with cleanup function
useEffect(() => {
  const handleResize = () => {
    // Handle resize
  };
  
  window.addEventListener('resize', handleResize);
  
  // Cleanup function removes listener on unmount
  return () => {
    window.removeEventListener('resize', handleResize);
  };
}, []);

// Listener is automatically cleaned up when component unmounts`,
        this.calculateFitnessScore(98, 15, 98, framework === 'react' ? 100 : 80),
        'Use React useEffect cleanup function to automatically remove event listeners. This is the idiomatic React pattern.',
        10,
        'low'
      ));

      // Solution 2: React class component cleanup
      solutions.push(this.createSolution(
        issue.id,
        2,
        'react_class_cleanup',
        `// Before: Event listener without cleanup
class MyComponent extends React.Component {
  componentDidMount() {
    window.addEventListener('resize', this.handleResize);
  }
  
  handleResize = () => {
    // Handle resize
  }
}

// After: Remove listener in componentWillUnmount
class MyComponent extends React.Component {
  componentDidMount() {
    window.addEventListener('resize', this.handleResize);
  }
  
  componentWillUnmount() {
    window.removeEventListener('resize', this.handleResize);
  }
  
  handleResize = () => {
    // Handle resize
  }
}

// Cleanup happens automatically on unmount`,
        this.calculateFitnessScore(95, 20, 95, framework === 'react' ? 100 : 70),
        'Use componentWillUnmount lifecycle method for cleanup in React class components.',
        15,
        'low'
      ));
    }

    // Solution 3: Vue cleanup
    if (framework === 'vue' || framework === 'none') {
      solutions.push(this.createSolution(
        issue.id,
        framework === 'vue' ? 1 : 3,
        'vue_cleanup',
        `// Before: Event listener without cleanup
export default {
  mounted() {
    window.addEventListener('resize', this.handleResize);
  },
  methods: {
    handleResize() {
      // Handle resize
    }
  }
}

// After: Remove listener in beforeUnmount (Vue 3) or beforeDestroy (Vue 2)
export default {
  mounted() {
    window.addEventListener('resize', this.handleResize);
  },
  beforeUnmount() {  // Use beforeDestroy in Vue 2
    window.removeEventListener('resize', this.handleResize);
  },
  methods: {
    handleResize() {
      // Handle resize
    }
  }
}

// Cleanup happens on component destruction`,
        this.calculateFitnessScore(95, 20, 95, framework === 'vue' ? 100 : 70),
        'Use beforeUnmount (Vue 3) or beforeDestroy (Vue 2) lifecycle hook for cleanup.',
        15,
        'low'
      ));
    }

    // Solution 4: Angular cleanup
    if (framework === 'angular' || framework === 'none') {
      solutions.push(this.createSolution(
        issue.id,
        framework === 'angular' ? 1 : 4,
        'angular_cleanup',
        `// Before: Event listener without cleanup
export class MyComponent implements OnInit {
  ngOnInit() {
    window.addEventListener('resize', this.handleResize);
  }
  
  handleResize = () => {
    // Handle resize
  }
}

// After: Implement OnDestroy and clean up
export class MyComponent implements OnInit, OnDestroy {
  ngOnInit() {
    window.addEventListener('resize', this.handleResize);
  }
  
  ngOnDestroy() {
    window.removeEventListener('resize', this.handleResize);
  }
  
  handleResize = () => {
    // Handle resize
  }
}

// Angular calls ngOnDestroy automatically`,
        this.calculateFitnessScore(95, 20, 95, framework === 'angular' ? 100 : 70),
        'Implement OnDestroy interface and use ngOnDestroy lifecycle hook for cleanup in Angular.',
        15,
        'low'
      ));
    }

    // Solution 5: AbortController (modern approach)
    solutions.push(this.createSolution(
      issue.id,
      5,
      'abort_controller',
      `// Before: Manual listener management
const controller = new AbortController();

element.addEventListener('click', handleClick);
// Need to remember to remove later

// After: Use AbortController for automatic cleanup
const controller = new AbortController();

element.addEventListener('click', handleClick, {
  signal: controller.signal
});

// Later, abort all listeners at once:
controller.abort();

// All listeners with this signal are automatically removed`,
      this.calculateFitnessScore(92, 25, 90, 95),
      'Use AbortController for modern, declarative event listener management. Allows removing multiple listeners at once.',
      20,
      'low'
    ));

    return solutions;
  }

  private generateTimerLeakSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];
    const framework = (issue.estimatedImpact?.metrics?.framework as string) || 'none';

    // Solution 1: React useEffect cleanup for timers
    if (framework === 'react' || framework === 'none') {
      solutions.push(this.createSolution(
        issue.id,
        1,
        'react_timer_cleanup',
        `// Before: Timer without cleanup
useEffect(() => {
  const intervalId = setInterval(() => {
    fetchData();
  }, 5000);
}, []);

// After: Clear timer in cleanup function
useEffect(() => {
  const intervalId = setInterval(() => {
    fetchData();
  }, 5000);
  
  return () => {
    clearInterval(intervalId);
  };
}, []);

// Timer is cleared when component unmounts`,
        this.calculateFitnessScore(98, 15, 98, framework === 'react' ? 100 : 80),
        'Store timer ID and clear it in useEffect cleanup function. This is the standard React pattern for timers.',
        10,
        'low'
      ));
    }

    // Solution 2: Class-based timer with cleanup method
    solutions.push(this.createSolution(
      issue.id,
      2,
      'class_timer_cleanup',
      `// Store ID and provide cleanup method
class DataFetcher {
  constructor() {
    this.intervalId = setInterval(() => {
      this.fetchData();
    }, 5000);
  }
  
  fetchData() {
    // Fetch data
  }
  
  destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// Call destroy() when done
const fetcher = new DataFetcher();
// Later...
fetcher.destroy();`,
      this.calculateFitnessScore(95, 20, 90, 100),
      'Store timer ID as instance property and provide explicit cleanup method. Works in any framework or vanilla JS.',
      15,
      'low'
    ));

    // Solution 3: Timeout with cancellation token
    solutions.push(this.createSolution(
      issue.id,
      3,
      'timeout_cancellation',
      `// Return cancellation function
function scheduleTask() {
  const timeoutId = setTimeout(() => {
    performTask();
  }, 5000);
  
  // Return cancellation function
  return () => clearTimeout(timeoutId);
}

// Usage:
const cancel = scheduleTask();
// If needed, cancel the task:
cancel();`,
      this.calculateFitnessScore(92, 20, 95, 100),
      'Return a cancellation function from timer-creating functions. Provides clean API for cleanup.',
      15,
      'low'
    ));

    // Solution 4: Timer manager utility
    solutions.push(this.createSolution(
      issue.id,
      4,
      'timer_manager',
      `// Create a timer manager utility
class TimerManager {
  constructor() {
    this.timers = new Set();
  }
  
  setInterval(callback, delay) {
    const id = setInterval(callback, delay);
    this.timers.add({ type: 'interval', id });
    return id;
  }
  
  setTimeout(callback, delay) {
    const id = setTimeout(callback, delay);
    this.timers.add({ type: 'timeout', id });
    return id;
  }
  
  clearAll() {
    this.timers.forEach(timer => {
      if (timer.type === 'interval') {
        clearInterval(timer.id);
      } else {
        clearTimeout(timer.id);
      }
    });
    this.timers.clear();
  }
}

// Usage:
const timers = new TimerManager();
timers.setInterval(() => fetchData(), 5000);
timers.setTimeout(() => showNotification(), 3000);

// Clean up all timers at once:
timers.clearAll();`,
      this.calculateFitnessScore(88, 35, 85, 95),
      'Create a timer manager utility to track and clean up multiple timers at once. Useful for complex components.',
      30,
      'medium'
    ));

    return solutions;
  }

  private generateGlobalVariableSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];

    // Solution 1: Use module scope instead of global
    solutions.push(this.createSolution(
      issue.id,
      1,
      'module_scope',
      `// Before: Global variable
window.myData = fetchData();

// After: Module-scoped variable
let myData = null;

export function initializeData() {
  myData = fetchData();
}

export function getData() {
  return myData;
}

export function cleanup() {
  myData = null;
}

// Data is scoped to module, not global`,
      this.calculateFitnessScore(95, 15, 98, 100),
      'Use module-scoped variables instead of globals. Provides better encapsulation and easier cleanup.',
      10,
      'low'
    ));

    // Solution 2: Singleton pattern with cleanup
    solutions.push(this.createSolution(
      issue.id,
      2,
      'singleton_cleanup',
      `// Before: Global state
window.appState = {
  user: null,
  settings: {}
};

// After: Singleton with cleanup
class AppState {
  private static instance: AppState;
  private user = null;
  private settings = {};
  
  static getInstance() {
    if (!AppState.instance) {
      AppState.instance = new AppState();
    }
    return AppState.instance;
  }
  
  setUser(user) {
    this.user = user;
  }
  
  cleanup() {
    this.user = null;
    this.settings = {};
  }
  
  static reset() {
    if (AppState.instance) {
      AppState.instance.cleanup();
      AppState.instance = null;
    }
  }
}

// Usage:
const state = AppState.getInstance();
state.setUser(user);

// Cleanup:
AppState.reset();`,
      this.calculateFitnessScore(90, 30, 85, 95),
      'Use singleton pattern with explicit cleanup method. Provides controlled access and cleanup.',
      25,
      'low'
    ));

    // Solution 3: Context/Provider pattern
    solutions.push(this.createSolution(
      issue.id,
      3,
      'context_provider',
      `// Before: Global state
window.userData = null;

// After: React Context (or similar pattern in other frameworks)
const UserContext = React.createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  
  return (
    <UserContext.Provider value={{ user, setUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

// Usage in component:
function MyComponent() {
  const { user, setUser } = useUser();
  // Use user data
}

// Automatically cleaned up when provider unmounts`,
      this.calculateFitnessScore(92, 25, 95, 90),
      'Use framework-specific context/provider patterns. Automatic cleanup and better integration with component lifecycle.',
      20,
      'low'
    ));

    return solutions;
  }

  private generateClosureLeakSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];

    // Solution 1: WeakMap for large data
    solutions.push(this.createSolution(
      issue.id,
      1,
      'weak_map',
      `// Before: Closure captures large data
const largeData = fetchLargeDataset(); // 100MB

function createProcessor() {
  return function process(id) {
    return largeData.find(item => item.id === id);
  };
}

const processor = createProcessor();
// largeData is kept in memory even if not needed

// After: Use WeakMap for automatic garbage collection
const dataCache = new WeakMap();

function createProcessor(data) {
  const key = {};
  dataCache.set(key, data);
  
  return function process(id) {
    const data = dataCache.get(key);
    return data?.find(item => item.id === id);
  };
}

const largeData = fetchLargeDataset();
const processor = createProcessor(largeData);
// When largeData is no longer referenced, it can be garbage collected`,
      this.calculateFitnessScore(90, 40, 80, 90),
      'Use WeakMap to allow garbage collection of large objects. The data can be freed when no longer needed.',
      30,
      'medium'
    ));

    // Solution 2: Limit closure scope
    solutions.push(this.createSolution(
      issue.id,
      2,
      'limit_scope',
      `// Before: Closure captures entire large object
const largeObject = {
  data: new Array(1000000),
  metadata: { /* ... */ },
  config: { /* ... */ }
};

function createHandler() {
  return function handle() {
    console.log(largeObject.metadata.name);
  };
}

// After: Only capture what's needed
const largeObject = {
  data: new Array(1000000),
  metadata: { /* ... */ },
  config: { /* ... */ }
};

function createHandler() {
  const name = largeObject.metadata.name; // Extract only what's needed
  
  return function handle() {
    console.log(name);
  };
}

// Closure only captures 'name', not entire largeObject`,
      this.calculateFitnessScore(95, 15, 95, 100),
      'Extract only the data you need before creating the closure. Prevents capturing large objects unnecessarily.',
      10,
      'low'
    ));

    // Solution 3: Explicit cleanup method
    solutions.push(this.createSolution(
      issue.id,
      3,
      'explicit_cleanup',
      `// Before: No way to release captured data
function createCache() {
  const cache = new Map();
  
  return {
    set: (key, value) => cache.set(key, value),
    get: (key) => cache.get(key)
  };
}

const myCache = createCache();
// No way to clear the cache

// After: Provide cleanup method
function createCache() {
  let cache = new Map();
  
  return {
    set: (key, value) => cache.set(key, value),
    get: (key) => cache.get(key),
    clear: () => {
      cache.clear();
      cache = null; // Allow garbage collection
    }
  };
}

const myCache = createCache();
// Later, when done:
myCache.clear();`,
      this.calculateFitnessScore(92, 20, 90, 100),
      'Provide explicit cleanup method to release captured data. Gives users control over memory management.',
      15,
      'low'
    ));

    return solutions;
  }

  private generateGenericMemoryLeakSolutions(issue: Issue): Solution[] {
    const solutions: Solution[] = [];

    solutions.push(this.createSolution(
      issue.id,
      1,
      'generic_cleanup',
      `// Generic cleanup pattern
class ResourceManager {
  constructor() {
    this.resources = [];
  }
  
  addResource(resource, cleanup) {
    this.resources.push({ resource, cleanup });
    return resource;
  }
  
  cleanup() {
    this.resources.forEach(({ cleanup }) => cleanup());
    this.resources = [];
  }
}

// Usage:
const manager = new ResourceManager();

manager.addResource(
  element.addEventListener('click', handler),
  () => element.removeEventListener('click', handler)
);

manager.addResource(
  setInterval(callback, 1000),
  (id) => clearInterval(id)
);

// Clean up all resources:
manager.cleanup();`,
      this.calculateFitnessScore(85, 30, 85, 95),
      'Generic resource manager pattern for tracking and cleaning up multiple resources.',
      25,
      'medium'
    ));

    return solutions;
  }
}
