# Code Evolution Lab - Example Files

This directory contains example code files that demonstrate various performance issues and anti-patterns. These examples are designed to be used with the Code Evolution Lab analyzer to showcase its detection and solution generation capabilities.

## Available Examples

### 1. N+1 Query Problem (`n-plus-1-query.js`)
**Issues Demonstrated:**
- Classic N+1 query pattern
- Sequential database queries in loop
- Performance degradation with scale

**Severity:** High  
**Best For:** Testing ORM optimization detection

---

### 2. Inefficient Loop (`inefficient-loop.js`)
**Issues Demonstrated:**
- Nested loops with O(n²) complexity
- Array lookups in loop
- Await in loop (sequential async operations)
- Missing data structure optimization

**Severity:** High  
**Best For:** Testing loop optimization detection

---

### 3. Memory Leak (`memory-leak.js`)
**Issues Demonstrated:**
- Event listeners not cleaned up
- setInterval not cleared
- Unbounded cache growth
- Missing cleanup/destroy method

**Severity:** Critical  
**Best For:** Testing memory leak detection

---

### 4. Large Payload (`large-payload.js`)
**Issues Demonstrated:**
- SELECT * anti-pattern
- Deep nested includes
- No pagination
- No field selection
- Unnecessarily large response sizes

**Severity:** Medium  
**Best For:** Testing API optimization detection

---

### 5. Mixed Issues (`mixed-issues.js`)
**Issues Demonstrated:**
- Multiple N+1 queries
- Await in loop
- Array operations in loop
- Memory leak (setInterval)
- Large payload
- String concatenation in loop

**Severity:** High  
**Best For:** Testing comprehensive analysis

---

### 6. React Memory Leak (`react-memory-leak.tsx`)
**Issues Demonstrated:**
- Event listeners not removed in useEffect cleanup
- setInterval not cleared
- WebSocket not closed
- Missing useEffect cleanup function
- Inefficient filtering without useMemo

**Severity:** High  
**Best For:** Testing React-specific detection

---

## How to Use

### Via Web Interface

1. Navigate to the dashboard at `http://localhost:8201`
2. Click on "Select Example" dropdown
3. Choose an example file
4. Click "Analyze Code"
5. Review detected issues and generated solutions

### Via CLI

```bash
# Analyze a specific example
npm run analyze examples/n-plus-1-query.js

# Analyze with solution generation
npm run analyze examples/inefficient-loop.js --solutions

# Analyze all examples
npm run analyze:examples
```

### Via API

```bash
# POST request with file content
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "code": "$(cat examples/n-plus-1-query.js)",
    "filePath": "examples/n-plus-1-query.js",
    "generateSolutions": true
  }'
```

---

## Expected Detection Results

### n-plus-1-query.js
- ✅ N+1 Query Detected (1 issue)
- ✅ Severity: High
- ✅ Solutions: Eager loading, DataLoader, batch queries

### inefficient-loop.js
- ✅ Nested Loop Detected (1 issue)
- ✅ Await in Loop (1 issue)
- ✅ Array Lookup in Loop (1 issue)
- ✅ Severity: High
- ✅ Solutions: Map/Set optimization, Promise.all, query batching

### memory-leak.js
- ✅ Event Listener Leak (1 issue)
- ✅ Timer Leak (1 issue)
- ✅ Unbounded Growth (1 issue)
- ✅ Severity: Critical
- ✅ Solutions: Cleanup methods, WeakMap, size limits

### large-payload.js
- ✅ Large Payload Detected (2 issues)
- ✅ No Pagination (2 issues)
- ✅ Severity: Medium
- ✅ Solutions: Field selection, pagination, streaming

### mixed-issues.js
- ✅ Multiple Issues (6+ issues)
- ✅ Severity: High
- ✅ Solutions: Comprehensive refactoring

### react-memory-leak.tsx
- ✅ React Lifecycle Issues (4 issues)
- ✅ Missing Cleanup (1 issue)
- ✅ Severity: High
- ✅ Solutions: useEffect cleanup, useMemo

---

## Adding New Examples

To add a new example file:

1. Create a new file in this directory
2. Add clear comments explaining the issues
3. Include "Expected issues:" comment section
4. Update this README with the new example
5. Add to the frontend example selector

### Example Template

```javascript
// [Issue Type] Example
// This code demonstrates [description]

// Your code here...

// Expected issues:
// - Issue 1 description
// - Issue 2 description
// - Severity level

module.exports = { /* exports */ };
```

---

## Testing Examples

Run the test suite to verify all examples are detected correctly:

```bash
npm run test:examples
```

This will:
1. Analyze each example file
2. Verify expected issues are detected
3. Check solution generation
4. Validate fitness scores

---

## Performance Benchmarks

| Example | File Size | Analysis Time | Issues Found | Solutions Generated |
|---------|-----------|---------------|--------------|---------------------|
| n-plus-1-query.js | 0.5 KB | ~50ms | 1 | 5 |
| inefficient-loop.js | 0.8 KB | ~80ms | 3 | 8 |
| memory-leak.js | 0.9 KB | ~70ms | 3 | 6 |
| large-payload.js | 1.2 KB | ~100ms | 4 | 7 |
| mixed-issues.js | 1.5 KB | ~150ms | 6 | 12 |
| react-memory-leak.tsx | 1.3 KB | ~120ms | 5 | 9 |

*Benchmarks run on: Node.js 18, 16GB RAM, M1 Mac*

---

## Contributing

When contributing new examples:

1. Focus on realistic, production-like code
2. Include multiple related issues when appropriate
3. Add comprehensive comments
4. Test with the analyzer before submitting
5. Update documentation

---

## License

These examples are part of Code Evolution Lab and are provided for educational purposes.

---

**Last Updated:** 2025-12-21
